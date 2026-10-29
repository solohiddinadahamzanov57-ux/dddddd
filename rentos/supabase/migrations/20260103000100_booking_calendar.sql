-- Calendar: a vehicle can never have two active (pending/confirmed)
-- reservations that overlap in time. Enforced as a DB constraint, not just
-- app-level validation, using a GiST exclusion constraint over the
-- reservation's time range. btree_gist is what lets a GiST index also
-- compare the plain uuid vehicle_id for equality.
create extension if not exists btree_gist with schema extensions;

alter table public.reservations
  add column during tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored;

alter table public.reservations
  add constraint reservations_no_overlap exclude using gist (
    vehicle_id with =,
    during with &&
  )
  where (status in ('pending', 'confirmed'));

-- A rental started without a reservation (a walk-in) still needs an expected
-- return time to measure lateness against; one started from a reservation
-- inherits its end_at into here at checkout time instead of re-deriving it
-- later (so changing/cancelling the reservation afterward can't retroactively
-- change what an in-progress rental owes).
alter table public.rentals add column expected_return_at timestamptz;
