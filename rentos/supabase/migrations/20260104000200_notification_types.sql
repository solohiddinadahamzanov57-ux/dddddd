-- Phase 0's notification_type enum didn't anticipate "booking confirmed" --
-- the closest existing value (pickup_reminder) means something different
-- (a reminder sent close to pickup time, not the initial confirmation).
alter type public.notification_type add value if not exists 'reservation_confirmed';
