-- Optional: 12 demo vehicles + a default tariff for the FIRST company in the
-- database (i.e. the one you created through the app). Run in the Supabase SQL
-- Editor after signing up and creating your company. Safe to skip.
do $$
declare
  v_company_id uuid;
begin
  select id into v_company_id from public.companies order by created_at limit 1;
  if v_company_id is null then
    raise exception 'No company yet -- sign up in the app and create one first.';
  end if;

  insert into public.tariffs (company_id, currency, hourly_rate_minor, daily_rate_minor, weekly_rate_minor, grace_period_minutes, late_fee_per_hour_minor)
  values (v_company_id, (select default_currency from public.companies where id = v_company_id), 1200, 6000, 30000, 15, 1500)
  on conflict do nothing;

  insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, color, parking_stall, status, odometer, fuel_type, fuel_or_charge_level, level_source, model_glb_key) values
    (v_company_id, 'DEMO-0001', '7ABC123', 'Caldera Sedan',     'car',        'sedan',     'Silver', 'A1', 'available', 18400, 'gasoline', 80, 'manual', 'sedan.glb'),
    (v_company_id, 'DEMO-0002', '7ABC124', 'Caldera Hatch',     'car',        'hatchback', 'Blue',   'A2', 'rented',    32100, 'gasoline', 45, 'photo',  'hatchback.glb'),
    (v_company_id, 'DEMO-0003', '7ABC125', 'Caldera Coupe',     'car',        'coupe',     'Black',  'A3', 'service',   51200, 'gasoline', 60, 'manual', 'sedan.glb'),
    (v_company_id, 'DEMO-0004', '7TRK201', 'Summit Pickup',     'truck',      'pickup',    'Red',    'B1', 'available', 22900, 'diesel',   90, 'manual', 'pickup.glb'),
    (v_company_id, 'DEMO-0005', '7TRK202', 'Summit Box',        'truck',      'box_truck', 'White',  'B2', 'rented',    68700, 'diesel',   55, 'obd',    'van.glb'),
    (v_company_id, 'DEMO-0006', '7SUV301', 'Ridgeline Compact', 'suv',        'compact',   'Gray',   'C1', 'available', 15600, 'hybrid',   70, 'manual', 'suv.glb'),
    (v_company_id, 'DEMO-0007', '7SUV302', 'Ridgeline XL',      'suv',        'full_size', 'Green',  'C2', 'service',   41300, 'gasoline', 40, 'manual', 'suv.glb'),
    (v_company_id, 'DEMO-0008', '7VAN401', 'Transit Passenger', 'van',        'passenger', 'White',  'D1', 'available',  9800, 'electric', 85, 'api',    'van.glb'),
    (v_company_id, 'DEMO-0009', '7VAN402', 'Transit Cargo',     'van',        'cargo',     'White',  'D2', 'rented',    27400, 'electric', 30, 'obd',    'van.glb'),
    (v_company_id, 'DEMO-0010', '7MOT501', 'Strada Standard',   'motorcycle', 'standard',  'Black',  'E1', 'available',  4200, 'gasoline', 95, 'manual', 'motorcycle.glb'),
    (v_company_id, 'DEMO-0011', '7MOT502', 'Strada Touring',    'motorcycle', 'touring',   'Blue',   'E2', 'available', 11300, 'gasoline', 65, 'photo',  'motorcycle.glb'),
    (v_company_id, 'DEMO-0012', '7ABC126', 'Caldera Sedan EV',  'car',        'sedan',     'White',  'A4', 'rented',     6700, 'electric', 50, 'api',    'sedan.glb');
end $$;
