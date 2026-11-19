import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import * as React from "react";
import type { StatementContent } from "@/lib/monthly-statements";

/**
 * The monthly statement each family gets on the 1st (#936). Every word comes
 * from buildStatement (lib/monthly-statements.ts), which also writes the plain
 * text version, so the two always say the same thing.
 */
export const MonthlyStatementEmail = ({ content }: { content: StatementContent }) => (
    <Html>
        <Head />
        <Preview>{content.preview}</Preview>
        <Body style={main}>
            <Container style={container}>
                <Heading style={h1}>{content.heading}</Heading>
                <Text style={text}>{content.greeting}</Text>
                <Text style={text}>{content.intro}</Text>

                <Section style={box}>
                    {content.rows.map(row => (
                        <Text key={row.label} style={rowText}>
                            <span style={rowLabel}>{row.label}:</span> {row.value}
                        </Text>
                    ))}
                </Section>

                <Text style={text}>{content.historyLine}</Text>
                <Button style={button} href={content.historyUrl}>
                    Open the History tab
                </Button>

                {content.replyLine && <Text style={text}>{content.replyLine}</Text>}

                <Text style={text}>
                    {content.closing}
                    <br />
                    {content.signature}
                </Text>

                <Hr style={hr} />
                <Text style={footer}>Lionel Yu Piano Studio</Text>
            </Container>
        </Body>
    </Html>
);

export default MonthlyStatementEmail;

// Same look as the Lesson Notes email (lesson-logged-email.tsx).
const main = {
    backgroundColor: "#ffffff",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
    margin: "0 auto",
    padding: "20px 16px 48px",
    maxWidth: "560px",
};

const h1 = {
    fontSize: "22px",
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: "24px",
};

const text = {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#333",
    margin: "0 0 16px",
};

const box = {
    padding: "16px 24px",
    backgroundColor: "#f9f9f9",
    borderRadius: "12px",
    border: "1px solid #eaeaea",
    marginBottom: "24px",
};

const rowText = {
    fontSize: "16px",
    lineHeight: "24px",
    color: "#333",
    margin: "6px 0",
};

const rowLabel = {
    fontWeight: "bold" as const,
    color: "#1a1a1a",
};

const button = {
    backgroundColor: "#1a1a1a",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "600",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "12px 22px",
    marginBottom: "24px",
};

const hr = {
    borderColor: "#e6ebf1",
    margin: "20px 0",
};

const footer = {
    color: "#8898aa",
    fontSize: "12px",
};
