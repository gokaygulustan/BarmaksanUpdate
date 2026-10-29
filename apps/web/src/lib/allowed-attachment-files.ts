export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.dwg',
  '.dxf',
  '.stp',
  '.step',
  '.igs',
  '.iges',
  '.ifc',
  '.sat',
  '.x_t',
  '.x_b',
  '.prt',
  '.sldprt',
  '.sldasm',
] as const;

export const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_EXTENSIONS.join(',');

export const ATTACHMENT_ALLOWED_LABEL =
  'İzinli dosyalar: PDF, Word, Excel, PowerPoint, TXT, görsel, ZIP/RAR/7Z ve CAD/çizim dosyaları (.dwg, .dxf, .step, .stp, .iges, .ifc, .sldprt, .sldasm).';

export function splitAllowedAttachmentFiles(files: File[]) {
  return files.reduce(
    (acc, file) => {
      const lowerName = file.name.toLowerCase();
      const ok = ALLOWED_ATTACHMENT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      acc[ok ? 'accepted' : 'rejected'].push(file);
      return acc;
    },
    { accepted: [] as File[], rejected: [] as File[] },
  );
}
