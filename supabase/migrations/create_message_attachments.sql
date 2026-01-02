-- =============================================
-- Add attachments support to messages table
-- =============================================

-- Add attachments column to messages table
-- Structure: [{ type: 'image' | 'file', url: string, name: string, size: number }]
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;

-- Create index for messages with attachments for potential future queries
CREATE INDEX IF NOT EXISTS idx_messages_has_attachments 
ON public.messages ((attachments IS NOT NULL));

-- Comment for documentation
COMMENT ON COLUMN public.messages.attachments IS 'JSON array of attachments: [{type: "image"|"file", url: string, name: string, size: number}]';
