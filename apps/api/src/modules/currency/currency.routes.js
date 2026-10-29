import express from 'express';
import { getRatesToTRY } from './currency.service.js';

const router = express.Router();

/**
 * [GET] /api/currency/rates
 * TCMB kurları (önbellekli). Canlı kur alınamazsa son başarılı değer ya da
 * 2026 projeksiyonu döner; kaynağı `source` alanı bildirir.
 */
router.get('/rates', async (req, res, next) => {
  try {
    const { rates, source, fetchedAt } = await getRatesToTRY();
    res.json({
      success: true,
      source,
      rates,
      timestamp: fetchedAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
