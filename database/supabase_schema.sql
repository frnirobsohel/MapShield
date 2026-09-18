-- ==============================================================================
-- MapsShield Pro: Complete Supabase Licensing, Active Audit & Work Audit Schema
-- Optimized for Single/Multi-Device Activation, Device Binding & Reporting Telemetry
-- Compatible with PostgREST direct REST API (Anon Key & Service Role)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS uuid-ossp;

-- 2. Licenses Table (Registry of Pro licenses, keys, and device limits)
CREATE TABLE IF NOT EXISTS public.licenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT DEFAULT '',
    customer_email TEXT DEFAULT '',
    license_key TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'expired')),
    max_devices INTEGER DEFAULT 1,                  -- Maximum simultaneous active machines
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expiry_date DATE DEFAULT '2030-12-31'           -- Expiration date
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON public.licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);

-- Auto-generate professional license_key if left blank by admin
CREATE OR REPLACE FUNCTION public.fn_auto_generate_license_key()
RETURNS TRIGGER AS 
BEGIN
    IF NEW.license_key IS NULL OR TRIM(NEW.license_key) = '' THEN
        NEW.license_key := 'MAPS-PRO-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
    END IF;
    IF NEW.expiry_date IS NULL THEN
        NEW.expiry_date := '2030-12-31';
    END IF;
    IF NEW.max_devices IS NULL OR NEW.max_devices < 1 THEN
        NEW.max_devices := 1;
    END IF;
    IF NEW.status IS NULL OR TRIM(NEW.status) = '' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
 LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_license_key ON public.licenses;
CREATE TRIGGER trg_auto_license_key
BEFORE INSERT ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_generate_license_key();

-- 3. License Devices Table (Active Audit: Machine Hardware Binding & Heartbeats)
CREATE TABLE IF NOT EXISTS public.license_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    os_info TEXT DEFAULT '',
    app_version TEXT DEFAULT '1.2.0',
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(license_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_license_devices ON public.license_devices(license_id, device_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_last_active ON public.license_devices(last_active_at);

-- 4. License Work Audit Table (Work Telemetry: Daily Reports Completed & Target Links)
CREATE TABLE IF NOT EXISTS public.license_work_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT DEFAULT '',
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reports_completed INTEGER DEFAULT 0,
    last_target_url TEXT DEFAULT '',
    last_report_reason TEXT DEFAULT '',
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(license_id, device_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_license_work_audit ON public.license_work_audit(license_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_license_work_audit_device ON public.license_work_audit(device_id);

-- 5. Helper Function: Upsert Work Audit (Atomic Increment)
CREATE OR REPLACE FUNCTION public.fn_record_work_audit(
    p_license_key TEXT,
    p_device_id TEXT,
    p_device_name TEXT,
    p_target_url TEXT DEFAULT '',
    p_reason TEXT DEFAULT ''
)
RETURNS JSON AS 
DECLARE
    v_license_id UUID;
    v_status TEXT;
    v_expiry DATE;
    v_result JSON;
BEGIN
    -- Verify License Exists & is Active
    SELECT id, status, expiry_date INTO v_license_id, v_status, v_expiry
    FROM public.licenses
    WHERE license_key = p_license_key;

    IF v_license_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid license key');
    END IF;

    IF v_status != 'active' OR v_expiry < CURRENT_DATE THEN
        RETURN json_build_object('success', false, 'error', 'License is inactive or expired');
    END IF;

    -- Upsert work audit record for today
    INSERT INTO public.license_work_audit (
        license_id, device_id, device_name, usage_date, reports_completed,
        last_target_url, last_report_reason, last_active_at
    ) VALUES (
        v_license_id, p_device_id, p_device_name, CURRENT_DATE, 1,
        p_target_url, p_reason, NOW()
    )
    ON CONFLICT (license_id, device_id, usage_date)
    DO UPDATE SET
        reports_completed = public.license_work_audit.reports_completed + 1,
        last_target_url = EXCLUDED.last_target_url,
        last_report_reason = EXCLUDED.last_report_reason,
        last_active_at = NOW();

    -- Also update last_active_at in license_devices
    UPDATE public.license_devices
    SET last_active_at = NOW()
    WHERE license_id = v_license_id AND device_id = p_device_id;

    RETURN json_build_object('success', true, 'message', 'Work audit recorded successfully');
END;
 LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Row Level Security (RLS) Configuration
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_work_audit ENABLE ROW LEVEL SECURITY;

-- Allow anon public read of licenses for activation check (by exact key match or verification)
DROP POLICY IF EXISTS "Anon can verify licenses" ON public.licenses;
CREATE POLICY "Anon can verify licenses" ON public.licenses
    FOR SELECT TO anon, authenticated
    USING (true);

-- Allow anon read and write on license_devices for device binding & heartbeat
DROP POLICY IF EXISTS "Anon manage license_devices" ON public.license_devices;
CREATE POLICY "Anon manage license_devices" ON public.license_devices
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anon read and write on license_work_audit
DROP POLICY IF EXISTS "Anon manage license_work_audit" ON public.license_work_audit;
CREATE POLICY "Anon manage license_work_audit" ON public.license_work_audit
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Allow service role complete bypass/access
DROP POLICY IF EXISTS "Service role access for licenses" ON public.licenses;
CREATE POLICY "Service role access for licenses" ON public.licenses
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access for license_devices" ON public.license_devices;
CREATE POLICY "Service role access for license_devices" ON public.license_devices
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access for license_work_audit" ON public.license_work_audit;
CREATE POLICY "Service role access for license_work_audit" ON public.license_work_audit
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default Demo / Master License Seed (Optional test key)
INSERT INTO public.licenses (customer_name, customer_email, license_key, status, max_devices, notes, expiry_date)
VALUES 
('Master Admin', 'admin@mapsshield.pro', 'MAPS-PRO-MASTER-2026', 'active', 5, 'Master Testing License Key', '2030-12-31')
ON CONFLICT (license_key) DO NOTHING;
