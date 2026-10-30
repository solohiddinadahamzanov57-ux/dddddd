-- Trigger function: fired by the reservations trigger, never called over the API.
revoke all on function public.reservations_guard_member_writes() from public, anon, authenticated;
