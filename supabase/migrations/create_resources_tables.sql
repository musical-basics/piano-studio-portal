-- Create resources table for the Library system
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('Sheet Music', 'Theory', 'Scales', 'Exercises', 'Recording')),
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'pdf',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create resource_assignments table (many-to-many link between resources and students)
CREATE TABLE IF NOT EXISTS resource_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(resource_id, student_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
CREATE INDEX IF NOT EXISTS idx_resource_assignments_resource_id ON resource_assignments(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_assignments_student_id ON resource_assignments(student_id);

-- Enable RLS
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for resources table
-- Admins can do everything
CREATE POLICY "Admins can manage resources" ON resources
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Students can view resources assigned to them
CREATE POLICY "Students can view assigned resources" ON resources
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM resource_assignments
            WHERE resource_assignments.resource_id = resources.id
            AND resource_assignments.student_id = auth.uid()
        )
    );

-- RLS Policies for resource_assignments table
-- Admins can manage all assignments
CREATE POLICY "Admins can manage resource assignments" ON resource_assignments
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Students can view their own assignments
CREATE POLICY "Students can view own assignments" ON resource_assignments
    FOR SELECT
    USING (student_id = auth.uid());
