-- Trigger functions are only ever run by their triggers, which don't check the
-- caller's EXECUTE privilege. Nobody should be able to call them over the API,
-- and they should not resolve names through a caller-controlled search_path.
alter function public.set_updated_at() set search_path = public;
alter function public.forbid_company_id_change() set search_path = public;

revoke all on function
  public.set_updated_at(),
  public.forbid_company_id_change(),
  public.accounts_guard_update(),
  public.log_vehicle_status_change()
  from public, anon, authenticated;
