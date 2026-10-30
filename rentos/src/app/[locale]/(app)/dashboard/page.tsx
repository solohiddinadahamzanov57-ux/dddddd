import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return redirect({ href: "/fleet", locale });
}
