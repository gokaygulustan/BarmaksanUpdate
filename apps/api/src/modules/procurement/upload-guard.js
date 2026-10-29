import fs from 'fs/promises';
import path from 'path';

const listedFiles = (req) => {
  const files = [];
  if (Array.isArray(req?.files)) files.push(...req.files);
  else if (req?.files && typeof req.files === 'object') {
    for (const group of Object.values(req.files)) {
      if (Array.isArray(group)) files.push(...group);
    }
  }
  if (req?.file) files.push(req.file);
  return files.filter((file) => file?.path);
};

/** Reddedilen yüklemenin diske yazdığı dosyaları siler. */
export const removeUploadedFiles = async (req) => {
  await Promise.all(
    listedFiles(req).map((file) => fs.unlink(file.path).catch(() => {})),
  );
};

/** Kayıt oluşmamış yüklemeleri siler. Veritabanına bağlanmış dosyaya dokunmaz. */
export const removeUnreferencedUploads = async (req) => {
  const files = listedFiles(req);
  if (!files.length) return;
  const relativePaths = files.map((file) =>
    path.relative(process.cwd(), file.path).replace(/\\/g, '/'),
  );
  const { prisma } = await import('../../lib/prisma.js');
  const rows = await prisma.attachment.findMany({
    where: { path: { in: relativePaths } },
    select: { path: true },
  });
  const kept = new Set(rows.map((row) => row.path));
  await Promise.all(
    files.map((file, index) =>
      kept.has(relativePaths[index]) ? null : fs.unlink(file.path).catch(() => {}),
    ),
  );
};

/** Multer çalışmadan önce. Hata olursa dosya yazılmaz. */
export const beforeUpload = (check) => async (req, res, next) => {
  try {
    await check(req);
    next();
  } catch (err) {
    next(err);
  }
};
