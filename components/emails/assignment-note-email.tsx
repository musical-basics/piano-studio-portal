import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

interface AssignmentNoteEmailProps {
    studentName: string
    resourceTitle: string
    notes: string
    teacherName: string
    studioName?: string
}

export function AssignmentNoteEmail({
    studentName,
    resourceTitle,
    notes,
    teacherName,
    studioName = 'Lionel Yu Piano Studio',
}: AssignmentNoteEmailProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lessons.musicalbasics.com'

    return (
        <Html>
            <Head />
            <Preview>New practice instructions for {resourceTitle}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>🎹 {studioName}</Heading>

                    <Section style={section}>
                        <Text style={greeting}>Hi {studentName},</Text>
                        <Text style={text}>
                            <strong>{teacherName}</strong> has updated your practice instructions for <strong>{resourceTitle}</strong>.
                        </Text>

                        <Section style={notesBox}>
                            <Text style={notesText}>{notes}</Text>
                        </Section>

                        <Text style={text}>
                            Log in to your portal to download the material and view your full assignment.
                        </Text>

                        <Button style={button} href={`${loginUrl}/student`}>
                            View Practice Materials
                        </Button>
                    </Section>

                    <Text style={footer}>
                        © {studioName} • Keep practicing!
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

// Styles
const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '40px 20px', maxWidth: '560px', borderRadius: '8px' }
const heading = { fontSize: '24px', fontWeight: '600' as const, textAlign: 'center' as const, margin: '0 0 30px', color: '#1a1a1a' }
const section = { padding: '0 20px' }
const greeting = { fontSize: '16px', color: '#333', margin: '0 0 16px' }
const text = { fontSize: '14px', lineHeight: '24px', color: '#555', margin: '0 0 16px' }
const notesBox = { backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '16px 20px', margin: '16px 0 24px', borderLeft: '4px solid #16a34a' }
const notesText = { fontSize: '15px', lineHeight: '24px', color: '#166534', margin: '0', whiteSpace: 'pre-wrap' as const }
const button = { backgroundColor: '#3b82f6', borderRadius: '6px', color: '#fff', fontSize: '14px', fontWeight: '600' as const, textDecoration: 'none', textAlign: 'center' as const, display: 'block', padding: '12px 24px', margin: '24px auto' }
const footer = { fontSize: '12px', color: '#8898aa', textAlign: 'center' as const, marginTop: '32px' }
