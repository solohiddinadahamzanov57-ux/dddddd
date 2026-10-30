// Rental fee calculation. Pure functions, no I/O -- the server action that
// closes out a rental calls this with server timestamps (never client-
// supplied ones) and the tariff snapshot frozen onto the rental at checkout.
// The client-side live timer (src/components/rentals/live-timer.tsx) calls
// the exact same function for its running total, so the number staff watch
// tick up during the rental matches what they're actually charged at return.
//
// All duration math is done on absolute instants (epoch milliseconds via
// Date), never on calendar fields in a particular time zone -- a rental that
// spans a DST transition still bills the same real elapsed time as one that
// doesn't. Time zones only matter for *displaying* a timestamp, never for
// computing a duration or a charge.

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface TariffInput {
  hourlyRateMinor: number;
  dailyRateMinor: number;
  weeklyRateMinor: number;
  gracePeriodMinutes: number;
  lateFeePerHourMinor: number;
  taxRateBps: number;
}

export interface RentalChargeInput {
  /** Server timestamp of pickup. */
  startedAt: Date;
  /** Server timestamp of return, or "now" for a live/in-progress estimate. */
  endedAt: Date;
  /** When the vehicle was due back, if known (null for a walk-in with no set return time -- never late). */
  expectedReturnAt: Date | null;
  tariff: TariffInput;
  extrasMinor: number;
}

export interface RentalCharge {
  durationMinutes: number;
  /** Time-based charge only (hourly/daily/weekly tiering), before late fees, extras, or tax. */
  baseMinor: number;
  lateFeeMinor: number;
  extrasMinor: number;
  /** = baseMinor. Named to match the `subtotal_minor` column it's stored in. */
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Hourly/daily/weekly tiering with "ceiling" billing (any portion of a unit
 * bills the full unit) and a daily cap on hourly billing -- the common rental
 * convention that a day's hourly total never exceeds the day rate.
 */
export function calculateBaseCharge(durationMs: number, tariff: TariffInput): number {
  if (durationMs <= 0) return 0;

  const durationHours = durationMs / MS_PER_HOUR;
  const billableHours = Math.max(1, Math.ceil(durationHours - 1e-9));

  if (billableHours <= 24) {
    return Math.min(billableHours * tariff.hourlyRateMinor, tariff.dailyRateMinor);
  }

  const billableDays = Math.ceil(durationMs / MS_PER_DAY - 1e-9);
  if (billableDays < 7) {
    return billableDays * tariff.dailyRateMinor;
  }

  const weeks = Math.floor(billableDays / 7);
  const remainderDays = billableDays % 7;
  return weeks * tariff.weeklyRateMinor + remainderDays * tariff.dailyRateMinor;
}

/** Hours late beyond the grace period, billed per started hour. 0 if there's nothing to be late against, or it isn't late yet. */
export function calculateLateFee(
  endedAt: Date,
  expectedReturnAt: Date | null,
  tariff: Pick<TariffInput, "gracePeriodMinutes" | "lateFeePerHourMinor">,
): number {
  if (!expectedReturnAt) return 0;

  const graceDeadlineMs = expectedReturnAt.getTime() + tariff.gracePeriodMinutes * 60_000;
  const lateMs = endedAt.getTime() - graceDeadlineMs;
  if (lateMs <= 0) return 0;

  const lateHours = Math.ceil(lateMs / MS_PER_HOUR - 1e-9);
  return lateHours * tariff.lateFeePerHourMinor;
}

export function calculateRentalCharge(input: RentalChargeInput): RentalCharge {
  const durationMs = input.endedAt.getTime() - input.startedAt.getTime();
  const baseMinor = calculateBaseCharge(durationMs, input.tariff);
  const lateFeeMinor = calculateLateFee(input.endedAt, input.expectedReturnAt, input.tariff);
  const extrasMinor = Math.max(0, input.extrasMinor);

  const taxableMinor = baseMinor + lateFeeMinor + extrasMinor;
  const taxMinor = Math.round((taxableMinor * input.tariff.taxRateBps) / 10_000);
  const totalMinor = taxableMinor + taxMinor;

  return {
    durationMinutes: Math.max(0, Math.round(durationMs / 60_000)),
    baseMinor,
    lateFeeMinor,
    extrasMinor,
    subtotalMinor: baseMinor,
    taxMinor,
    totalMinor,
  };
}

/** The upfront price quote for a reservation: no late fee (hasn't started yet) and no extras (not chosen until checkout). */
export function calculateReservationQuote(
  startAt: Date,
  endAt: Date,
  tariff: TariffInput,
): RentalCharge {
  return calculateRentalCharge({
    startedAt: startAt,
    endedAt: endAt,
    expectedReturnAt: null,
    tariff,
    extrasMinor: 0,
  });
}
