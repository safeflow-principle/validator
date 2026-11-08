-- Deliberately contains no production or research records.
-- Synthetic local Auth users and the demo workspace are created through
-- `npm run local:seed-users`, which uses the loopback-only Supabase Admin API.
select 'SafeFlow schema seed complete; run npm run local:seed-users for demo identities.' as message;
