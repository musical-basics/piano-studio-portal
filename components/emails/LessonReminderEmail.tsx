import {
    Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import * as React from 'react'

interface LessonReminderEmailProps {
    studentName: string
    time: string
    zoomLink?: string | null
    classroomLink?: string | null
    variant: '48h' | '24h' | '12h' | '2h' | '15m' | 'exact'
    exactDuration?: string
    /** e.g. "Saturday, August 8" — used by the 48h notice. */
    dayLabel?: string
    /** Student has not confirmed attendance: show the confirm warning + button. */
    confirmNudge?: boolean
}

export default function LessonReminderEmail({
    studentName,
    time,
    zoomLink,
    classroomLink,
    variant = '24h',
    exactDuration,
    dayLabel,
    confirmNudge = false,
}: LessonReminderEmailProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

    // Dynamic Text based on the variant
    const content = {
        '48h': {
            subject: `Please confirm your lesson${dayLabel ? ` on ${dayLabel}` : ''} at ${time}`,
            heading: 'Upcoming lesson 🎹',
            body: `You have a piano lesson scheduled for ${dayLabel || 'the day after tomorrow'} at ${time}.`,
            btnText: 'View Schedule'
        },
        '24h': {
            subject: `Upcoming Lesson Tomorrow at ${time}`,
            heading: 'See you tomorrow! 🎹',
            body: `Just a friendly reminder that you have a piano lesson scheduled for tomorrow at ${time}.`,
            btnText: 'View Schedule'
        },
        '12h': {
            subject: `Please confirm your lesson at ${time}`,
            heading: 'Your lesson is coming up',
            body: `Your piano lesson is coming up in about 12 hours, at ${time}.`,
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
        },
        'exact': {
            subject: `Lesson Update: Starting in ${exactDuration}`,
            heading: 'Lesson Reminder 🎹',
            body: `Just a quick note that your piano lesson is coming up in exactly ${exactDuration}.`,
            btnText: 'Join Zoom Meeting'
        }
    }

    const text = variant === 'exact' ? content['exact'] : content[variant]

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

                        {confirmNudge && (
                            <Section style={nudgeBox}>
                                <Text style={nudgeText}>
                                    Please confirm you will attend this lesson. If unconfirmed, the piano
                                    teacher may not be able to conduct the lesson at the scheduled time.
                                </Text>
                                <Button style={confirmButton} href={`${loginUrl}/student`}>
                                    Confirm Lesson
                                </Button>
                            </Section>
                        )}

                        {/* Only show Zoom link prominently for the 15m warning */}
                        {variant === '15m' && zoomLink ? (
                            <Button style={joinButton} href={zoomLink}>
                                {text.btnText}
                            </Button>
                        ) : (
                            <>
                                <Button style={button} href={`${loginUrl}/login`}>
                                    {text.btnText}
                                </Button>
                                {zoomLink && (
                                    <Text style={zoomLinkText}>
                                        <strong>Zoom Link:</strong>{' '}
                                        <a href={zoomLink} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
                                            {zoomLink}
                                        </a>
                                    </Text>
                                )}
                            </>
                        )}

                        {classroomLink && (
                            <Text style={zoomLinkText}>
                                <strong>Classroom Link:</strong>{' '}
                                <a href={classroomLink} style={{ color: '#10b981', textDecoration: 'underline' }}>
                                    {classroomLink}
                                </a>
                            </Text>
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
const nudgeBox = {
    backgroundColor: '#fffbeb',
    border: '1px solid #f59e0b',
    borderRadius: '6px',
    padding: '4px 16px 16px',
    margin: '20px 0',
}
const nudgeText = { ...bodyText, color: '#92400e', margin: '12px 0 0' }
const confirmButton = {
    ...button,
    backgroundColor: '#f59e0b',
    margin: '16px auto 0',
}
const zoomLinkText = { ...bodyText, fontSize: '14px', margin: '24px 0 0', textAlign: 'center' as const }

