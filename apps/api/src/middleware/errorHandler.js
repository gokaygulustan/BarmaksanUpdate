/**
 * Global error handler middleware.
 * Catches all errors passed via next(error) and returns a structured JSON response.
 */
export const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);

  // Zod validation errors
  if (err.name === 'ZodError') {
    const details = (err.errors || []).map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    const first = details[0]?.message || 'Doğrulama hatası';
    return res.status(400).json({
      message: first,
      errors: details,
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    const field = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
    const isEmail = String(field || '').toLowerCase().includes('email');
    return res.status(409).json({
      message: isEmail
        ? 'Bu e-posta adresi zaten kayıtlı. Mevcut kullanıcıyı düzenleyin veya farklı e-posta kullanın.'
        : 'Bu değer zaten kullanılıyor.',
      field: err.meta?.target,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({ message: 'Kayıt bulunamadı.' });
  }

  if (err.code === 'P2003' || err.code === 'P2014') {
    return res.status(409).json({
      message:
        'Bu kayıt başka işlemlere bağlı olduğu için silinemedi. Hesabı pasife almayı deneyin veya yöneticiden destek isteyin.',
    });
  }

  /** Tablo yok — migration uygulanmamış */
  if (err.code === 'P2021') {
    return res.status(503).json({
      message:
        'mail_settings tablosu bulunamadı. API klasöründe: npx prisma migrate deploy && npx prisma generate ardından sunucuyu yeniden başlatın.',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token.' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired.' });
  }

  // Custom HTTP errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.retryAfterSec != null ? { retryAfterSec: err.retryAfterSec } : {}),
    });
  }

  // Default 500
  if (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError') {
    return res.status(400).json({
      message: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya en fazla 50 MB olabilir.' : err.message,
    });
  }

  // Default 500
  res.status(500).json({
    message: 'Internal server error.',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
};
