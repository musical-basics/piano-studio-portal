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
    Row,
    Column,
} from "@react-email/components"
import * as React from "react"

interface NewRecordingEmailProps {
    studentName: string
    newFiles: { name: string; formattedName: string; date: string }[]
    dashboardUrl: string
    studioName?: string
}

export const NewRecordingEmail = ({
    studentName,
    newFiles,
    dashboardUrl,
    studioName = "Lionel Yu Piano Studio",
}: NewRecordingEmailProps) => {
    const count = newFiles.length
    const subject = count === 1
        ? `New lesson recording available 🎹`
        : `${count} new lesson recordings available 🎹`

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

                    <Heading style={h1}>New Recording{count > 1 ? "s" : ""} Available</Heading>

                    <Text style={text}>Hi {studentName},</Text>
                    <Text style={text}>
                        {count === 1
                            ? "A new lesson recording has been added to your folder and is ready to watch."
                            : `${count} new lesson recordings have been added to your folder and are ready to watch.`
                        }
                    </Text>

                    {/* Recording list */}
                    <Section style={recordingsBox}>
                        <Heading as="h2" style={h2}>
                            📹 {count === 1 ? "New Recording" : "New Recordings"}:
                        </Heading>
                        {newFiles.map((file, i) => (
                            <Row key={i} style={recordingRow}>
                                <Column>
                                    <Text style={recordingName}>{file.formattedName}</Text>
                                    {file.date && (
                                        <Text style={recordingDate}>{file.date}</Text>
                                    )}
                                </Column>
                            </Row>
                        ))}
                    </Section>

                    {/* CTA */}
                    <Section style={ctaSection}>
                        <Button style={button} href={dashboardUrl}>
                            Watch Your Recordings →
                        </Button>
                    </Section>

                    <Text style={hint}>
                        You can find your recordings in the <strong>Lessons</strong> tab on your student dashboard by switching to <em>"Dropbox Live Folder"</em> view.
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

export default NewRecordingEmail

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

const h2 = {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#444",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginTop: "0",
    marginBottom: "12px",
}

const text = {
    fontSize: "15px",
    lineHeight: "26px",
    color: "#444",
    marginBottom: "12px",
}

const recordingsBox = {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "24px",
}

const recordingRow = {
    borderBottom: "1px solid #f3f4f6",
    paddingBottom: "10px",
    marginBottom: "10px",
}

const recordingName = {
    fontSize: "14px",
    fontWeight: "600" as const,
    color: "#111827",
    margin: "0 0 2px 0",
}

const recordingDate = {
    fontSize: "12px",
    color: "#6b7280",
    margin: "0",
}

const ctaSection = {
    textAlign: "center" as const,
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
    marginBottom: "20px",
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
