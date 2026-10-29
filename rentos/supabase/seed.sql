-- Local dev seed: one demo company, a demo owner you can sign in as, and 12
-- vehicles mixing every type, status, fuel type and level_source so the
-- fleet dashboard looks like a real business instead of an empty table.
-- Applied automatically by `supabase db reset` against the local stack.

do $$
declare
  v_owner_id uuid := '00000000-0000-0000-0000-0000000000a1';
  v_company_id uuid;
  v_location_id uuid;
begin
  -- Demo owner. Sign in locally with demo-owner@rentos.test / rentos-demo-1234.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_owner_id, 'authenticated', 'authenticated',
    'demo-owner@rentos.test', extensions.crypt('rentos-demo-1234', extensions.gen_salt('bf')),
    now(), now(), now(), '', ''
  )
  on conflict (id) do nothing;

  insert into public.companies (name, slug, default_currency, default_locale, timezone, tax_rate_bps)
  values ('Demo Rentals', 'demo-rentals', 'USD', 'en', 'America/Los_Angeles', 875)
  returning id into v_company_id;

  insert into public.accounts (user_id, company_id, role, full_name)
  values (v_owner_id, v_company_id, 'owner', 'Demo Owner');

  insert into public.locations (company_id, name, address, timezone)
  values (v_company_id, 'Main Lot', '100 Demo Ave, Los Angeles, CA', 'America/Los_Angeles')
  returning id into v_location_id;

  insert into public.vehicles (
    company_id, location_id, barcode, license_plate, model, type, subtype, color,
    parking_stall, status, odometer, fuel_type, fuel_or_charge_level, level_source, model_glb_key
  ) values
    (v_company_id, v_location_id, 'RNT-0001', '7ABC123', 'Caldera Sedan', 'car', 'sedan', 'Silver', 'A1', 'available', 18400, 'gasoline', 80, 'manual', 'sedan.glb'),
    (v_company_id, v_location_id, 'RNT-0002', '7ABC124', 'Caldera Hatch', 'car', 'hatchback', 'Blue', 'A2', 'rented', 32100, 'gasoline', 45, 'photo', 'hatchback.glb'),
    (v_company_id, v_location_id, 'RNT-0003', '7ABC125', 'Caldera Coupe', 'car', 'coupe', 'Black', 'A3', 'service', 51200, 'gasoline', 60, 'manual', 'sedan.glb'),
    (v_company_id, v_location_id, 'RNT-0004', '7TRK201', 'Summit Pickup', 'truck', 'pickup', 'Red', 'B1', 'available', 22900, 'diesel', 90, 'manual', 'pickup.glb'),
    (v_company_id, v_location_id, 'RNT-0005', '7TRK202', 'Summit Box', 'truck', 'box_truck', 'White', 'B2', 'rented', 68700, 'diesel', 55, 'obd', 'van.glb'),
    (v_company_id, v_location_id, 'RNT-0006', '7SUV301', 'Ridgeline Compact', 'suv', 'compact', 'Gray', 'C1', 'available', 15600, 'hybrid', 70, 'manual', 'suv.glb'),
    (v_company_id, v_location_id, 'RNT-0007', '7SUV302', 'Ridgeline XL', 'suv', 'full_size', 'Green', 'C2', 'service', 41300, 'gasoline', 40, 'manual', 'suv.glb'),
    (v_company_id, v_location_id, 'RNT-0008', '7VAN401', 'Transit Passenger', 'van', 'passenger', 'White', 'D1', 'available', 9800, 'electric', 85, 'api', 'van.glb'),
    (v_company_id, v_location_id, 'RNT-0009', '7VAN402', 'Transit Cargo', 'van', 'cargo', 'White', 'D2', 'rented', 27400, 'electric', 30, 'obd', 'van.glb'),
    (v_company_id, v_location_id, 'RNT-0010', '7MOT501', 'Strada Standard', 'motorcycle', 'standard', 'Black', 'E1', 'available', 4200, 'gasoline', 95, 'manual', 'motorcycle.glb'),
    (v_company_id, v_location_id, 'RNT-0011', '7MOT502', 'Strada Touring', 'motorcycle', 'touring', 'Blue', 'E2', 'available', 11300, 'gasoline', 65, 'photo', 'motorcycle.glb'),
    (v_company_id, v_location_id, 'RNT-0012', '7ABC126', 'Caldera Sedan EV', 'car', 'sedan', 'White', 'A4', 'rented', 6700, 'electric', 50, 'api', 'sedan.glb');
end;
$$;
