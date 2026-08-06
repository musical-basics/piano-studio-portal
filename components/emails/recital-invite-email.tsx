import {
    Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from '@react-email/components'
import * as React from 'react'

interface RecitalInviteEmailProps {
    recipientName: string
    rsvpYesUrl: string
    rsvpNoUrl: string
}

// Online studio recital announcement: Saturday, August 29 2026, 2:00 PM PST.
export default function RecitalInviteEmail({
    recipientName,
    rsvpYesUrl,
    rsvpNoUrl,
}: RecitalInviteEmailProps) {
    return (
        <Html>
            <Head />
            <Preview>Online Studio Recital: Saturday, August 29 at 2:00 PM PST</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>🎹 Online Studio Recital</Heading>
                    <Text style={dateLine}>Saturday, August 29 at 2:00 PM PST</Text>
                    <Section style={section}>
                        <Text style={bodyText}>Hi {recipientName},</Text>
                        <Text style={bodyText}>
                            I&apos;m excited to announce our next online studio recital on{' '}
                            <strong>Saturday, August 29 at 2:00 PM PST</strong>. It will be a group
                            Zoom call with every performer and their families, and joining
                            instructions will be sent out closer to the date.
                        </Text>
                        <Text style={bodyText}>
                            It&apos;s been a while since our last online recital, and in previous
                            recitals the improvement in the students was vast: every student showed
                            noticeable improvement in the weeks leading up to and after the recital.
                            It&apos;s one of the best motivators we have.
                        </Text>
                        <Text style={bodyText}>
                            This time there&apos;s something new: trusted members of Lionel&apos;s
                            YouTube community will also be invited to watch, so this will be the
                            first recital with an audience of more than just the parents and
                            students. A real audience, from home.
                        </Text>
                        <Text style={bodyText}>
                            Please let me know if you can make it. If you can attend, you&apos;ll be
                            able to tell me which piece you&apos;d like to perform and add guests
                            (family and friends) you&apos;d like invited to the Zoom call.
                        </Text>
                        <Button style={attendButton} href={rsvpYesUrl}>
                            I can attend
                        </Button>
                        <Button style={declineButton} href={rsvpNoUrl}>
                            Not able to make it.
                        </Button>
                        <Text style={footerText}>
                            Lionel Yu Piano Studio
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    )
}

const main = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '40px 20px', maxWidth: '560px', borderRadius: '8px' }
const heading = { fontSize: '26px', fontWeight: '600', textAlign: 'center' as const, margin: '0 0 8px', color: '#1a1a1a' }
const dateLine = { fontSize: '15px', fontWeight: '600', textAlign: 'center' as const, margin: '0 0 28px', color: '#b45309' }
const section = { padding: '0 20px' }
const bodyText = { fontSize: '14px', lineHeight: '24px', color: '#555', margin: '0 0 16px' }
const buttonBase = {
    borderRadius: '6px', color: '#fff', fontSize: '15px', fontWeight: '600', textDecoration: 'none',
    textAlign: 'center' as const, display: 'block', padding: '13px 24px',
}
const attendButton = { ...buttonBase, backgroundColor: '#10b981', margin: '28px auto 12px' }
const declineButton = { ...buttonBase, backgroundColor: '#6b7280', margin: '0 auto 8px' }
const footerText = { fontSize: '12px', color: '#999', textAlign: 'center' as const, margin: '28px 0 0' }
