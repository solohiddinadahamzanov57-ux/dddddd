-- Own migration: a new enum value can't be used in the transaction that adds it.
alter type public.vehicle_log_event add value if not exists 'keybox_release';
