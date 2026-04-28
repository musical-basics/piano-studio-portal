import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
)

const reviews = [
    {
        name: 'Zoe W., United States',
        rating: 5,
        text: "My son has been taking Lionel's piano lessons a little over one year now. My son's piano skills has been moved to the next level; such as playing solid rhythm, playing with dynamics and playing with clear finger articulation, etc. Lionel is the best piano teacher that my son never had before... Lionel made my son a bright star at his school performances.\nI highly recommend Lionel as your piano teacher with his affordable piano lesson prices. Lionel's piano lessons will worth every dollar you pay.",
    },
    {
        name: 'Yakir S., Israel',
        rating: 5,
        text: "Lionel is an incredible piano teacher, patient, knowledgeable, and truly passionate about music. Every lesson is inspiring and well-structured, and he knows exactly how to adapt his teaching style to my level and goals. Thanks to him, I've made real progress and started enjoying playing in a way I never imagined. Highly recommended to anyone who wants to learn piano the right way!",
    },
    {
        name: 'Padhma B., United States',
        rating: 5,
        text: "Lionel is an excellent teacher. I have experience as a self-guided piano student, and finally decided to search for the right teacher to help me improve. I'm happy to have found Lionel, because not only did he teach me skills that I never saw in any other tutorials online, but he was also able to correct my posture and other issues that I would not have otherwise figured out without an actual teacher. I am lucky that he's my teacher and guiding me on my piano journey, and I highly recommended him as a talented and patient teacher for all levels! (also-If you are a self guided learner like I was, don't wait- he can correct things that will stall your progress later!)",
    },
    {
        name: 'Bai V., United States',
        rating: 5,
        text: 'I was using a piano app to learn. After a couple of months, I feel like a robot on an assembly line, losing motivation. Lionel helped me discover who I needed to be; an artist! He gave me directions and tools that would help me do just that.',
    },
    {
        name: 'Xu Y., United States',
        rating: 5,
        text: "Lionel is an excellent piano teacher! He always provides detailed feedback and recordings after each lesson, which help my kids review and practice effectively at home. The music sheets he prepares include clear counting instructions, making it easy for kids to follow and build good rhythm. My children started learning with Lionel when they were 8 and 9 years old, and they've already made great progress in their fundamental skills and posture. We're very grateful for his patience, professionalism, and dedication!",
    },
    {
        name: 'Jay W., Italy',
        rating: 5,
        text: "I feel very fortunate to learn from Lionel. He is not only extremely knowledgeable about improvisation but also incredibly patient and supportive throughout the lessons. His teaching style makes complex concepts clear and enjoyable, and I've gained so many skills under his guidance. Highly recommend.",
    },
    {
        name: 'Jason B., United States',
        rating: 5,
        text: "A great teacher! He went over some fundamentals with me and helped me to figure out some complex rhythmic patterns. He is inspiring and really helped me on some stuck areas! I would recommend him if you're looking to advance your piano ability.",
    },
    {
        name: 'Susan C., United States',
        rating: 5,
        text: 'I really enjoyed my lessons with Lionel. He was very honest about his thoughts and gave very clear advice and demo for improvement/areas to work on. The teaching session is recorded and can be reviewed later. Highly recommended!',
    },
]

async function main() {
    const rows = reviews.map((r) => ({ ...r, status: 'approved', student_id: null }))
    const { data, error } = await supabase.from('reviews').insert(rows).select('id, name')
    if (error) {
        console.error('Insert failed:', error)
        process.exit(1)
    }
    console.log(`Inserted ${data?.length ?? 0} reviews:`)
    data?.forEach((r) => console.log(`  - ${r.name} (${r.id})`))
}

main()
