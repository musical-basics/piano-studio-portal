import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Text,
    Section,
    Hr,
} from "@react-email/components"
import * as React from "react"

interface RecordingReadyEmailProps {
    studentName: string
    lessonDate?: string
    dashboardUrl: string
    studioName?: string
}

export const RecordingReadyEmail = ({
    studentName,
    lessonDate,
    dashboardUrl,
    studioName = "Lionel Yu Piano Studio",
}: RecordingReadyEmailProps) => {
    const subject = "Your lesson recording is ready 🎹"

    return (
        <Html>
            <Head />
            <Preview>{subject}</Preview>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Text style={headerText}>🎹</Text>
                    </Section>

                    <Heading style={h1}>Your Recording Is Ready</Heading>

                    <Text style={text}>Hi {studentName},</Text>
                    <Text style={text}>
                        {lessonDate
                            ? `The recording from your lesson on ${lessonDate} is now available on your student homepage and ready to watch.`
                            : "Your latest lesson recording is now available on your student homepage and ready to watch."}
                    </Text>

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Button style={button} href={dashboardUrl}>
                            Watch Your Recording →
                        </Button>
                    </Section>

                    <Text style={hint}>
                        Open your <strong>Lessons</strong> on the student homepage and click the
                        lesson to play the recording.
                    </Text>

                    <Text style={hint}>
                        If you have any trouble viewing it, just reply to this email and let us know.
                    </Text>

                    <Hr style={hr} />

                    <Text style={footer}>
                        Keep practicing! 🎵<br />
                        {studioName}
                    </Text>
                </Container>
            </Body>
        </Html>
    )
}

export default RecordingReadyEmail

// ─── Styles ──────────────────────────────────────────────────────────────────

const main = {
    backgroundColor: "#f9fafb",
    fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
}

const container = {
    margin: "0 auto",
    padding: "20px 0 48px",
    maxWidth: "560px",
}

const header = {
    textAlign: "center" as const,
    padding: "32px 0 8px",
}

const headerText = {
    fontSize: "40px",
    margin: "0",
}

const h1 = {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1a1a1a",
    textAlign: "center" as const,
    marginBottom: "8px",
}

const text = {
    fontSize: "15px",
    lineHeight: "26px",
    color: "#444",
    marginBottom: "12px",
}

const ctaSection = {
    textAlign: "center" as const,
    marginTop: "24px",
    marginBottom: "20px",
}

const button = {
    backgroundColor: "#4f46e5",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "15px",
    fontWeight: "600" as const,
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 28px",
}

const hint = {
    fontSize: "13px",
    color: "#6b7280",
    lineHeight: "20px",
    textAlign: "center" as const,
    marginBottom: "12px",
}

const hr = {
    borderColor: "#e5e7eb",
    margin: "20px 0",
}

const footer = {
    color: "#9ca3af",
    fontSize: "12px",
    textAlign: "center" as const,
}
