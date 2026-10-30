import { z } from "zod";

export const emailPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().min(1).max(100),
});
