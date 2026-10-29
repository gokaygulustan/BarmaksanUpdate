import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { getFrontendBaseUrl, getAllowedCorsOrigins, isAllowedCorsOrigin } from './config/frontendUrl.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import vendorRoutes from './modules/vendors/vendors.routes.js';
import procurementRoutes from './modules/procurement/procurement.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import currencyRoutes from './modules/currency/currency.routes.js';
import mailSettingsRoutes from './modules/mail/mail-settings.routes.js';
import mailOutboxRoutes from './modules/mail/mail-outbox.routes.js';
import unitsRoutes from './modules/units/units.routes.js';
import notificationCcContactsRoutes from './modules/notification-cc-contacts/notification-cc-contacts.routes.js';
import internalRequestsRoutes from './modules/internal-requests/internal-requests.routes.js';
import smsSettingsRoutes from './modules/sms/sms.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import departmentsRoutes from './modules/departments/departments.routes.js';
import orgWorkersRoutes from './modules/org-workers/org-workers.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import siteTextsRoutes from './modules/site-texts/site-texts.routes.js';
import * as procurementService from './modules/procurement/procurement.service.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedCorsOrigin(origin)),
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static /uploads kapalı — dosyalar yalnızca yetkili API download uçlarından
// app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/currency', currencyRoutes);
app.use('/api/mail-settings', mailSettingsRoutes);
app.use('/api/mail-outbox', mailOutboxRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/notification-cc-contacts', notificationCcContactsRoutes);
app.use('/api/internal-requests', internalRequestsRoutes);
app.use('/api/sms-settings', smsSettingsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/org-workers', orgWorkersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/site-texts', siteTextsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`   Public frontend (mail linkleri): ${getFrontendBaseUrl()}`);
  console.log(`   CORS origins: ${getAllowedCorsOrigins().join(', ')}`);
  procurementService.recoverPendingDecisionInviteEmailSends().catch((e) => {
    console.error('recoverPendingDecisionInviteEmailSends:', e?.message || e);
  });
});

export default app;
