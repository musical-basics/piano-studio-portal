import http from 'http'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { sendMessageCore } from '../lib/core/messages'

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

const TEST_PORT = 3001
const TEST_SECRET = 'test_webhook_secret_xyz123'
const TEST_URL = `http://localhost:${TEST_PORT}/webhook`

async function main() {
    console.log('🧪 Starting Message Webhook Test...\n')

    // 1. Setup mock receiver HTTP server
    let webhookReceived = false
    let receivedPayload: any = null
    let receivedHeaders: any = null

    const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
            let body = ''
            req.on('data', chunk => {
                body += chunk
            })
            req.on('end', () => {
                try {
                    receivedPayload = JSON.parse(body)
                    receivedHeaders = req.headers
                    webhookReceived = true
                    res.writeHead(200, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ received: true }))
                } catch (e: any) {
                    res.writeHead(400, { 'Content-Type': 'application/json' })
                    res.end(JSON.stringify({ error: 'Invalid JSON' }))
                }
            })
        } else {
            res.writeHead(404)
            res.end()
        }
    })

    await new Promise<void>((resolve) => {
        server.listen(TEST_PORT, () => {
            console.log(`📡 Mock receiver listening on port ${TEST_PORT}`)
            resolve()
        })
    })

    // Override environment variables for the test
    process.env.COMMANDER_MESSAGE_WEBHOOK_URL = TEST_URL
    process.env.COMMANDER_MESSAGE_WEBHOOK_SECRET = TEST_SECRET

    let testMessageId: string | null = null

    try {
        // 2. Fetch seeded student and admin profiles
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
            throw new Error('Could not find seeded student (student@demo.com) or admin (support@musicalbasics.com). Please run pnpm seed first.')
        }

        console.log(`👤 Student: ${student.name} (${student.id})`)
        console.log(`👤 Admin: ${admin.name} (${admin.id})`)

        // 3. Send test message (student -> admin)
        console.log('\n✉️ Sending test message (student -> admin)...')
        const content = 'Test message for webhook validation!'
        const result = await sendMessageCore({
            client: supabase,
            senderId: student.id,
            recipientId: admin.id,
            content,
            attachments: null,
        })

        if (result.error) {
            throw new Error(`sendMessageCore failed: ${result.error}`)
        }

        if (!result.message?.id) {
            throw new Error('No message ID returned from sendMessageCore')
        }

        testMessageId = result.message.id
        console.log(`✅ Message sent successfully. ID: ${testMessageId}`)

        // 4. Wait for webhook delivery
        console.log('⏳ Waiting for webhook delivery (up to 5s)...')
        for (let i = 0; i < 50; i++) {
            if (webhookReceived) break
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        // 5. Run Assertions
        if (!webhookReceived) {
            throw new Error('❌ Webhook was never received by mock server!')
        }

        console.log('\n🔍 Verifying webhook request...')

        // Check authentication header
        const secretHeader = receivedHeaders['x-piano-studio-webhook-secret']
        if (secretHeader !== TEST_SECRET) {
            throw new Error(`❌ Webhook secret header verification failed. Expected: "${TEST_SECRET}", Got: "${secretHeader}"`)
        }
        console.log('  ✅ X-Piano-Studio-Webhook-Secret matches secret key')

        // Check payload event type
        if (receivedPayload.event !== 'piano_studio.message.created') {
            throw new Error(`❌ Unexpected event type. Expected: "piano_studio.message.created", Got: "${receivedPayload.event}"`)
        }
        console.log('  ✅ Payload event matches "piano_studio.message.created"')

        // Check payload message structure
        const msg = receivedPayload.message
        if (!msg) {
            throw new Error('❌ Webhook payload is missing message field')
        }

        if (msg.id !== testMessageId) {
            throw new Error(`❌ Message ID mismatch. Expected: "${testMessageId}", Got: "${msg.id}"`)
        }
        if (msg.student_id !== student.id) {
            throw new Error(`❌ Student ID mismatch. Expected: "${student.id}", Got: "${msg.student_id}"`)
        }
        if (msg.student_name !== student.name) {
            throw new Error(`❌ Student name mismatch. Expected: "${student.name}", Got: "${msg.student_name}"`)
        }
        if (msg.content !== content) {
            throw new Error(`❌ Content mismatch. Expected: "${content}", Got: "${msg.content}"`)
        }
        if (!msg.created_at) {
            throw new Error('❌ Message created_at is missing')
        }

        // Verify no extra data is leaked
        const expectedKeys = ['id', 'student_id', 'student_name', 'content', 'created_at']
        const msgKeys = Object.keys(msg)
        const unexpectedKeys = msgKeys.filter(k => !expectedKeys.includes(k))
        if (unexpectedKeys.length > 0) {
            throw new Error(`❌ Webhook payload leaked unexpected fields: ${unexpectedKeys.join(', ')}`)
        }

        console.log('  ✅ Message payload structure is correct and leaks no extra fields')

        // 6. Test that admin -> student messages do NOT trigger webhook
        console.log('\n✉️ Sending test reply (admin -> student)...')
        webhookReceived = false
        receivedPayload = null
        receivedHeaders = null

        const replyResult = await sendMessageCore({
            client: supabase,
            senderId: admin.id,
            recipientId: student.id,
            content: 'Admin reply',
            attachments: null,
        })

        if (replyResult.error) {
            throw new Error(`Admin reply failed: ${replyResult.error}`)
        }

        // Wait a short time to verify webhook is NOT called
        console.log('⏳ Verifying no webhook is sent for admin replies...')
        await new Promise(resolve => setTimeout(resolve, 1500))

        if (webhookReceived) {
            throw new Error('❌ Webhook was triggered for an admin reply! It must only trigger for student -> admin.')
        }
        console.log('  ✅ Webhook was not triggered for admin reply')

        // Clean up the reply message too
        if (replyResult.message?.id) {
            await supabase.from('messages').delete().eq('id', replyResult.message.id)
        }

        console.log('\n🎉 ALL WEBHOOK TESTS PASSED SUCCESSFULLY!')

    } catch (err: any) {
        console.error(`\n❌ Test failed: ${err.message}`)
        process.exitCode = 1
    } finally {
        // Clean up test message
        if (testMessageId) {
            console.log('\n🧹 Cleaning up test message from database...')
            const { error: deleteErr } = await supabase
                .from('messages')
                .delete()
                .eq('id', testMessageId)
            if (deleteErr) {
                console.error(`❌ Cleanup failed: ${deleteErr.message}`)
            } else {
                console.log('  ✅ Test message deleted')
            }
        }

        // Stop server
        server.close(() => {
            console.log('🔌 Server closed.')
        })
    }
}

main().catch(err => {
    console.error('Fatal error in test:', err)
    process.exit(1)
})
