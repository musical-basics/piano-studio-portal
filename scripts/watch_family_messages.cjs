// The studio manager's watch on family messages (every family message gets a drafted reply for
// Lionel's sign-off in the command center). Reads prod with the service key from .env.local.
//
//   node scripts/watch_family_messages.cjs                 block until a student or prospect writes to
//                                                          Lionel (chat, email reply or text: all land in
//                                                          messages), print one line each, then exit.
//                                                          Run it in the background and re-arm after each exit.
//   node scripts/watch_family_messages.cjs --unanswered 7  threads from the last 7 days where the family
//                                                          wrote last, to catch what came in while not watching.
//
// The watch keeps its place in ~/.cache/studio-manager/ so a restart of the Mac does not lose it.
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.join(__dirname, '..')
const env = Object.fromEntries(fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split('\n')
    .filter(l => /^[A-Z_]+=/.test(l))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')] }))
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
})

const STATE_DIR = path.join(os.homedir(), '.cache', 'studio-manager')
const STATE = path.join(STATE_DIR, 'msg-watch-state.json')
const FAMILY = ['student', 'prospect']
const sleep = ms => new Promise(r => setTimeout(r, ms))
const oneLine = s => (s || '').replace(/\s+/g, ' ').slice(0, 300)

async function adminId() {
    const { data, error } = await sb.from('profiles').select('id').eq('role', 'admin')
        .order('created_at', { ascending: false }).limit(1).single()
    if (error) throw error
    return data.id
}

async function unanswered(admin, days) {
    const since = new Date(Date.now() - days * 864e5).toISOString()
    const { data: msgs, error } = await sb.from('messages')
        .select('id,sender_id,recipient_id,content,attachments,created_at,deleted_at,is_read')
        .or(`sender_id.eq.${admin},recipient_id.eq.${admin}`).gte('created_at', since).order('created_at')
    if (error) throw error
    const { data: people } = await sb.from('profiles').select('id,name,role').in('role', FAMILY)
    const who = Object.fromEntries(people.map(p => [p.id, p]))
    const last = {}
    for (const m of msgs) {
        if (m.deleted_at) continue
        const other = m.sender_id === admin ? m.recipient_id : m.sender_id
        if (who[other]) last[other] = m
    }
    let n = 0
    for (const [id, m] of Object.entries(last)) {
        if (m.sender_id === admin) continue
        n++
        console.log(JSON.stringify({
            family: who[id].name, role: who[id].role, id, message: m.id, at: m.created_at, read: m.is_read,
            files: (m.attachments || []).length, text: oneLine(m.content),
        }))
    }
    if (!n) console.log(`no family thread from the last ${days} days is waiting on a reply`)
}

async function watch(admin) {
    fs.mkdirSync(STATE_DIR, { recursive: true })
    let since = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')).since : new Date().toISOString()
    fs.writeFileSync(STATE, JSON.stringify({ since }))
    console.log(`watching for family messages after ${since}`)
    for (;;) {
        try {
            const { data: msgs, error } = await sb.from('messages').select('id,sender_id,content,attachments,created_at')
                .eq('recipient_id', admin).gt('created_at', since).is('deleted_at', null).order('created_at')
            if (error) throw error
            if (msgs.length) {
                const ids = [...new Set(msgs.map(m => m.sender_id))]
                const { data: ppl } = await sb.from('profiles').select('id,name,role').in('id', ids)
                const who = Object.fromEntries(ppl.map(p => [p.id, p]))
                const fam = msgs.filter(m => FAMILY.includes(who[m.sender_id]?.role))
                since = msgs[msgs.length - 1].created_at
                fs.writeFileSync(STATE, JSON.stringify({ since }))
                if (fam.length) {
                    for (const m of fam) {
                        console.log(`NEW MESSAGE ${m.created_at} from ${who[m.sender_id].name} (${m.sender_id}) ` +
                            `message=${m.id} files=${(m.attachments || []).length}: ${oneLine(m.content)}`)
                    }
                    process.exit(0)
                }
            }
        } catch (e) {
            console.error('poll failed:', e.message || e)
        }
        await sleep(60000)
    }
}

;(async () => {
    const admin = await adminId()
    const i = process.argv.indexOf('--unanswered')
    if (i !== -1) await unanswered(admin, Number(process.argv[i + 1] || 7))
    else await watch(admin)
})().catch(e => { console.error(e); process.exit(1) })
