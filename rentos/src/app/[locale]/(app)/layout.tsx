import { setRequestLocale } from "next-intl/server";

import { AppHeader } from "@/components/layout/app-header";
import { redirect } from "@/i18n/navigation";
import { getStaffAccount } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

import { signOut } from "./actions";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const account = await getStaffAccount(supabase, userData.user.id);

  if (!account) {
    return redirect({ href: "/onboarding", locale });
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader
        companyName={account.companies?.name ?? ""}
        bookingSlug={account.companies?.slug ?? ""}
        signOutAction={signOut.bind(null, locale)}
      />
      {children}
    </div>
  );
}
