import { prisma } from '../../lib/prisma.js';
import { MODULE } from '../../lib/modules.js';

/** Proje gruplaması şimdilik yalnız üretim planlamada. */
export const PROJECT_MODULES = [MODULE.URETIM];

const fail = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const projectSelect = {
  id: true,
  moduleId: true,
  code: true,
  name: true,
  isDefault: true,
  isActive: true,
  createdAt: true,
};

export const usesProjects = (moduleId) => PROJECT_MODULES.includes(moduleId || MODULE.URETIM);

/** ADMIN istediği birimi seçer; personel yalnız kendi birimini görür. */
const resolveActorModule = (actor, requested) => {
  if (actor?.role === 'ADMIN') return requested || MODULE.URETIM;
  if (actor?.role !== 'PURCHASING') throw fail('Projelere erişim yetkiniz yok.', 403);
  return actor.moduleId || MODULE.URETIM;
};

const assertManageable = (actor, moduleId) => {
  if (!usesProjects(moduleId)) throw fail('Bu birimde proje gruplaması kullanılmıyor.', 403);
  if (actor?.role === 'ADMIN') return;
  if (actor?.role === 'PURCHASING' && (actor.moduleId || MODULE.URETIM) === moduleId) return;
  throw fail('Bu projeyi düzenleme yetkiniz yok.', 403);
};

const cleanCode = (value) => {
  const code = String(value ?? '').trim().replace(/\s+/g, ' ');
  return code ? code.slice(0, 40) : null;
};

const cleanName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);

export const ensureDefaultProject = async (moduleId) => {
  const existing = await prisma.procurementProject.findFirst({
    where: { moduleId, isDefault: true },
    select: projectSelect,
  });
  if (existing) return existing;
  return prisma.procurementProject.create({
    data: { moduleId, name: 'Genel', isDefault: true },
    select: projectSelect,
  });
};

export const list = async (actor, { moduleId: requestedModule, includeInactive } = {}) => {
  const moduleId = resolveActorModule(actor, requestedModule);
  if (!usesProjects(moduleId)) return [];
  await ensureDefaultProject(moduleId);
  const rows = await prisma.procurementProject.findMany({
    where: { moduleId, ...(includeInactive ? {} : { isActive: true }) },
    select: { ...projectSelect, _count: { select: { requests: true } } },
    orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { code: 'desc' }, { name: 'asc' }],
  });
  return rows.map(({ _count, ...p }) => ({ ...p, requestCount: _count.requests }));
};

const assertCodeFree = async (moduleId, code, exceptId = null) => {
  if (!code) return;
  const clash = await prisma.procurementProject.findFirst({
    where: { moduleId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw fail(`${code} kodlu proje zaten var (${clash.name}).`, 409);
};

export const create = async (data, actor) => {
  const moduleId = resolveActorModule(actor, data.moduleId);
  assertManageable(actor, moduleId);
  const name = cleanName(data.name);
  const code = cleanCode(data.code);
  if (!name) throw fail('Proje adı zorunludur.');
  await assertCodeFree(moduleId, code);
  return prisma.procurementProject.create({
    data: { moduleId, name, code, createdById: actor?.id || null },
    select: projectSelect,
  });
};

export const update = async (id, data, actor) => {
  const project = await prisma.procurementProject.findUnique({ where: { id } });
  if (!project) throw fail('Proje bulunamadı.', 404);
  assertManageable(actor, project.moduleId);

  const patch = {};
  if (data.name !== undefined) {
    const name = cleanName(data.name);
    if (!name) throw fail('Proje adı zorunludur.');
    patch.name = name;
  }
  if (data.code !== undefined && !project.isDefault) {
    patch.code = cleanCode(data.code);
    await assertCodeFree(project.moduleId, patch.code, id);
  }
  if (data.isActive !== undefined) {
    if (project.isDefault && data.isActive === false) throw fail('Genel proje kapatılamaz.');
    patch.isActive = Boolean(data.isActive);
  }
  return prisma.procurementProject.update({ where: { id }, data: patch, select: projectSelect });
};

/** Boş ve varsayılan olmayan proje silinir; talebi olan proje silinmez, kapatılır. */
export const remove = async (id, actor) => {
  const project = await prisma.procurementProject.findUnique({
    where: { id },
    include: { _count: { select: { requests: true } } },
  });
  if (!project) throw fail('Proje bulunamadı.', 404);
  assertManageable(actor, project.moduleId);
  if (project.isDefault) throw fail('Genel proje silinemez.');
  if (project._count.requests > 0) {
    throw fail('Bu projede talepler var; silmek yerine projeyi kapatın veya talepleri taşıyın.', 409);
  }
  await prisma.procurementProject.delete({ where: { id } });
  return { deleted: true };
};

/**
 * Talep oluşturma / güncellemede proje alanını çözer.
 * Proje kullanmayan birimde her zaman null; üretimde boş seçim "Genel" olur.
 */
export const resolveRequestProjectId = async (moduleId, projectId, { allowInactiveId = null } = {}) => {
  if (!usesProjects(moduleId)) return null;
  if (!projectId) return (await ensureDefaultProject(moduleId)).id;
  const project = await prisma.procurementProject.findUnique({
    where: { id: projectId },
    select: { id: true, moduleId: true, isActive: true },
  });
  if (!project || project.moduleId !== moduleId) throw fail('Seçilen proje bu birime ait değil.', 400);
  if (!project.isActive && project.id !== allowInactiveId) throw fail('Seçilen proje kapalı.', 400);
  return project.id;
};

export const moveRequests = async (projectId, requestIds, actor) => {
  const project = await prisma.procurementProject.findUnique({ where: { id: projectId } });
  if (!project) throw fail('Proje bulunamadı.', 404);
  assertManageable(actor, project.moduleId);
  if (!project.isActive) throw fail('Kapalı projeye talep taşınamaz.');
  const ids = [...new Set((Array.isArray(requestIds) ? requestIds : []).filter(Boolean).map(String))];
  if (!ids.length) throw fail('Taşınacak talep seçilmedi.');
  if (ids.length > 500) throw fail('Tek seferde en fazla 500 talep taşınabilir.');
  const result = await prisma.procurementRequest.updateMany({
    where: { id: { in: ids }, moduleId: project.moduleId },
    data: { projectId },
  });
  return { moved: result.count };
};
