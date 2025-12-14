
import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
} from '@react-email/components'

interface LessonScheduledEmailProps {
    studentName: string
    date: string
    time: string
    duration: number
    zoomLink?: string | null
    recipientName: string
    studioName?: string
}

export function LessonScheduledEmail({
    studentName,
    date,
    time,
    duration,
    zoomLink,
    recipientName,
    studioName = 'Piano Studio',
}: LessonScheduledEmailProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

    return (
        <Html>
            <Head />
            <Preview>Lesson scheduled: {date} at {time}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>🎹 {studioName}</Heading>

                    <Section style={section}>
                        <Text style={greeting}>Hi {recipientName},</Text>
                        <Text style={text}>
                            A new piano lesson has been scheduled for <strong>{studentName}</strong>.
                        </Text>

                        <Section style={detailsBox}>
                            <Text style={detailsRow}>
                                <strong>Date:</strong> {date}
                            </Text>
                            <Text style={detailsRow}>
                                <strong>Time:</strong> {time}
                            </Text>
                            <Text style={detailsRow}>
                                <strong>Duration:</strong> {duration} minutes
                            </Text>
                            {zoomLink && (
                                <Text style={detailsRow}>
                                    <strong>Zoom Link:</strong> <a href={zoomLink} style={link}>{zoomLink}</a>
                                </Text>
                            )}
                        </Section>

                        <Text style={text}>
                            You can view full schedule details in your portal.
                        </Text>

                        <Button style={button} href={`${loginUrl}/login`}>
                            View Dashboard
                        </Button>
                    </Section>

                    <Text style={footer}>
                        © {studioName} • You received this email because you have an account with us.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

// Styles
const main = {
    backgroundColor: '#f6f9fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
}

const container = {
    backgroundColor: '#ffffff',
    margin: '0 auto',
    padding: '40px 20px',
    maxWidth: '560px',
    borderRadius: '8px',
}

const heading = {
    fontSize: '24px',
    fontWeight: '600' as const,
    textAlign: 'center' as const,
    margin: '0 0 30px',
    color: '#1a1a1a',
}

const section = {
    padding: '0 20px',
}

const greeting = {
    fontSize: '16px',
    color: '#333',
    margin: '0 0 16px',
}

const text = {
    fontSize: '14px',
    lineHeight: '24px',
    color: '#555',
    margin: '0 0 16px',
}

const detailsBox = {
    backgroundColor: '#f4f4f5',
    borderRadius: '8px',
    padding: '16px 20px',
    margin: '16px 0 24px',
    borderLeft: '4px solid #3b82f6',
}

const detailsRow = {
    fontSize: '15px',
    lineHeight: '24px',
    color: '#333',
    margin: '4px 0',
}

const link = {
    color: '#3b82f6',
    textDecoration: 'underline',
}

const button = {
    backgroundColor: '#3b82f6',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600' as const,
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'block',
    padding: '12px 24px',
    margin: '24px auto',
}

const footer = {
    fontSize: '12px',
    color: '#8898aa',
    textAlign: 'center' as const,
    marginTop: '32px',
}

export default LessonScheduledEmail
