import { z } from "zod";

import {
  FUEL_TYPES,
  LEVEL_SOURCES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  isValidSubtype,
} from "@/lib/vehicles/types";

export const vehicleFormSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    type: z.enum(VEHICLE_TYPES),
    subtype: z.string().trim().min(1).max(50),
    color: z.string().trim().max(50).default(""),
    licensePlate: z.string().trim().min(1).max(20),
    parkingStall: z.string().trim().max(20).optional(),
    locationId: z.string().uuid().optional(),
    odometer: z.coerce.number().int().min(0).max(2_000_000),
    fuelType: z.enum(FUEL_TYPES),
    fuelOrChargeLevel: z.coerce.number().min(0).max(100),
    levelSource: z.enum(LEVEL_SOURCES),
  })
  .refine((data) => isValidSubtype(data.type, data.subtype), {
    message: "Subtype doesn't match the selected vehicle type.",
    path: ["subtype"],
  });

export type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(VEHICLE_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const vehicleFiltersSchema = z.object({
  status: z.enum(VEHICLE_STATUSES).optional(),
  type: z.enum(VEHICLE_TYPES).optional(),
  fuelType: z.enum(FUEL_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
});

export type VehicleFilters = z.infer<typeof vehicleFiltersSchema>;
