"use server";

import { revalidatePath } from "next/cache";

import { notifyByEmail } from "@/lib/notifications/send";
import { createClient } from "@/lib/supabase/server";

export type CancelState = { error?: string };

/** Free cancellation up to this many hours before pickup; no self-service cancel after that. */
const CANCELLATION_CUTOFF_HOURS = 24;

export async function cancelReservation(
  companySlug: string,
  reservationId: string,
  _prevState: CancelState,
  _formData: FormData,
): Promise<CancelState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "errors.generic" };
  }

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, company_id, member_account_id, status, start_at, vehicles(model)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    return { error: "errors.generic" };
  }
  if (reservation.status !== "pending" && reservation.status !== "confirmed") {
    return { error: "errors.reservationNotCancellable" };
  }

  const hoursUntilStart =
    (new Date(reservation.start_at).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilStart < CANCELLATION_CUTOFF_HOURS) {
    return { error: "errors.cancellationWindowPassed" };
  }

  const { error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId);
  if (error) {
    console.error("cancelReservation failed:", error);
    return { error: "errors.generic" };
  }

  const { data: user } = await supabase.auth.getUser();
  if (user.user?.email) {
    await notifyByEmail({
      companyId: reservation.company_id,
      accountId: reservation.member_account_id,
      type: "reservation_cancelled",
      to: user.user.email,
      subject: "Your reservation was cancelled",
      text: `Your reservation for ${reservation.vehicles?.model ?? "your vehicle"} has been cancelled.`,
    });
  }

  revalidatePath(`/book/${companySlug}/reservations/${reservationId}`);
  return {};
}
