import type { Database } from "@/lib/supabase/types";

export type PhotoPhase = Database["public"]["Enums"]["photo_phase"];
export type PhotoAngle = Database["public"]["Enums"]["photo_angle"];
export type ContactlessStatus =
  Database["public"]["Functions"]["contactless_status"]["Returns"][number];

/** The angles that must be photographed at pickup. `interior` is optional extra evidence. */
export const REQUIRED_ANGLES = ["front", "rear", "left", "right", "dashboard"] as const;
export const ALL_ANGLES: readonly PhotoAngle[] = [...REQUIRED_ANGLES, "interior"];

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** <company>/<reservation>/<phase>/<random>.jpg -- must match the database constraint and storage policy. */
export function photoStoragePath(
  companyId: string,
  reservationId: string,
  phase: PhotoPhase,
  fileId: string,
): string {
  return `${companyId}/${reservationId}/${phase}/${fileId}.jpg`;
}

export function isValidPhotoPath(path: string): boolean {
  return new RegExp(`^${UUID}/${UUID}/(pickup|return)/${UUID}\\.jpg$`).test(path);
}

/** Maps the error text a contactless database function raises to an i18n key. */
export function contactlessErrorKey(message: string | undefined): string {
  switch (message) {
    case "checks_incomplete":
      return "errors.contactlessChecksIncomplete";
    case "vehicle_not_available":
      return "errors.vehicleNotAvailable";
    case "rental_finished":
      return "errors.rentalNotActive";
    case "no_tariff":
      return "errors.noTariff";
    default:
      return "errors.generic";
  }
}
