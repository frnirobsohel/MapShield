# Database Schema & Migration

This directory contains the SQL database schema and security definitions for Supabase.

### Files Included:
- `supabase_schema.sql` — Complete SQL definition including:
  - `public.licenses` table (license keys, status, device limits, expiry)
  - `public.license_devices` table (bound hardware UUIDs, names, activity)
  - `public.work_audit_logs` table (telemetry and report audit trails)
  - Row Level Security (RLS) policies and RPC stored procedures (`fn_record_work_audit`)

### How to Apply:
1. Open your Supabase Project Dashboard at [https://supabase.com](https://supabase.com).
2. Go to **SQL Editor** on the left menu.
3. Paste the entire content of [`supabase_schema.sql`](file:///c:/Users/SOHEL/Desktop/rensgmb/database/supabase_schema.sql) and click **Run**.
