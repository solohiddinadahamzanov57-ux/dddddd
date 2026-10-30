create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete set null,
  rental_id uuid references public.rentals (id) on delete set null,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  provider text not null default 'manual',
  provider_payment_id text,
  created_at timestamptz not null default now(),
  constraint payments_attached_to_something check (
    reservation_id is not null or rental_id is not null
  )
);

create index payments_company_id_idx on public.payments (company_id);
create index payments_reservation_id_idx on public.payments (reservation_id);
create index payments_rental_id_idx on public.payments (rental_id);
-- A given provider payment id (e.g. a Stripe PaymentIntent) is only ever recorded once.
create unique index payments_provider_payment_id_idx
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  type public.notification_type not null,
  channel public.notification_channel not null,
  content jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'queued',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_company_id_idx on public.notifications (company_id);
create index notifications_account_id_idx on public.notifications (account_id, created_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  category public.expense_category not null,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_on date not null default current_date,
  notes text not null default '',
  created_by_account_id uuid references public.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index expenses_company_id_idx on public.expenses (company_id);
create index expenses_vehicle_id_idx on public.expenses (vehicle_id, occurred_on desc);
