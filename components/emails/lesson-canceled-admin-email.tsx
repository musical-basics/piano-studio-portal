
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

interface LessonCanceledAdminEmailProps {
    studentName: string
    date: string
    time: string
    cancelledBy: string // 'student' | 'admin'
    wasLate?: boolean
    feeCharged?: number
    studioName?: string
}

export function LessonCanceledAdminEmail({
    studentName,
    date,
    time,
    cancelledBy,
    wasLate = false,
    feeCharged = 0,
    studioName = 'Lionel Yu Piano Studio',
}: LessonCanceledAdminEmailProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'
    const byLabel = cancelledBy === 'student' ? 'the student/parent' : 'an admin'

    return (
        <Html>
            <Head />
            <Preview>Cancellation: {studentName} on {date} at {time}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>🎹 {studioName}</Heading>

                    <Section style={section}>
                        <Text style={greeting}>Lesson cancelled</Text>
                        <Text style={text}>
                            <strong>{studentName}</strong>&apos;s lesson scheduled for{' '}
                            <strong>{date} at {time}</strong> was cancelled by <strong>{byLabel}</strong>.
                        </Text>

                        <Section style={detailsBox}>
                            <Text style={detailsRow}>Student: {studentName}</Text>
                            <Text style={detailsRow}>When: {date} at {time}</Text>
                            <Text style={detailsRow}>Cancelled by: {byLabel}</Text>
                            {wasLate ? (
                                <Text style={detailsRow}>
                                    Late cancellation (under 24h)
                                    {feeCharged > 0 ? ` — $${feeCharged.toFixed(2)} fee added` : ''}
                                </Text>
                            ) : (
                                <Text style={detailsRow}>Cancelled with more than 24h notice</Text>
                            )}
                        </Section>

                        <Button style={button} href={`${loginUrl}/admin`}>
                            Open Admin Dashboard
                        </Button>
                    </Section>

                    <Text style={footer}>
                        © {studioName} • Automated cancellation notice.
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
    fontWeight: '600' as const,
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
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    padding: '16px 20px',
    margin: '16px 0 24px',
    borderLeft: '4px solid #ef4444',
}

const detailsRow = {
    fontSize: '15px',
    lineHeight: '24px',
    color: '#333',
    margin: '4px 0',
}

const button = {
    backgroundColor: '#ef4444',
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

export default LessonCanceledAdminEmail
