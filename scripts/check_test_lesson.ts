import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

async function run() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, dropbox_recording_folder')
        .eq('name', 'Piano Student')
        .single()
    console.log('Profile:', profile)

    const { data: lessons } = await supabase
        .from('lessons')
        .select('id, date, time, status, zoom_meeting_id, zoom_link, video_url, created_at')
        .eq('student_id', (profile as any).id)
        .order('created_at', { ascending: false })
        .limit(3)
    console.log('Recent lessons:')
    console.log(JSON.stringify(lessons, null, 2))
}
run().catch(e => { console.error(e); process.exit(1) })
