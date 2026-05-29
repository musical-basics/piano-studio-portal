import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { scheduleLessonCore, rescheduleLessonCore } from '../lib/core/lessons'

// Load environment variables from .env.local
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing Supabase credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
    console.log('🧪 Starting Lesson Intent Flags Test...\n')

    // Track objects to clean up
    let createdFlagIds: string[] = []
    let createdLessonIds: string[] = []

    try {
        // 1. Fetch seeded student and admin profiles
        const { data: student } = await supabase
            .from('profiles')
            .select('id, name')
            .eq('role', 'student')
            .eq('email', 'student@demo.com')
            .single()

        const { data: admin } = await supabase
            .from('profiles')
            .select('id, name')
            .eq('role', 'admin')
            .eq('email', 'support@musicalbasics.com')
            .single()

        if (!student || !admin) {
            throw new Error('Could not find seeded student (student@demo.com) or admin (support@musicalbasics.com).')
        }

        console.log(`👤 Student: ${student.name} (${student.id})`)
        console.log(`👤 Admin: ${admin.name} (${admin.id})`)

        const TARGET_DATE = '2026-12-15'
        const NEW_TARGET_DATE = '2026-12-16'
        const LESSON_TIME = '14:00'

        // Clean up any pre-existing test data on target dates to prevent duplicate key or booked slot conflicts
        await supabase.from('lesson_intent_flags').delete().eq('student_id', student.id).in('target_date', [TARGET_DATE, NEW_TARGET_DATE])
        await supabase.from('lessons').delete().eq('student_id', student.id).in('date', [TARGET_DATE, NEW_TARGET_DATE])

        // 2. Creating a skip_requested flag
        console.log(`\n1️⃣ Creating an active 'skip_requested' flag for date ${TARGET_DATE}...`)
        const { data: flag, error: flagErr } = await supabase
            .from('lesson_intent_flags')
            .insert({
                student_id: student.id,
                target_date: TARGET_DATE,
                intent: 'skip_requested',
                status: 'active',
                source: 'agent',
                note: 'Edwin requested to skip next Tuesday lesson.'
            })
            .select()
            .single()

        if (flagErr || !flag) {
            throw new Error(`Failed to create lesson intent flag: ${flagErr?.message}`)
        }
        createdFlagIds.push(flag.id)
        console.log(`✅ Intent flag created successfully. ID: ${flag.id}`)

        // 3. Scheduling same student/date without override returns 409 (lesson_intent_conflict)
        console.log('\n2️⃣ Attempting to schedule a lesson on the flag date WITHOUT override...')
        const conflictRes = await scheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            studentId: student.id,
            date: TARGET_DATE,
            time: LESSON_TIME,
            duration: 60,
            confirmOverride: false
        })

        if (!conflictRes.error || conflictRes.error !== 'lesson_intent_conflict') {
            throw new Error(`Expected 'lesson_intent_conflict' error, but got: ${JSON.stringify(conflictRes)}`)
        }
        console.log('✅ Correctly blocked scheduling. Returned error:', conflictRes.error)
        console.log('Conflicts metadata:', JSON.stringify(conflictRes.conflicts, null, 2))

        // 4. Scheduling same student/date with confirm_override succeeds and includes warning/conflicts
        console.log('\n3️⃣ Attempting to schedule a lesson on the flag date WITH confirmOverride = true...')
        const overrideRes = await scheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            studentId: student.id,
            date: TARGET_DATE,
            time: LESSON_TIME,
            duration: 60,
            confirmOverride: true
        })

        if (overrideRes.error) {
            throw new Error(`Expected scheduling to succeed with override, but failed: ${overrideRes.error}`)
        }
        if (!overrideRes.lesson || !overrideRes.lesson.id) {
            throw new Error('No lesson object returned from scheduleLessonCore')
        }

        const scheduledLessonId = overrideRes.lesson.id
        createdLessonIds.push(scheduledLessonId)
        console.log(`✅ Scheduling succeeded with override. Lesson ID: ${scheduledLessonId}`)
        console.log('Warning returned:', overrideRes.warning)
        console.log('Conflicts returned:', JSON.stringify(overrideRes.conflicts, null, 2))

        if (!overrideRes.warning || !overrideRes.warning.includes('active skip/cancel/reschedule request')) {
            throw new Error(`Expected warning message about active request, got: ${overrideRes.warning}`)
        }
        console.log('✅ Overridden warning is verified successfully!')

        // 5. Test rescheduling conflict checking
        console.log(`\n4️⃣ Creating another active 'cancel_requested' flag for date ${NEW_TARGET_DATE}...`)
        const { data: flag2, error: flagErr2 } = await supabase
            .from('lesson_intent_flags')
            .insert({
                student_id: student.id,
                target_date: NEW_TARGET_DATE,
                intent: 'cancel_requested',
                status: 'active',
                source: 'admin',
                note: 'Cancel request for this day.'
            })
            .select()
            .single()

        if (flagErr2 || !flag2) {
            throw new Error(`Failed to create second intent flag: ${flagErr2?.message}`)
        }
        createdFlagIds.push(flag2.id)
        console.log(`✅ Second intent flag created successfully. ID: ${flag2.id}`)

        console.log(`\n5️⃣ Attempting to reschedule the lesson to ${NEW_TARGET_DATE} WITHOUT override...`)
        const rescheduleConflictRes = await rescheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            lessonId: scheduledLessonId,
            newDate: NEW_TARGET_DATE,
            newTime: LESSON_TIME,
            newDuration: 60,
            confirmOverride: false
        })

        if (!rescheduleConflictRes.error || rescheduleConflictRes.error !== 'lesson_intent_conflict') {
            throw new Error(`Expected rescheduling to fail with 'lesson_intent_conflict', but got: ${JSON.stringify(rescheduleConflictRes)}`)
        }
        console.log('✅ Correctly blocked rescheduling. Returned error:', rescheduleConflictRes.error)

        console.log(`\n6️⃣ Attempting to reschedule the lesson to ${NEW_TARGET_DATE} WITH confirmOverride = true...`)
        const rescheduleOverrideRes = await rescheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            lessonId: scheduledLessonId,
            newDate: NEW_TARGET_DATE,
            newTime: LESSON_TIME,
            newDuration: 60,
            confirmOverride: true
        })

        if (rescheduleOverrideRes.error) {
            throw new Error(`Expected rescheduling to succeed with override, but failed: ${rescheduleOverrideRes.error}`)
        }
        console.log(`✅ Rescheduling succeeded with override.`)
        console.log('Reschedule warning returned:', rescheduleOverrideRes.warning)

        // 6. Resolving/dismissing a flag removes the conflict
        console.log(`\n7️⃣ Resolving the second flag to clear conflicts on date ${NEW_TARGET_DATE}...`)
        const { error: resolveErr } = await supabase
            .from('lesson_intent_flags')
            .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: admin.id })
            .eq('id', flag2.id)

        if (resolveErr) {
            throw new Error(`Failed to resolve intent flag: ${resolveErr.message}`)
        }
        console.log(`✅ Flag resolved.`)

        console.log(`\n8️⃣ Attempting to reschedule back to ${NEW_TARGET_DATE} (which should now succeed without override/warning)...`)
        // To test, let's reschedule to TARGET_DATE first, then reschedule back to NEW_TARGET_DATE
        await rescheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            lessonId: scheduledLessonId,
            newDate: TARGET_DATE,
            newTime: LESSON_TIME,
            newDuration: 60,
            confirmOverride: true
        })

        const finalRescheduleRes = await rescheduleLessonCore({
            client: supabase,
            adminId: admin.id,
            lessonId: scheduledLessonId,
            newDate: NEW_TARGET_DATE,
            newTime: LESSON_TIME,
            newDuration: 60,
            confirmOverride: false
        })

        if (finalRescheduleRes.error) {
            throw new Error(`Expected rescheduling to succeed without override now that flag is resolved, but got: ${finalRescheduleRes.error}`)
        }
        if (finalRescheduleRes.warning) {
            throw new Error(`Expected no warning for resolved flag, but got: ${finalRescheduleRes.warning}`)
        }
        console.log('✅ Rescheduling succeeded cleanly without warnings or overrides!')

        console.log('\n🎉 ALL LESSON INTENT FLAG TESTS PASSED SUCCESSFULLY!')
    } catch (err: any) {
        console.error(`\n❌ Test failed: ${err.message}`)
        process.exitCode = 1
    } finally {
        console.log('\n🧹 Cleaning up test objects from database...')
        // Delete lessons
        if (createdLessonIds.length > 0) {
            console.log(`  Deleting lessons: ${createdLessonIds.join(', ')}`)
            const { error: delLessonErr } = await supabase
                .from('lessons')
                .delete()
                .in('id', createdLessonIds)
            if (delLessonErr) console.error(`  ❌ Failed to delete lessons: ${delLessonErr.message}`)
        }
        // Delete flags
        if (createdFlagIds.length > 0) {
            console.log(`  Deleting intent flags: ${createdFlagIds.join(', ')}`)
            const { error: delFlagErr } = await supabase
                .from('lesson_intent_flags')
                .delete()
                .in('id', createdFlagIds)
            if (delFlagErr) console.error(`  ❌ Failed to delete intent flags: ${delFlagErr.message}`)
        }
        console.log('✅ Cleanup complete.')
    }
}

main().catch(err => {
    console.error('Fatal error in test:', err)
    process.exit(1)
})
