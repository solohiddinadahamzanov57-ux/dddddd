-- Phase 4: contactless rental.
--
-- A customer can pick a vehicle up without meeting anyone once ALL of these
-- hold: reservation confirmed, ID check approved, agreement signed, deposit
-- held (if the tariff has one), five pickup photos actually stored. That rule
-- lives in contactless_status() and is enforced again inside
-- start_contactless_pickup(), the only way to read a keybox code as a
-- customer. Nothing the browser sends can skip it.

-- ---------------------------------------------------------------- enums
create type public.verification_status as enum ('pending', 'approved', 'rejected');
create type public.deposit_status as enum ('pending', 'held', 'released', 'captured');
create type public.photo_phase as enum ('pickup', 'return');
create type public.photo_angle as enum ('front', 'rear', 'left', 'right', 'interior', 'dashboard');

-- ---------------------------------------------------------------- tariffs
alter table public.tariffs
  add column deposit_minor integer not null default 0 check (deposit_minor >= 0);
comment on column public.tariffs.deposit_minor is
  'Security deposit held on the customer''s card at pickup. 0 = no deposit.';

-- The public booking page shows the deposit before payment (no hidden fees).
drop function public.public_tariff_for_vehicle_type(text, public.vehicle_type);
create function public.public_tariff_for_vehicle_type(
  p_company_slug text,
  p_vehicle_type public.vehicle_type
)
returns table (
  hourly_rate_minor integer,
  daily_rate_minor integer,
  weekly_rate_minor integer,
  currency text,
  grace_period_minutes integer,
  late_fee_per_hour_minor integer,
  deposit_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.hourly_rate_minor, t.daily_rate_minor, t.weekly_rate_minor, t.currency,
         t.grace_period_minutes, t.late_fee_per_hour_minor, t.deposit_minor
  from public.tariffs t
  join public.companies c on c.id = t.company_id
  where c.slug = p_company_slug
    and (t.vehicle_type = p_vehicle_type or t.vehicle_type is null)
  order by t.vehicle_type nulls last
  limit 1;
$$;

-- ---------------------------------------------------------------- keyboxes
-- Staff-only. Customers never SELECT this table; they get the code from
-- start_contactless_pickup() after every check has passed.
create table public.vehicle_keyboxes (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 32),
  updated_at timestamptz not null default now()
);
create index vehicle_keyboxes_company_id_idx on public.vehicle_keyboxes (company_id);
create trigger vehicle_keyboxes_set_updated_at
  before update on public.vehicle_keyboxes
  for each row execute function public.set_updated_at();
create trigger vehicle_keyboxes_forbid_company_id_change
  before update on public.vehicle_keyboxes
  for each row execute function public.forbid_company_id_change();

-- ---------------------------------------------------------------- identity
-- No document images and no document numbers are stored (collect no
-- unnecessary data): only the outcome, the licence expiry and an age flag.
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  member_account_id uuid not null references public.accounts (id) on delete cascade,
  status public.verification_status not null default 'pending',
  provider text not null default 'staff',
  provider_ref text,
  license_valid_until date,
  age_confirmed boolean not null default false,
  reviewed_by_account_id uuid references public.accounts (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint identity_approved_has_details check (
    status <> 'approved'
    or (license_valid_until is not null and age_confirmed and reviewed_at is not null)
  )
);
create index identity_verifications_company_id_idx on public.identity_verifications (company_id);

-- ---------------------------------------------------------------- deposits
create table public.reservation_deposits (
  reservation_id uuid primary key references public.reservations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status public.deposit_status not null default 'pending',
  provider text not null default 'manual',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reservation_deposits_company_id_idx on public.reservation_deposits (company_id);
create trigger reservation_deposits_set_updated_at
  before update on public.reservation_deposits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- contracts
-- Versioned, global, read only through render_rental_agreement(). The text a
-- customer signs is built here, never taken from the browser.
create table public.contract_templates (
  version text not null,
  locale text not null,
  body text not null,
  primary key (version, locale)
);

create table public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null unique references public.reservations (id) on delete cascade,
  member_account_id uuid not null references public.accounts (id) on delete cascade,
  contract_version text not null,
  locale text not null,
  contract_text text not null,
  contract_sha256 text not null,
  signed_name text not null check (char_length(btrim(signed_name)) between 2 and 200),
  signed_at timestamptz not null default now()
);
create index rental_agreements_company_id_idx on public.rental_agreements (company_id);

-- ---------------------------------------------------------------- photos
create table public.handover_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  rental_id uuid references public.rentals (id) on delete set null,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  phase public.photo_phase not null,
  angle public.photo_angle not null,
  storage_path text not null unique,
  taken_by_account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- <company>/<reservation>/<phase>/<random>.jpg : random name, tenant-scoped folder.
  constraint handover_photos_path_shape check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(pickup|return)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  ),
  constraint handover_photos_path_matches_row check (
    storage_path like company_id::text || '/' || reservation_id::text || '/' || phase::text || '/%'
  )
);
create index handover_photos_reservation_idx on public.handover_photos (reservation_id, phase);
create index handover_photos_company_id_idx on public.handover_photos (company_id);

-- ---------------------------------------------------------------- guard: members can't self-confirm
-- reservations_update/insert RLS let a customer write their own row. Without
-- this, they could set status = 'confirmed' and skip payment and every
-- contactless check. Staff and trusted server code (no JWT user) are exempt.
create or replace function public.reservations_guard_member_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff_in_company(new.company_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    return new;
  end if;

  if new.status is distinct from old.status
     and not (old.status in ('pending', 'confirmed') and new.status = 'cancelled') then
    raise exception 'customers can only cancel a reservation';
  end if;
  -- `during` is a stored generated column: Postgres computes it after BEFORE triggers, so NEW still holds the stale value.
  if (to_jsonb(new) - 'status' - 'updated_at' - 'during') is distinct from (to_jsonb(old) - 'status' - 'updated_at' - 'during') then
    raise exception 'customers cannot edit reservation details';
  end if;
  return new;
end;
$$;

create trigger reservations_guard_member_writes
  before insert or update on public.reservations
  for each row execute function public.reservations_guard_member_writes();

-- ---------------------------------------------------------------- contract text (DRAFT)
create or replace function public.current_contract_version()
returns text
language sql
immutable
as $$ select 'draft-1'::text $$;

insert into public.contract_templates (version, locale, body) values
('draft-1', 'en', $tpl$DRAFT RENTAL AGREEMENT. Template for legal review, not yet approved for use.

Reservation {{reservation}}

1. Parties. This agreement is between {{company}} (the Company) and the person who signs below (the Renter).
2. Vehicle. {{vehicle}}.
3. Rental period. From {{start}} to {{end}} ({{timezone}}).
4. Price. {{total}} for the rental period, taxes included as shown at booking. Returning the vehicle after the agreed time may add a late fee under the price list shown at booking.
5. Deposit. {{deposit}} The deposit is held on the Renter's card and released after the vehicle is returned, less any amount owed for damage, fines or fees.
6. Use. The Renter holds a valid driving licence for the whole rental period, is the only driver unless an additional driver was added to this reservation, and will not sublet the vehicle, use it for racing or towing, or drive under the influence of alcohol or drugs.
7. Condition. The Renter takes the photos requested at pickup and return. These timestamped photos are the record of the vehicle's condition.
8. Key code. The key box code is personal to the Renter, must not be shared, and the key must be returned to the key box at the end of the rental.
9. Damage, fines and fees. The Renter is responsible for damage during the rental, traffic fines, and fuel or charge used below the level recorded at pickup.
10. Cancellation. Cancellation follows the policy shown at booking.
11. Governing law. The law of the country where the Company operates applies. [Company to complete.]$tpl$),
('draft-1', 'ru', $tpl$ЧЕРНОВИК ДОГОВОРА АРЕНДЫ. Шаблон для юридической проверки, пока не одобрен к использованию.

Бронь {{reservation}}

1. Стороны. Договор заключается между {{company}} (Компания) и лицом, подписавшим его ниже (Арендатор).
2. Автомобиль. {{vehicle}}.
3. Срок аренды. С {{start}} по {{end}} ({{timezone}}).
4. Цена. {{total}} за срок аренды, налоги включены, как указано при бронировании. Возврат после согласованного времени может повлечь штраф за опоздание по прайс-листу, показанному при бронировании.
5. Залог. {{deposit}} Залог блокируется на карте Арендатора и снимается после возврата автомобиля за вычетом сумм за повреждения, штрафы и сборы.
6. Использование. У Арендатора есть действующее водительское удостоверение на весь срок аренды; он единственный водитель, если в брони не добавлен дополнительный водитель; он не сдаёт автомобиль в субаренду, не использует его для гонок и буксировки и не управляет им в состоянии алкогольного или наркотического опьянения.
7. Состояние. Арендатор делает фотографии, запрошенные при получении и возврате. Эти фотографии с отметкой времени фиксируют состояние автомобиля.
8. Код ключа. Код сейфа с ключом личный, его нельзя передавать другим; в конце аренды ключ нужно вернуть в сейф.
9. Повреждения, штрафы и сборы. Арендатор отвечает за повреждения во время аренды, штрафы за нарушения ПДД, а также за расход топлива или заряда ниже уровня, зафиксированного при получении.
10. Отмена. Отмена происходит по правилам, показанным при бронировании.
11. Применимое право. Применяется право страны, где работает Компания. [Компания заполняет.]$tpl$);

-- ---------------------------------------------------------------- checklist
create or replace function public.contactless_status(p_reservation_id uuid)
returns table (
  reservation_confirmed boolean,
  identity_status public.verification_status,
  identity_ok boolean,
  agreement_signed boolean,
  deposit_required_minor integer,
  deposit_status public.deposit_status,
  deposit_ok boolean,
  photos_present integer,
  photos_ok boolean,
  keybox_configured boolean,
  in_pickup_window boolean,
  rental_id uuid,
  all_ok boolean,
  can_unlock boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r public.reservations;
  v public.vehicles;
  c public.companies;
  iv public.identity_verifications;
  dep public.reservation_deposits;
  v_required integer;
  v_photos integer;
  v_rental uuid;
  v_confirmed boolean;
  v_identity_ok boolean;
  v_agreement boolean;
  v_deposit_ok boolean;
  v_photos_ok boolean;
  v_keybox boolean;
  v_window boolean;
  v_all boolean;
begin
  select * into r from public.reservations rr where rr.id = p_reservation_id;
  if not found then
    return;
  end if;
  if not (public.is_staff_in_company(r.company_id) or r.member_account_id in (select public.my_account_ids())) then
    return;
  end if;

  select * into v from public.vehicles where id = r.vehicle_id;
  select * into c from public.companies where id = r.company_id;
  select * into iv from public.identity_verifications x where x.reservation_id = r.id;
  select * into dep from public.reservation_deposits x where x.reservation_id = r.id;

  -- The required deposit comes from the company's tariff, never from a column the customer can write.
  select coalesce((
    select t.deposit_minor from public.tariffs t
    where t.company_id = r.company_id and (t.vehicle_type = v.type or t.vehicle_type is null)
    order by t.vehicle_type nulls last
    limit 1
  ), 0) into v_required;

  -- Only photos whose file really exists in storage count.
  select count(distinct p.angle) into v_photos
  from public.handover_photos p
  where p.reservation_id = r.id
    and p.phase = 'pickup'
    and p.angle in ('front', 'rear', 'left', 'right', 'dashboard')
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'handover-photos' and o.name = p.storage_path
    );

  select rt.id into v_rental
  from public.rentals rt where rt.reservation_id = r.id
  order by rt.started_at desc limit 1;

  v_confirmed := r.status = 'confirmed';
  v_identity_ok := coalesce(
    iv.status = 'approved'
    and iv.age_confirmed
    and iv.license_valid_until >= (r.end_at at time zone c.timezone)::date,
    false);
  v_agreement := exists (select 1 from public.rental_agreements a where a.reservation_id = r.id);
  v_deposit_ok := v_required = 0 or coalesce(dep.status = 'held' and dep.amount_minor >= v_required, false);
  v_photos_ok := v_photos = 5;
  v_keybox := exists (select 1 from public.vehicle_keyboxes k where k.vehicle_id = r.vehicle_id);
  v_window := now() >= r.start_at - interval '2 hours' and now() < r.end_at;
  v_all := v_confirmed and v_identity_ok and v_agreement and v_deposit_ok and v_photos_ok and v_keybox;

  return query select
    v_confirmed,
    iv.status,
    v_identity_ok,
    v_agreement,
    v_required,
    dep.status,
    v_deposit_ok,
    v_photos,
    v_photos_ok,
    v_keybox,
    v_window,
    v_rental,
    v_all,
    v_all and v_window and v_rental is null;
end;
$$;

-- ---------------------------------------------------------------- agreement
create or replace function public.render_rental_agreement(
  p_reservation_id uuid,
  p_locale text default 'en'
)
returns table (version text, body text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r public.reservations;
  v public.vehicles;
  c public.companies;
  t public.contract_templates;
  v_required integer;
  v_deposit text;
  v_text text;
begin
  select * into r from public.reservations rr where rr.id = p_reservation_id;
  if not found then
    return;
  end if;
  if not (public.is_staff_in_company(r.company_id) or r.member_account_id in (select public.my_account_ids())) then
    return;
  end if;

  select * into v from public.vehicles where id = r.vehicle_id;
  select * into c from public.companies where id = r.company_id;
  select * into t from public.contract_templates ct
    where ct.version = public.current_contract_version()
      and ct.locale = case when p_locale in ('en', 'ru') then p_locale else 'en' end;
  if not found then
    return;
  end if;

  select coalesce((
    select tf.deposit_minor from public.tariffs tf
    where tf.company_id = r.company_id and (tf.vehicle_type = v.type or tf.vehicle_type is null)
    order by tf.vehicle_type nulls last
    limit 1
  ), 0) into v_required;

  v_deposit := case
    when v_required = 0 then case when t.locale = 'ru' then 'Залог не требуется.' else 'No deposit is required.' end
    else to_char(v_required / 100.0, 'FM999999990.00') || ' ' || r.currency || '.'
  end;

  v_text := t.body;
  v_text := replace(v_text, '{{reservation}}', r.id::text);
  v_text := replace(v_text, '{{company}}', c.name);
  v_text := replace(v_text, '{{vehicle}}', v.model || ' (' || v.license_plate || ')');
  v_text := replace(v_text, '{{start}}', to_char(r.start_at at time zone c.timezone, 'YYYY-MM-DD HH24:MI'));
  v_text := replace(v_text, '{{end}}', to_char(r.end_at at time zone c.timezone, 'YYYY-MM-DD HH24:MI'));
  v_text := replace(v_text, '{{timezone}}', c.timezone);
  v_text := replace(v_text, '{{total}}', to_char(r.total_minor / 100.0, 'FM999999990.00') || ' ' || r.currency);
  v_text := replace(v_text, '{{deposit}}', v_deposit);

  return query select t.version, v_text;
end;
$$;

create or replace function public.sign_rental_agreement(
  p_reservation_id uuid,
  p_signed_name text,
  p_locale text default 'en'
)
returns public.rental_agreements
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.reservations;
  a public.rental_agreements;
  v_version text;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into r from public.reservations rr
  where rr.id = p_reservation_id and rr.member_account_id in (select public.my_account_ids());
  if not found then
    raise exception 'reservation not found';
  end if;
  if r.status not in ('pending', 'confirmed') then
    raise exception 'reservation is not open';
  end if;

  select * into a from public.rental_agreements x where x.reservation_id = r.id;
  if found then
    return a;
  end if;

  if char_length(btrim(coalesce(p_signed_name, ''))) < 2 then
    raise exception 'signed name required';
  end if;

  select ra.version, ra.body into v_version, v_body
  from public.render_rental_agreement(r.id, p_locale) ra;
  if v_body is null then
    raise exception 'contract template missing';
  end if;

  insert into public.rental_agreements (
    company_id, reservation_id, member_account_id,
    contract_version, locale, contract_text, contract_sha256, signed_name
  ) values (
    r.company_id, r.id, r.member_account_id,
    v_version, case when p_locale in ('en', 'ru') then p_locale else 'en' end,
    v_body, encode(extensions.digest(v_body, 'sha256'), 'hex'), btrim(p_signed_name)
  )
  returning * into a;

  return a;
end;
$$;

-- ---------------------------------------------------------------- deposit
create or replace function public.request_deposit(p_reservation_id uuid)
returns public.reservation_deposits
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reservations;
  v public.vehicles;
  t public.tariffs;
  d public.reservation_deposits;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into r from public.reservations rr
  where rr.id = p_reservation_id and rr.member_account_id in (select public.my_account_ids());
  if not found then
    raise exception 'reservation not found';
  end if;
  if r.status not in ('pending', 'confirmed') then
    raise exception 'reservation is not open';
  end if;

  select * into v from public.vehicles where id = r.vehicle_id;
  select * into t from public.tariffs tf
  where tf.company_id = r.company_id and (tf.vehicle_type = v.type or tf.vehicle_type is null)
  order by tf.vehicle_type nulls last
  limit 1;
  if not found or t.deposit_minor <= 0 then
    raise exception 'no_deposit_required';
  end if;

  select * into d from public.reservation_deposits x where x.reservation_id = r.id;
  if found then
    if d.status = 'pending' then
      update public.reservation_deposits x
      set amount_minor = t.deposit_minor, currency = t.currency
      where x.reservation_id = r.id
      returning * into d;
    end if;
    return d;
  end if;

  insert into public.reservation_deposits (reservation_id, company_id, amount_minor, currency)
  values (r.id, r.company_id, t.deposit_minor, t.currency)
  returning * into d;
  return d;
end;
$$;

-- ---------------------------------------------------------------- unlock
-- The only customer path to a keybox code. Starts the rental (server time,
-- tariff rebuilt from the company's tariffs table) in the same step, so the
-- code can never be revealed without the timer running. Calling it again
-- while the rental is active just re-reveals the code.
create or replace function public.start_contactless_pickup(p_reservation_id uuid)
returns table (rental_id uuid, keybox_code text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  r public.reservations;
  v public.vehicles;
  st record;
  rt public.rentals;
  tf public.tariffs;
  v_tax integer;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into r from public.reservations rr
  where rr.id = p_reservation_id and rr.member_account_id in (select public.my_account_ids());
  if not found then
    raise exception 'reservation not found';
  end if;

  select * into v from public.vehicles where id = r.vehicle_id for update;

  select * into rt from public.rentals x where x.reservation_id = r.id order by x.started_at desc limit 1;
  if found then
    if rt.status <> 'active' then
      raise exception 'rental_finished';
    end if;
  else
    select * into st from public.contactless_status(r.id);
    if not coalesce(st.can_unlock, false) then
      raise exception 'checks_incomplete';
    end if;
    if v.status <> 'available' then
      raise exception 'vehicle_not_available';
    end if;

    select * into tf from public.tariffs t
    where t.company_id = r.company_id and (t.vehicle_type = v.type or t.vehicle_type is null)
    order by t.vehicle_type nulls last
    limit 1;
    if not found then
      raise exception 'no_tariff';
    end if;
    select c.tax_rate_bps into v_tax from public.companies c where c.id = r.company_id;

    insert into public.rentals (
      company_id, reservation_id, vehicle_id, member_account_id, status,
      started_at, odometer_start, expected_return_at, currency, tariff_snapshot
    ) values (
      r.company_id, r.id, v.id, r.member_account_id, 'active',
      now(), v.odometer, r.end_at, tf.currency,
      jsonb_build_object(
        'tariffId', tf.id,
        'currency', tf.currency,
        'hourlyRateMinor', tf.hourly_rate_minor,
        'dailyRateMinor', tf.daily_rate_minor,
        'weeklyRateMinor', tf.weekly_rate_minor,
        'gracePeriodMinutes', tf.grace_period_minutes,
        'lateFeePerHourMinor', tf.late_fee_per_hour_minor,
        'taxRateBps', v_tax
      )
    )
    returning * into rt;

    update public.vehicles set status = 'rented' where id = v.id;
    update public.handover_photos hp set rental_id = rt.id
    where hp.reservation_id = r.id and hp.phase = 'pickup' and hp.rental_id is null;

    insert into public.vehicle_logs (company_id, vehicle_id, event_type, actor_account_id, payload)
    values (r.company_id, v.id, 'pickup', r.member_account_id,
            jsonb_build_object('reservation_id', r.id, 'rental_id', rt.id, 'contactless', true));
  end if;

  select k.code into v_code from public.vehicle_keyboxes k where k.vehicle_id = v.id;

  insert into public.vehicle_logs (company_id, vehicle_id, event_type, actor_account_id, payload)
  values (r.company_id, v.id, 'keybox_release', r.member_account_id,
          jsonb_build_object('reservation_id', r.id, 'rental_id', rt.id));

  return query select rt.id, v_code;
end;
$$;

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('handover-photos', 'handover-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.can_access_handover_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_reservation uuid;
begin
  begin
    v_company := (string_to_array(p_name, '/'))[1]::uuid;
    v_reservation := (string_to_array(p_name, '/'))[2]::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1 from public.reservations r
    where r.id = v_reservation and r.company_id = v_company
      and (public.is_staff_in_company(r.company_id) or r.member_account_id in (select public.my_account_ids()))
  );
end;
$$;

create policy handover_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'handover-photos' and public.can_access_handover_object(name));
-- Insert only, no update or delete policy: photos are evidence and can't be replaced or removed.
create policy handover_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handover-photos'
    and public.can_access_handover_object(name)
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(pickup|return)/[0-9a-f-]{36}\.jpg$'
  );

-- ---------------------------------------------------------------- RLS
alter table public.vehicle_keyboxes enable row level security;
alter table public.vehicle_keyboxes force row level security;
alter table public.identity_verifications enable row level security;
alter table public.identity_verifications force row level security;
alter table public.reservation_deposits enable row level security;
alter table public.reservation_deposits force row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_templates force row level security;
alter table public.rental_agreements enable row level security;
alter table public.rental_agreements force row level security;
alter table public.handover_photos enable row level security;
alter table public.handover_photos force row level security;

-- Keyboxes: staff only, and only for a vehicle of their own company.
create policy keyboxes_staff_all on public.vehicle_keyboxes for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (
    public.is_staff_in_company(company_id)
    and exists (select 1 from public.vehicles v where v.id = vehicle_keyboxes.vehicle_id and v.company_id = vehicle_keyboxes.company_id)
  );

-- Identity: customers can open one pending request for their own open reservation; only staff decide.
create policy identity_select on public.identity_verifications for select to authenticated
  using (public.is_staff_in_company(company_id) or member_account_id in (select public.my_account_ids()));
create policy identity_member_request on public.identity_verifications for insert to authenticated
  with check (
    member_account_id in (select public.my_account_ids())
    and status = 'pending'
    and provider = 'staff'
    and provider_ref is null
    and reviewed_by_account_id is null
    and reviewed_at is null
    and license_valid_until is null
    and age_confirmed = false
    and exists (
      select 1 from public.reservations r
      where r.id = identity_verifications.reservation_id
        and r.company_id = identity_verifications.company_id
        and r.member_account_id = identity_verifications.member_account_id
        and r.status in ('pending', 'confirmed')
    )
  );
create policy identity_staff_write on public.identity_verifications for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (
    public.is_staff_in_company(company_id)
    and exists (
      select 1 from public.reservations r
      where r.id = identity_verifications.reservation_id
        and r.company_id = identity_verifications.company_id
        and r.member_account_id = identity_verifications.member_account_id
    )
  );

-- Deposits: customers read; rows are created by request_deposit() or staff / the payment webhook.
create policy deposits_select on public.reservation_deposits for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or exists (
      select 1 from public.reservations r
      where r.id = reservation_deposits.reservation_id and r.member_account_id in (select public.my_account_ids())
    )
  );
create policy deposits_staff_write on public.reservation_deposits for all to authenticated
  using (public.is_staff_in_company(company_id))
  with check (
    public.is_staff_in_company(company_id)
    and exists (select 1 from public.reservations r where r.id = reservation_deposits.reservation_id and r.company_id = reservation_deposits.company_id)
  );

-- Agreements: read only. Rows come from sign_rental_agreement(), nobody inserts directly.
create policy agreements_select on public.rental_agreements for select to authenticated
  using (public.is_staff_in_company(company_id) or member_account_id in (select public.my_account_ids()));

-- Photos: read for staff and the customer; insert only (evidence is never edited).
create policy photos_select on public.handover_photos for select to authenticated
  using (
    public.is_staff_in_company(company_id)
    or exists (
      select 1 from public.reservations r
      where r.id = handover_photos.reservation_id and r.member_account_id in (select public.my_account_ids())
    )
  );
create policy photos_member_insert on public.handover_photos for insert to authenticated
  with check (
    taken_by_account_id in (select public.my_account_ids())
    and exists (
      select 1 from public.reservations r
      where r.id = handover_photos.reservation_id
        and r.company_id = handover_photos.company_id
        and r.vehicle_id = handover_photos.vehicle_id
        and r.member_account_id in (select public.my_account_ids())
        and (handover_photos.phase <> 'pickup' or r.status = 'confirmed')
    )
    and (
      (phase = 'pickup' and rental_id is null)
      or (
        phase = 'return'
        and exists (
          select 1 from public.rentals rt
          where rt.id = handover_photos.rental_id
            and rt.reservation_id = handover_photos.reservation_id
            and rt.status = 'active'
        )
      )
    )
  );
create policy photos_staff_insert on public.handover_photos for insert to authenticated
  with check (
    public.is_staff_in_company(company_id)
    and taken_by_account_id in (select public.my_account_ids())
    and exists (
      select 1 from public.reservations r
      where r.id = handover_photos.reservation_id
        and r.company_id = handover_photos.company_id
        and r.vehicle_id = handover_photos.vehicle_id
    )
    and (
      rental_id is null
      or exists (
        select 1 from public.rentals rt
        where rt.id = handover_photos.rental_id
          and rt.company_id = handover_photos.company_id
          and rt.reservation_id = handover_photos.reservation_id
      )
    )
  );

-- ---------------------------------------------------------------- grants
grant select, insert, update, delete on
  public.vehicle_keyboxes, public.identity_verifications, public.reservation_deposits,
  public.contract_templates, public.rental_agreements, public.handover_photos
  to authenticated, service_role;
-- Evidence is append-only for signed-in users.
revoke update, delete on public.handover_photos, public.rental_agreements from authenticated;
-- Templates are reached only through render_rental_agreement().
revoke all on public.contract_templates from authenticated;
revoke all on
  public.vehicle_keyboxes, public.identity_verifications, public.reservation_deposits,
  public.contract_templates, public.rental_agreements, public.handover_photos
  from anon;

revoke all on function
  public.current_contract_version(),
  public.reservations_guard_member_writes(),
  public.contactless_status(uuid),
  public.render_rental_agreement(uuid, text),
  public.sign_rental_agreement(uuid, text, text),
  public.request_deposit(uuid),
  public.start_contactless_pickup(uuid),
  public.can_access_handover_object(text),
  public.public_tariff_for_vehicle_type(text, public.vehicle_type)
  from public, anon;
grant execute on function
  public.contactless_status(uuid),
  public.render_rental_agreement(uuid, text),
  public.sign_rental_agreement(uuid, text, text),
  public.request_deposit(uuid),
  public.start_contactless_pickup(uuid),
  public.can_access_handover_object(text)
  to authenticated;
grant execute on function public.public_tariff_for_vehicle_type(text, public.vehicle_type)
  to anon, authenticated;
