-- Enumerated types shared across the schema. Keeping these as real Postgres
-- enums (rather than free text) means invalid values are rejected by the
-- database itself, not just by application code.

create type public.account_role as enum ('owner', 'receptionist', 'worker', 'member');

create type public.vehicle_type as enum ('car', 'truck', 'suv', 'van', 'motorcycle');

create type public.vehicle_status as enum ('available', 'rented', 'service');

create type public.fuel_type as enum ('gasoline', 'diesel', 'electric', 'hybrid', 'other');

create type public.level_source as enum ('manual', 'photo', 'obd', 'api');

create type public.reservation_status as enum (
  'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
);

create type public.rental_status as enum ('active', 'completed');

create type public.extra_item_type as enum ('equipment', 'service', 'additional_driver', 'insurance');

create type public.payment_method as enum ('card', 'cash', 'other');

create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create type public.notification_type as enum (
  'pickup_reminder', 'due_soon', 'overdue', 'reservation_cancelled',
  'service_due', 'insurance_expiring'
);

create type public.notification_channel as enum ('email', 'sms', 'whatsapp', 'telegram', 'push');

create type public.notification_status as enum ('queued', 'sent', 'failed');

create type public.expense_category as enum ('repair', 'insurance', 'fuel', 'wash', 'fine');

create type public.vehicle_log_event as enum (
  'status_change', 'inspection', 'service', 'note', 'pickup', 'return'
);
