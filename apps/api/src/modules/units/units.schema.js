import { z } from 'zod';

export const createUnitSchema = z.object({
  name: z.string().min(1).max(250),
});

export const resolveUnitSchema = z.object({
  name: z.string().min(1).max(250),
});
