-- Create site_pages table for dynamic landing page content
CREATE TABLE IF NOT EXISTS site_pages (
    id TEXT PRIMARY KEY DEFAULT 'home',
    html_template TEXT,
    script_content TEXT,
    variable_values JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage site pages"
ON site_pages
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Policy: Public can read site pages
CREATE POLICY "Public can read site pages"
ON site_pages
FOR SELECT
TO anon, authenticated
USING (true);

-- Comment on table
COMMENT ON TABLE site_pages IS 'Stores dynamic HTML content for public pages like the landing page';
