import { z } from "zod";

import { VEHICLE_TYPES } from "@/lib/vehicles/types";

export const tariffFormSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES).optional(), // unset means the company-wide default
  currency: z.string().regex(/^[A-Z]{3}$/),
  hourlyRateMinor: z.coerce.number().int().min(0),
  dailyRateMinor: z.coerce.number().int().min(0),
  weeklyRateMinor: z.coerce.number().int().min(0),
  gracePeriodMinutes: z.coerce.number().int().min(0).max(1440),
  lateFeePerHourMinor: z.coerce.number().int().min(0),
  depositMinor: z.coerce.number().int().min(0).default(0),
});

export const extraItemSchema = z.object({
  itemType: z.enum(["equipment", "service", "insurance", "additional_driver"]),
  label: z.string().trim().min(1).max(100),
  costMinor: z.coerce.number().int().min(0),
});
export type ExtraItem = z.infer<typeof extraItemSchema>;

export const checkoutFormSchema = z.object({
  memberAccountId: z.string().uuid().optional(),
  newMemberName: z.string().trim().max(200).optional(),
  newMemberEmail: z.string().trim().email().optional().or(z.literal("")),
  newMemberPhone: z.string().trim().max(30).optional(),
  expectedReturnAt: z.string().optional(), // datetime-local string, empty = no expected return
  extras: z.array(extraItemSchema).default([]),
});

export const returnFormSchema = z.object({
  odometerEnd: z.coerce.number().int().min(0),
});

export const expenseFormSchema = z.object({
  category: z.enum(["repair", "insurance", "fuel", "wash", "fine"]),
  amountMinor: z.coerce.number().int().min(0),
  occurredOn: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
});
