import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Text,
    Section,
    Hr,
    Link,
} from "@react-email/components";
import * as React from "react";

interface LessonLoggedEmailProps {
    studentName: string;
    date: string;
    notes: string;
    nextLessonDate?: string;
    sheetMusicUrl?: string;
    sheetMusicFileName?: string;
}

export const LessonLoggedEmail = ({
    studentName,
    date,
    notes,
    nextLessonDate,
    sheetMusicUrl,
    sheetMusicFileName,
}: LessonLoggedEmailProps) => (
    <Html>
        <Head />
        <Preview>Here are the notes from your lesson on {date}</Preview>
        <Body style={main}>
            <Container style={container}>
                <Heading style={h1}>Lesson Summary</Heading>
                <Text style={text}>Hi {studentName},</Text>
                <Text style={text}>
                    Great work today! Here are the notes and practice assignments from your lesson on <strong>{date}</strong>.
                </Text>

                <Section style={box}>
                    <Heading as="h2" style={h2}>Instructor Notes:</Heading>
                    <Text style={notesText}>{notes}</Text>
                </Section>

                {sheetMusicUrl && (
                    <Section style={sheetMusicBox}>
                        <Heading as="h2" style={h2}>📄 Sheet Music Attached:</Heading>
                        <Text style={text}>
                            <Link href={sheetMusicUrl} style={linkStyle}>
                                {sheetMusicFileName || 'Download Sheet Music (PDF)'}
                            </Link>
                        </Text>
                    </Section>
                )}

                {nextLessonDate && (
                    <Text style={text}>
                        We look forward to seeing you again on <strong>{nextLessonDate}</strong>!
                    </Text>
                )}

                <Hr style={hr} />

                <Text style={footer}>
                    Keep practicing! 🎹<br />
                    Lionel Yu Piano Studio
                </Text>
            </Container>
        </Body>
    </Html>
);

export default LessonLoggedEmail;

// Styles (Matching your minimalist aesthetic)
const main = {
    backgroundColor: "#ffffff",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
    margin: "0 auto",
    padding: "20px 0 48px",
    maxWidth: "560px",
};

const h1 = {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: "24px",
};

const h2 = {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#444",
    marginTop: "0",
};

const text = {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#333",
    marginBottom: "16px",
};

const notesText = {
    fontSize: "15px",
    lineHeight: "24px",
    color: "#333",
    whiteSpace: "pre-wrap" as const, // Preserves line breaks in your notes
};

const box = {
    padding: "24px",
    backgroundColor: "#f9f9f9",
    borderRadius: "12px",
    border: "1px solid #eaeaea",
    marginBottom: "24px",
};

const hr = {
    borderColor: "#e6ebf1",
    margin: "20px 0",
};

const sheetMusicBox = {
    padding: "16px 24px",
    backgroundColor: "#f0fdf4",
    borderRadius: "12px",
    border: "1px solid #bbf7d0",
    marginBottom: "24px",
};

const linkStyle = {
    color: "#16a34a",
    textDecoration: "underline",
    fontWeight: "500" as const,
};

const footer = {
    color: "#8898aa",
    fontSize: "12px",
};