import { z } from "zod";

/** A key box code is typed on a small dial or keypad: letters, digits and dashes, short. */
export const keyboxCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);
