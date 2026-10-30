// @vitest-environment node
//
// Renders the Phase 4 screens on the server, in a plain Node environment with
// no browser globals, from realistic fake data, in both languages. A crash on
// the server (like the model-viewer `self` bug that once took the Fleet page
// down) or a missing translation fails the test.
import { createTranslator, IntlProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";
import ru from "../../messages/ru.json";

import { fakeSupabase } from "./fake-supabase";

const MESSAGES = { en, ru } as const;
type Locale = keyof typeof MESSAGES;

const state = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", async () => {
  const { createTranslator: create } = await import("next-intl");
  const messages = {
    en: (await import("../../messages/en.json")).default,
    ru: (await import("../../messages/ru.json")).default,
  };
  return {
    setRequestLocale: () => {},
    getTranslations: async (namespace: string) => {
      // The page under test sets the locale through its params; tests pass it via this global.
      const locale = (globalThis as { __locale?: Locale }).__locale ?? "en";
      return create({
        locale,
        messages: messages[locale],
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      });
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/account", () => ({
  getStaffAccount: async () => ({
    id: "staff-1",
    company_id: "c1",
    role: "owner",
    companies: null,
  }),
  STAFF_ROLES: ["owner", "receptionist", "worker"],
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The server actions pull in server-only code; the components only need something to bind.
vi.mock(
  "@/app/[locale]/book/[companySlug]/reservations/[reservationId]/contactless/actions",
  () => ({
    requestIdentityCheck: vi.fn(),
    signAgreement: vi.fn(),
    startDepositHold: vi.fn(),
    recordHandoverPhoto: vi.fn(),
    unlockVehicle: vi.fn(),
  }),
);
vi.mock("@/app/[locale]/(app)/reservations/actions", () => ({
  confirmReservation: vi.fn(),
  cancelReservationAsStaff: vi.fn(),
  reviewIdentity: vi.fn(),
  markDepositReceived: vi.fn(),
  releaseDeposit: vi.fn(),
  captureDeposit: vi.fn(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {} }),
}));
// Async server components can't be nested inside renderToString; the gallery is rendered directly below.
vi.mock("@/components/reservations/photo-gallery", () => ({
  PhotoGallery: () => <div data-testid="gallery" />,
}));
vi.mock("@/lib/stripe/client", () => ({ isStripeConfigured: () => false }));

const { ContactlessSection } =
  await import("@/app/[locale]/book/[companySlug]/reservations/[reservationId]/contactless/section");
const { default: ReservationsPage } = await import("@/app/[locale]/(app)/reservations/page");
const { default: ReservationDetailPage } =
  await import("@/app/[locale]/(app)/reservations/[reservationId]/page");
const { KeyboxForm } = await import("@/app/[locale]/(app)/fleet/[vehicleId]/keybox-form");
const { ActionButton, CaptureForm, IdentityReviewForm } =
  await import("@/app/[locale]/(app)/reservations/forms");
const { PhotoGallery } = await vi.importActual<
  typeof import("@/components/reservations/photo-gallery")
>("@/components/reservations/photo-gallery");

const COMPANY = "11111111-1111-4111-8111-111111111111";
const RESERVATION = "22222222-2222-4222-8222-222222222222";

const baseStatus = {
  reservation_confirmed: false,
  identity_status: null,
  identity_ok: false,
  agreement_signed: false,
  deposit_required_minor: 20000,
  deposit_status: null,
  deposit_ok: false,
  photos_present: 0,
  photos_ok: false,
  keybox_configured: true,
  in_pickup_window: true,
  rental_id: null as string | null,
  all_ok: false,
  can_unlock: false,
};

const reservationRow = {
  id: RESERVATION,
  company_id: COMPANY,
  vehicle_id: "v1",
  status: "pending",
  start_at: "2031-01-01T10:00:00Z",
  end_at: "2031-01-03T10:00:00Z",
  total_minor: 12000,
  currency: "USD",
  vehicles: { model: "Caldera Sedan", license_plate: "7ABC123" },
  accounts: { full_name: "", email: "casey@example.com" },
};

function provide(locale: Locale, node: React.ReactNode) {
  return renderToString(
    // The app passes timeZone="UTC" from the locale layout; without it use-intl reports a one-time
    // "no timeZone configured" notice that a throwing onError would turn into a failure. Anything
    // else (a missing message, a bad format) must fail the test.
    <IntlProvider
      locale={locale}
      messages={MESSAGES[locale]}
      timeZone="UTC"
      onError={(error) => {
        throw error;
      }}
    >
      {node}
    </IntlProvider>,
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
});

const LOCALES: Locale[] = ["en", "ru"];
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

describe.each(LOCALES)("customer contactless checklist (%s)", (locale) => {
  const translator = () => createTranslator({ locale, messages: MESSAGES[locale] });

  async function render(
    status: Partial<typeof baseStatus>,
    tables: Record<string, Record<string, unknown>[]> = {},
    reservation = {
      id: RESERVATION,
      company_id: COMPANY,
      status: "pending",
      start_at: "2031-01-01T10:00:00Z",
    },
  ) {
    (globalThis as { __locale?: Locale }).__locale = locale;
    state.client = fakeSupabase({
      rpc: {
        contactless_status: [{ ...baseStatus, ...status }],
        render_rental_agreement: [
          { version: "draft-1", body: "DRAFT RENTAL AGREEMENT\n1. Parties." },
        ],
      },
      tables,
    });
    const element = await ContactlessSection({ locale, companySlug: "co", reservation });
    return provide(locale, element);
  }

  it("a fresh, unconfirmed reservation shows every step and the confirmation notice", async () => {
    const html = await render({});
    const t = translator();
    expect(html).toContain(t("contactless.title"));
    expect(html).toContain(escapeHtml(t("contactless.waitingConfirm")));
    expect(html).toContain(t("contactless.id.request"));
    expect(html).toContain("DRAFT RENTAL AGREEMENT");
    expect(html).toContain(t("contactless.agreement.sign"));
    expect(html).toContain(escapeHtml(t("contactless.deposit.notify")));
    expect(html).toContain(t("contactless.unlock.locked"));
    expect(html).not.toContain(t("contactless.unlock.unlock"));
  });

  it("when every check is done and the window is open, the unlock button appears", async () => {
    const html = await render(
      {
        reservation_confirmed: true,
        identity_ok: true,
        agreement_signed: true,
        deposit_ok: true,
        photos_present: 5,
        photos_ok: true,
        all_ok: true,
        can_unlock: true,
      },
      {
        identity_verifications: [{ status: "approved" }],
        rental_agreements: [
          {
            signed_name: "Casey Customer",
            signed_at: "2031-01-01T08:00:00Z",
            contract_text: "TEXT",
          },
        ],
        reservation_deposits: [{ status: "held", amount_minor: 20000, currency: "USD" }],
        handover_photos: ["front", "rear", "left", "right", "dashboard"].map((angle) => ({
          angle,
          phase: "pickup",
        })),
      },
      {
        id: RESERVATION,
        company_id: COMPANY,
        status: "confirmed",
        start_at: "2031-01-01T10:00:00Z",
      },
    );
    const t = translator();
    expect(html).toContain(t("contactless.unlock.unlock"));
    expect(html).toContain("Casey Customer");
    expect(html).toContain(t("contactless.deposit.held"));
  });

  it("an active rental offers the key code again and the return photos", async () => {
    const html = await render(
      { reservation_confirmed: true, all_ok: true, rental_id: "r1", deposit_ok: true },
      { rentals: [{ id: "r1", status: "active" }] },
      {
        id: RESERVATION,
        company_id: COMPANY,
        status: "confirmed",
        start_at: "2031-01-01T10:00:00Z",
      },
    );
    const t = translator();
    expect(html).toContain(t("contactless.unlock.show"));
    expect(html).toContain(t("contactless.returnPhotos.title"));
  });

  it("explains a missing key box code and a window that has not opened", async () => {
    const noKeybox = await render({ keybox_configured: false });
    expect(noKeybox).toContain(translator()("contactless.unlock.noKeybox"));

    const early = await render({
      reservation_confirmed: true,
      all_ok: true,
      in_pickup_window: false,
    });
    expect(early).toContain(
      translator()("contactless.unlock.opensAt", { time: "" }).split(" ").slice(0, 3).join(" "),
    );
  });
});

describe.each(LOCALES)("operator reservation screens (%s)", (locale) => {
  const translator = () => createTranslator({ locale, messages: MESSAGES[locale] });

  it("lists open reservations with their checklist chips", async () => {
    (globalThis as { __locale?: Locale }).__locale = locale;
    state.client = fakeSupabase({
      tables: {
        reservations: [reservationRow],
        identity_verifications: [{ reservation_id: RESERVATION, status: "pending" }],
        rental_agreements: [],
        reservation_deposits: [{ reservation_id: RESERVATION, status: "pending" }],
        handover_photos: [{ reservation_id: RESERVATION, angle: "front" }],
      },
    });
    const element = await ReservationsPage({ params: Promise.resolve({ locale }) } as never);
    const html = provide(locale, element);
    const t = translator();
    expect(html).toContain("Caldera Sedan");
    expect(html).toContain("casey@example.com");
    expect(html).toContain(t("reservations.state.pending"));
    expect(html).toContain("1/5");
  });

  it("shows the detail page with the review form, deposit controls and photos", async () => {
    (globalThis as { __locale?: Locale }).__locale = locale;
    state.client = fakeSupabase({
      rpc: {
        contactless_status: [
          { ...baseStatus, deposit_required_minor: 20000, keybox_configured: false },
        ],
      },
      tables: {
        reservations: [reservationRow],
        identity_verifications: [{ status: "pending", license_valid_until: null }],
        rental_agreements: [],
        reservation_deposits: [
          { status: "held", amount_minor: 20000, currency: "USD", provider: "manual" },
        ],
        handover_photos: [
          {
            id: "p1",
            phase: "pickup",
            angle: "front",
            storage_path: `${COMPANY}/${RESERVATION}/pickup/x.jpg`,
            created_at: "2031-01-01T09:00:00Z",
          },
          {
            id: "p2",
            phase: "return",
            angle: "rear",
            storage_path: `${COMPANY}/${RESERVATION}/return/y.jpg`,
            created_at: "2031-01-03T09:00:00Z",
          },
        ],
        rentals: [],
      },
    });
    const element = await ReservationDetailPage({
      params: Promise.resolve({ locale, reservationId: RESERVATION }),
    } as never);
    const html = provide(locale, element);
    const t = translator();
    expect(html).toContain(t("reservations.confirm"));
    expect(html).toContain(t("reservations.id.approve"));
    expect(html).toContain(t("reservations.deposit.release"));
    expect(html).toContain('data-testid="gallery"');
    expect(html).toContain(t("reservations.keybox.missing"));
  });
});

describe("key box and review forms", () => {
  it.each(LOCALES)("render with their labels (%s)", async (locale) => {
    const noop = async () => ({});
    const html = provide(
      locale,
      <>
        <KeyboxForm action={noop} currentCode="4821" />
        <ActionButton action={noop} label="Go" />
        <IdentityReviewForm action={noop} />
        <CaptureForm action={noop} max={20000} />
      </>,
    );
    const t = createTranslator({ locale, messages: MESSAGES[locale] });
    expect(html).toContain('value="4821"');
    expect(html).toContain(t("fleet.keybox.clear"));
    expect(html).toContain(t("reservations.id.reject"));
    expect(html).toContain(t("reservations.deposit.capture"));
  });
});

describe.each(LOCALES)("photo gallery (%s)", (locale) => {
  it("shows every photo through a signed link, with the angle and time as its description", async () => {
    (globalThis as { __locale?: Locale }).__locale = locale;
    const element = await PhotoGallery({
      supabase: fakeSupabase({}) as never,
      locale,
      photos: [
        {
          id: "p1",
          phase: "pickup",
          angle: "front",
          storage_path: "a/b/pickup/x.jpg",
          created_at: "2031-01-01T09:00:00Z",
        },
        {
          id: "p2",
          phase: "return",
          angle: "dashboard",
          storage_path: "a/b/return/y.jpg",
          created_at: "2031-01-03T09:00:00Z",
        },
      ],
    });
    const html = provide(locale, element);
    const t = createTranslator({ locale, messages: MESSAGES[locale] });
    expect(html).toContain("https://signed.test/a/b/pickup/x.jpg");
    expect(html).toContain(t("reservations.photos.pickup"));
    expect(html).toContain(t("reservations.photos.return"));
    expect(html).toContain(t("reservations.photos.angle.dashboard"));
    expect(html).toMatch(/alt="[^"]+"/);
  });
});
