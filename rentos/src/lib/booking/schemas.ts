import { z } from "zod";

import { VEHICLE_TYPES } from "@/lib/vehicles/types";

export const bookingSearchSchema = z
  .object({
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    type: z.enum(VEHICLE_TYPES).optional(),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "End must be after start.",
    path: ["endAt"],
  });

export const reservationFormSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().min(1),
});
