import { describe, expect, it } from "vitest";

import {
  calculateBaseCharge,
  calculateLateFee,
  calculateReservationQuote,
  calculateRentalCharge,
  type TariffInput,
} from "./fees";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const tariff: TariffInput = {
  hourlyRateMinor: 1200, // $12/hr
  dailyRateMinor: 6000, // $60/day
  weeklyRateMinor: 30000, // $300/week
  gracePeriodMinutes: 15,
  lateFeePerHourMinor: 1500, // $15/hr late
  taxRateBps: 0,
};

describe("calculateBaseCharge", () => {
  it("is zero for zero or negative duration", () => {
    expect(calculateBaseCharge(0, tariff)).toBe(0);
    expect(calculateBaseCharge(-1000, tariff)).toBe(0);
  });

  it("bills a single hour for any duration up to and including 1 hour", () => {
    expect(calculateBaseCharge(30 * 60 * 1000, tariff)).toBe(1200);
    expect(calculateBaseCharge(1 * HOUR, tariff)).toBe(1200);
  });

  it("rounds up to the next full hour for a partial hour over the minimum", () => {
    expect(calculateBaseCharge(1 * HOUR + 1000, tariff)).toBe(2 * 1200);
  });

  it("caps hourly billing at the day rate", () => {
    const expensiveHourly: TariffInput = { ...tariff, hourlyRateMinor: 2000, dailyRateMinor: 1500 };
    // 10 hours at $20/hr would be $200, well over the $15 day rate -- capped.
    expect(calculateBaseCharge(10 * HOUR, expensiveHourly)).toBe(1500);
  });

  it("bills exactly the day rate at exactly 24 hours", () => {
    expect(calculateBaseCharge(24 * HOUR, tariff)).toBe(tariff.dailyRateMinor);
  });

  it("rounds up to a second day just over 24 hours", () => {
    expect(calculateBaseCharge(24 * HOUR + 60 * 1000, tariff)).toBe(2 * tariff.dailyRateMinor);
  });

  it("bills by the day under a full week", () => {
    expect(calculateBaseCharge(3 * DAY, tariff)).toBe(3 * tariff.dailyRateMinor);
  });

  it("bills exactly one week at exactly 7 days", () => {
    expect(calculateBaseCharge(7 * DAY, tariff)).toBe(tariff.weeklyRateMinor);
  });

  it("bills a week plus remainder days for 8-13 days", () => {
    expect(calculateBaseCharge(8 * DAY, tariff)).toBe(
      tariff.weeklyRateMinor + 1 * tariff.dailyRateMinor,
    );
    expect(calculateBaseCharge(13 * DAY, tariff)).toBe(
      tariff.weeklyRateMinor + 6 * tariff.dailyRateMinor,
    );
  });

  it("bills two full weeks at exactly 14 days", () => {
    expect(calculateBaseCharge(14 * DAY, tariff)).toBe(2 * tariff.weeklyRateMinor);
  });
});

describe("calculateLateFee", () => {
  const expected = new Date("2026-03-10T12:00:00Z");

  it("is zero when there's no expected return time (a walk-in can't be late)", () => {
    expect(calculateLateFee(new Date("2026-03-15T00:00:00Z"), null, tariff)).toBe(0);
  });

  it("is zero when returned before the expected time", () => {
    expect(calculateLateFee(new Date("2026-03-10T11:00:00Z"), expected, tariff)).toBe(0);
  });

  it("is zero when returned within the grace period", () => {
    expect(calculateLateFee(new Date("2026-03-10T12:14:59Z"), expected, tariff)).toBe(0);
  });

  it("is zero exactly at the end of the grace period", () => {
    expect(calculateLateFee(new Date("2026-03-10T12:15:00Z"), expected, tariff)).toBe(0);
  });

  it("bills one late hour for the first minute past the grace period", () => {
    expect(calculateLateFee(new Date("2026-03-10T12:15:01Z"), expected, tariff)).toBe(
      tariff.lateFeePerHourMinor,
    );
  });

  it("bills exactly one late hour at exactly 60 minutes past the grace period", () => {
    expect(calculateLateFee(new Date("2026-03-10T13:15:00Z"), expected, tariff)).toBe(
      tariff.lateFeePerHourMinor,
    );
  });

  it("bills two late hours for 61 minutes past the grace period", () => {
    expect(calculateLateFee(new Date("2026-03-10T13:16:00Z"), expected, tariff)).toBe(
      2 * tariff.lateFeePerHourMinor,
    );
  });
});

describe("calculateRentalCharge", () => {
  it("combines base, late fee, extras, and tax into subtotal/tax/total", () => {
    const taxedTariff: TariffInput = { ...tariff, taxRateBps: 875 }; // 8.75%
    const charge = calculateRentalCharge({
      startedAt: new Date("2026-03-10T09:00:00Z"),
      endedAt: new Date("2026-03-11T09:30:00Z"), // 24.5h -> 2 days
      expectedReturnAt: new Date("2026-03-11T09:00:00Z"), // 30 min late, past grace
      tariff: taxedTariff,
      extrasMinor: 1000,
    });

    const expectedBase = 2 * tariff.dailyRateMinor; // 24.5h rounds up to day 2
    const expectedLate = tariff.lateFeePerHourMinor; // 15 min late - 15 min grace is instantaneous over, 1 hour billed
    const expectedTaxable = expectedBase + expectedLate + 1000;
    const expectedTax = Math.round((expectedTaxable * 875) / 10_000);

    expect(charge.baseMinor).toBe(expectedBase);
    expect(charge.subtotalMinor).toBe(expectedBase);
    expect(charge.lateFeeMinor).toBe(expectedLate);
    expect(charge.extrasMinor).toBe(1000);
    expect(charge.taxMinor).toBe(expectedTax);
    expect(charge.totalMinor).toBe(expectedTaxable + expectedTax);
    expect(charge.durationMinutes).toBe(24 * 60 + 30);
  });

  it("never lets a negative extras value reduce the charge", () => {
    const charge = calculateRentalCharge({
      startedAt: new Date("2026-03-10T09:00:00Z"),
      endedAt: new Date("2026-03-10T10:00:00Z"),
      expectedReturnAt: null,
      tariff,
      extrasMinor: -5000,
    });
    expect(charge.extrasMinor).toBe(0);
  });

  it("bills the same real-world duration across a DST transition as it would on an ordinary day", () => {
    // America/New_York springs forward on 2026-03-08 (clocks jump 02:00 -> 03:00 local,
    // which is 07:00 UTC). These two windows are both exactly 24 hours of absolute
    // elapsed time, one crossing that transition and one not -- if duration were ever
    // computed from local calendar fields instead of absolute instants, the crossing
    // window would wrongly come out as 23 hours of wall-clock time in New York.
    const ordinary = calculateRentalCharge({
      startedAt: new Date("2026-03-05T06:00:00Z"),
      endedAt: new Date("2026-03-06T06:00:00Z"),
      expectedReturnAt: null,
      tariff,
      extrasMinor: 0,
    });
    const acrossDstSpringForward = calculateRentalCharge({
      startedAt: new Date("2026-03-08T06:00:00Z"),
      endedAt: new Date("2026-03-09T06:00:00Z"),
      expectedReturnAt: null,
      tariff,
      extrasMinor: 0,
    });

    expect(acrossDstSpringForward.durationMinutes).toBe(24 * 60);
    expect(acrossDstSpringForward.durationMinutes).toBe(ordinary.durationMinutes);
    expect(acrossDstSpringForward.baseMinor).toBe(ordinary.baseMinor);
  });

  it("bills the same real-world duration across a fall-back DST transition too", () => {
    // America/New_York falls back on 2026-11-01 (02:00 -> 01:00 local, an extra hour) --
    // the naive failure mode here would be billing 25 local hours instead of 24.
    const charge = calculateRentalCharge({
      startedAt: new Date("2026-11-01T04:00:00Z"),
      endedAt: new Date("2026-11-02T04:00:00Z"),
      expectedReturnAt: null,
      tariff,
      extrasMinor: 0,
    });
    expect(charge.durationMinutes).toBe(24 * 60);
    expect(charge.baseMinor).toBe(tariff.dailyRateMinor);
  });
});

describe("calculateReservationQuote", () => {
  it("has no late fee or extras -- a reservation hasn't started yet", () => {
    const quote = calculateReservationQuote(
      new Date("2026-05-01T10:00:00Z"),
      new Date("2026-05-03T10:00:00Z"),
      { ...tariff, taxRateBps: 1000 },
    );
    expect(quote.lateFeeMinor).toBe(0);
    expect(quote.extrasMinor).toBe(0);
    expect(quote.baseMinor).toBe(2 * tariff.dailyRateMinor);
    expect(quote.taxMinor).toBe(Math.round(quote.baseMinor * 0.1));
    expect(quote.totalMinor).toBe(quote.baseMinor + quote.taxMinor);
  });
});
