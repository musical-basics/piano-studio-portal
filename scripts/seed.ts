import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv';
config({ path: '.env.local' });

// This script uses the service role key to bypass RLS
// Run with: pnpm run seed

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables. Make sure .env.local exists with:')
    console.error('  NEXT_PUBLIC_SUPABASE_URL')
    console.error('  SUPABASE_SERVICE_KEY')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function seed() {
    console.log('🌱 Starting seed...\n')

    // 1. Create/update student user
    const studentId = await createOrGetUser('student@demo.com', 'password123')
    if (studentId) {
        await seedStudentProfile(studentId)
    }

    // 2. Create/update admin user
    const adminId = await createOrGetUser('support@musicalbasics.com', 'password123')
    if (adminId) {
        await seedAdminProfile(adminId)
    }

    console.log('\n🎉 Seed completed successfully!')
    console.log('\n📋 Test credentials:')
    console.log('  Student: student@demo.com / password123')
    console.log('  Admin:   support@musicalbasics.com / password123')
}

async function createOrGetUser(email: string, password: string): Promise<string | null> {
    console.log(`\n👤 Creating user: ${email}`)

    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    })

    if (userError) {
        if (userError.message.includes('already been registered')) {
            console.log('   ⚠️  User already exists, fetching existing user...')
            const { data: existingUsers } = await supabase.auth.admin.listUsers()
            const existingUser = existingUsers?.users?.find(u => u.email === email)
            if (existingUser) {
                console.log(`   ✅ Found existing user: ${existingUser.id}`)
                return existingUser.id
            }
        } else {
            console.error('   ❌ Error creating user:', userError)
            return null
        }
    } else if (userData.user) {
        console.log(`   ✅ User created: ${userData.user.id}`)
        return userData.user.id
    }
    return null
}

async function seedStudentProfile(userId: string) {
    console.log('\n📝 Setting up student profile for Emily Chen...')

    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            name: 'Emily Chen',
            email: 'student@demo.com',
            phone: '(555) 123-4567',
            role: 'student',
            credits: 2,
            credits_total: 4,
            balance_due: 0.00,
            zoom_link: 'https://zoom.us/j/123456789'
        })

    if (profileError) {
        console.error('   ❌ Error updating profile:', profileError)
        return
    }
    console.log('   ✅ Profile updated')

    // Clear and insert lessons
    console.log('   📚 Setting up lessons...')
    await supabase.from('lessons').delete().eq('student_id', userId)

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    const pastDate = new Date(today)
    pastDate.setDate(today.getDate() - 7)

    const upcomingDate = new Date(today)
    upcomingDate.setDate(today.getDate() + 3)

    const cancelledDate = new Date(today)
    cancelledDate.setDate(today.getDate() - 14)

    const lessons = [
        {
            student_id: userId,
            date: pastDate.toISOString().split('T')[0],
            time: '15:00:00',
            status: 'completed',
            notes: 'Excellent progress on Bach Prelude in C Major. Focus on dynamics and phrasing.',
            video_url: 'https://example.com/lesson-recording.mp4',
            sheet_music_url: 'https://example.com/bach-prelude.pdf'
        },
        {
            student_id: userId,
            date: todayStr, // Lesson for today (for admin dashboard)
            time: '15:00:00',
            status: 'scheduled',
            notes: null,
            video_url: null,
            sheet_music_url: null
        },
        {
            student_id: userId,
            date: upcomingDate.toISOString().split('T')[0],
            time: '15:00:00',
            status: 'scheduled',
            notes: null,
            video_url: null,
            sheet_music_url: null
        },
        {
            student_id: userId,
            date: cancelledDate.toISOString().split('T')[0],
            time: '15:00:00',
            status: 'cancelled',
            notes: 'Student requested cancellation due to illness.',
            video_url: null,
            sheet_music_url: null
        }
    ]

    const { error: lessonsError } = await supabase
        .from('lessons')
        .insert(lessons)

    if (lessonsError) {
        console.error('   ❌ Error inserting lessons:', lessonsError)
        return
    }
    console.log('   ✅ 4 lessons inserted (1 past, 1 today, 1 upcoming, 1 cancelled)')
}

async function seedAdminProfile(userId: string) {
    console.log('\n📝 Setting up admin profile for Professor Williams...')

    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            name: 'Professor Williams',
            email: 'support@musicalbasics.com',
            phone: '(555) 987-6543',
            role: 'admin',
            credits: 0,
            credits_total: 0,
            balance_due: 0.00,
            zoom_link: 'https://zoom.us/j/admin-studio'
        })

    if (profileError) {
        console.error('   ❌ Error updating admin profile:', profileError)
        return
    }
    console.log('   ✅ Admin profile created with role: admin')
}

seed().catch(console.error)
