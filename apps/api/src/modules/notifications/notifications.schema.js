import { z } from 'zod';

export const createNotificationSchema = z.object({
  userId: z.string(),
  message: z.string().min(1),
  link: z.string().optional(),
});
