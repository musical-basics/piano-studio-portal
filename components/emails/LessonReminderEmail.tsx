import {
    Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import * as React from 'react'

interface LessonReminderEmailProps {
    studentName: string
    time: string
    zoomLink?: string | null
    variant: '24h' | '2h' | '15m'
}

export default function LessonReminderEmail({
    studentName,
    time,
    zoomLink,
    variant = '24h',
}: LessonReminderEmailProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

    // Dynamic Text based on the variant
    const content = {
        '24h': {
            subject: `Upcoming Lesson Tomorrow at ${time}`,
            heading: 'See you tomorrow! 🎹',
            body: `Just a friendly reminder that you have a piano lesson scheduled for tomorrow at ${time}.`,
            btnText: 'View Schedule'
        },
        '2h': {
            subject: `Lesson in 2 Hours (${time})`,
            heading: 'Lesson starting soon',
            body: `Your piano lesson starts in about 2 hours. Now is a great time to warm up!`,
            btnText: 'View Portal'
        },
        '15m': {
            subject: `Join Now: Lesson starting at ${time}`,
            heading: 'It’s almost time! ⏰',
            body: `Your lesson is about to begin. Please verify your audio settings and click the link below to join.`,
            btnText: 'Join Zoom Meeting'
        }
    }

    const text = content[variant]

    return (
        <Html>
            <Head />
            <Preview>{text.subject}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>{text.heading}</Heading>
                    <Section style={section}>
                        <Text style={greeting}>Hi {studentName},</Text>
                        <Text style={bodyText}>
                            {text.body}
                        </Text>

                        {/* Only show Zoom link prominently for the 15m warning */}
                        {variant === '15m' && zoomLink ? (
                            <Button style={joinButton} href={zoomLink}>
                                {text.btnText}
                            </Button>
                        ) : (
                            <Button style={button} href={`${loginUrl}/login`}>
                                {text.btnText}
                            </Button>
                        )}
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '40px 20px', maxWidth: '560px', borderRadius: '8px' }
const heading = { fontSize: '24px', fontWeight: '600', textAlign: 'center' as const, margin: '0 0 30px', color: '#1a1a1a' }
const section = { padding: '0 20px' }
const greeting = { fontSize: '16px', color: '#333', margin: '0 0 16px' }
const bodyText = { fontSize: '14px', lineHeight: '24px', color: '#555', margin: '0 0 16px' }
const button = { backgroundColor: '#3b82f6', borderRadius: '6px', color: '#fff', fontSize: '14px', fontWeight: '600', textDecoration: 'none', textAlign: 'center' as const, display: 'block', padding: '12px 24px', margin: '24px auto' }
const joinButton = {
    ...button,
    backgroundColor: '#10b981',
}
