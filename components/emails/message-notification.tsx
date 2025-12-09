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

interface MessageNotificationProps {
    senderName: string
    messageContent: string
    recipientName: string
}

export function MessageNotification({
    senderName,
    messageContent,
    recipientName,
}: MessageNotificationProps) {
    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    return (
        <Html>
            <Head />
            <Preview>New message from {senderName}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>🎹 Piano Studio</Heading>

                    <Section style={section}>
                        <Text style={greeting}>Hi {recipientName},</Text>
                        <Text style={text}>
                            You have a new message from <strong>{senderName}</strong>:
                        </Text>
                        <Section style={messageBox}>
                            <Text style={messageText}>&quot;{messageContent}&quot;</Text>
                        </Section>
                        <Text style={text}>
                            Log in to your Piano Studio portal to view and reply to this message.
                        </Text>
                        <Button style={button} href={`${loginUrl}/login`}>
                            View Message
                        </Button>
                    </Section>

                    <Text style={footer}>
                        © Piano Studio Portal • You received this email because you have an account with us.
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

const messageBox = {
    backgroundColor: '#f4f4f5',
    borderRadius: '8px',
    padding: '16px 20px',
    margin: '16px 0 24px',
    borderLeft: '4px solid #3b82f6',
}

const messageText = {
    fontSize: '15px',
    lineHeight: '24px',
    color: '#333',
    margin: '0',
    fontStyle: 'italic' as const,
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

export default MessageNotification
