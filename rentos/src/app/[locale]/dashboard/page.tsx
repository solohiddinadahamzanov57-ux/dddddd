import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./actions";

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }
  const user = userData.user;

  const { data: account } = await supabase
    .from("accounts")
    .select("role, full_name, companies(name, default_currency)")
    .limit(1)
    .maybeSingle();

  if (!account) {
    return redirect({ href: "/onboarding", locale });
  }

  const company = account.companies;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl text-[var(--color-text)]">{company?.name}</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        Signed in as {user.email} &middot; role: {account.role}
      </p>
      <p className="text-sm text-[var(--color-text-muted)]">
        Fleet management, rentals and revenue tracking arrive in the next phases.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut(locale);
        }}
      >
        <button type="submit" className="text-sm text-[var(--color-accent)] underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
