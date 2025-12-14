-- Create a table to track authentication events for troubleshooting
CREATE TABLE auth_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'login', 'failed_login', 'reset_request', 'reset_completed'
    status TEXT NOT NULL, -- 'success', 'failure'
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Add comments
COMMENT ON TABLE auth_audit_logs IS 'Logs of authentication attempts and password resets for troubleshooting.';
COMMENT ON COLUMN auth_audit_logs.event_type IS 'Type of event: login, failed_login, reset_request, reset_completed';

-- Enable RLS (Admin only)
ALTER TABLE auth_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all auth logs"
    ON auth_audit_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow server-side insertion (no policy needed for service role, but if using client...)
-- Actually we will use service role or generic client. 
-- Since we want to log FAILED logins (where user is not auth'd), we probably need to allow insert from public?
-- NO. That's dangerous (spam). We should use Service Role in the actions to insert log entries.
-- So only SELECT policy for Admin is needed for the UI.
