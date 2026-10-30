// Mirrors the enums and the type->subtype CHECK constraint in
// supabase/migrations/20260101000100_enums.sql and 20260101000500_vehicles.sql.
// Keep these in sync -- there's no automated check that they match.

export const VEHICLE_SUBTYPES = {
  car: ["sedan", "hatchback", "coupe"],
  truck: ["pickup", "box_truck"],
  suv: ["compact", "full_size"],
  van: ["passenger", "cargo"],
  motorcycle: ["standard", "touring"],
} as const;

export type VehicleType = keyof typeof VEHICLE_SUBTYPES;
export type VehicleSubtype = (typeof VEHICLE_SUBTYPES)[VehicleType][number];

export const VEHICLE_TYPES = Object.keys(VEHICLE_SUBTYPES) as VehicleType[];

export function subtypesFor(type: VehicleType): readonly string[] {
  return VEHICLE_SUBTYPES[type];
}

export function isValidSubtype(type: VehicleType, subtype: string): subtype is VehicleSubtype {
  return (VEHICLE_SUBTYPES[type] as readonly string[]).includes(subtype);
}

export const VEHICLE_STATUSES = ["available", "rented", "service"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const FUEL_TYPES = ["gasoline", "diesel", "electric", "hybrid", "other"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const LEVEL_SOURCES = ["manual", "photo", "obd", "api"] as const;
export type LevelSource = (typeof LEVEL_SOURCES)[number];

// Placeholder models ship one GLB per body silhouette (public/models/), not
// one per subtype -- several subtypes share the closest-looking shape until
// real per-subtype models exist. See LICENSES.md.
const GLB_BY_SUBTYPE: Record<string, string> = {
  sedan: "sedan.glb",
  hatchback: "hatchback.glb",
  coupe: "sedan.glb",
  pickup: "pickup.glb",
  box_truck: "van.glb",
  compact: "suv.glb",
  full_size: "suv.glb",
  passenger: "van.glb",
  cargo: "van.glb",
  standard: "motorcycle.glb",
  touring: "motorcycle.glb",
};

export function modelGlbKeyFor(subtype: string): string {
  return GLB_BY_SUBTYPE[subtype] ?? "sedan.glb";
}
