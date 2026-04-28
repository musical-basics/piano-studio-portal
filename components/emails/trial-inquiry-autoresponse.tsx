import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from '@react-email/components'

interface TrialInquiryAutoResponseProps {
    firstName: string
    studioName?: string
}

export function TrialInquiryAutoResponse({
    firstName,
    studioName = 'Lionel Yu Piano Studio',
}: TrialInquiryAutoResponseProps) {
    return (
        <Html>
            <Head />
            <Preview>Got it — I&apos;ll be in touch within 48 hours</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Heading style={heading}>{studioName}</Heading>

                    <Section style={section}>
                        <Text style={greeting}>Hi {firstName},</Text>

                        <Text style={text}>
                            Thanks for your interest in lessons. Your trial request just came through.
                        </Text>

                        <Text style={subheading}>Here&apos;s what happens next</Text>
                        <Text style={text}>
                            I personally read every inquiry, and I&apos;ll reply within <strong>48 hours</strong> with a few proposed times for your free 15-minute trial. The trial happens on Zoom and we&apos;ll use it to talk through your goals, hear you play (if you already do), and figure out together whether quarterly enrollment is the right fit.
                        </Text>

                        <Text style={text}>
                            If you don&apos;t hear from me within 48 hours, please reply to this email — sometimes things get lost in spam, and I&apos;d rather you nudge me than assume I forgot.
                        </Text>

                        <Hr style={divider} />

                        <Text style={subheading}>A bit about what you&apos;re considering</Text>
                        <Text style={text}>
                            Quarterly enrollment includes 12 private lessons over 3 months (with a buffer month for makeups), full access to my premium masterclass library while you&apos;re enrolled, lesson recordings, custom sheet music tailored to your goals, and twice-yearly online recitals. Full details and pricing are at{' '}
                            <Link href="https://lessons.musicalbasics.com" style={link}>
                                lessons.musicalbasics.com
                            </Link>
                            .
                        </Text>

                        <Text style={text}>
                            But none of that matters until we meet. Looking forward to it.
                        </Text>

                        <Text style={signoff}>
                            Lionel<br />
                            {studioName}
                        </Text>
                    </Section>

                    <Text style={footer}>
                        © {studioName} • You received this email because you submitted a trial lesson inquiry.
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

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
    fontSize: '22px',
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

const subheading = {
    fontSize: '15px',
    fontWeight: '600' as const,
    color: '#1a1a1a',
    margin: '24px 0 8px',
}

const text = {
    fontSize: '14px',
    lineHeight: '24px',
    color: '#444',
    margin: '0 0 16px',
}

const divider = {
    borderColor: '#e5e7eb',
    margin: '24px 0',
}

const link = {
    color: '#1a1a1a',
    textDecoration: 'underline',
}

const signoff = {
    fontSize: '14px',
    lineHeight: '22px',
    color: '#444',
    margin: '24px 0 0',
}

const footer = {
    fontSize: '12px',
    color: '#8898aa',
    textAlign: 'center' as const,
    marginTop: '32px',
}

export default TrialInquiryAutoResponse
