-- Create stripe_webhook_logs table for audit trail
CREATE TABLE stripe_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL, -- 'pending', 'success', 'error'
    error_message TEXT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by event ID (Stripe retries)
CREATE INDEX idx_stripe_webhook_logs_event_id ON stripe_webhook_logs(stripe_event_id);
-- Index for querying by user
CREATE INDEX idx_stripe_webhook_logs_user_id ON stripe_webhook_logs(user_id);
-- Index for querying by status/type
CREATE INDEX idx_stripe_webhook_logs_status ON stripe_webhook_logs(status);
CREATE INDEX idx_stripe_webhook_logs_type ON stripe_webhook_logs(event_type);

-- RLS
ALTER TABLE stripe_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view logs
CREATE POLICY "Admins can view webhook logs" ON stripe_webhook_logs
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Note: Inserts/Updates are done via service_role key in the webhook handler, so no RLS policies needed for them.
