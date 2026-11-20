import Link from "next/link"
import { ArrowLeft, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmailSampleViewer } from "@/components/admin/email-sample-viewer"
import { FAMILY_EMAIL_GROUPS, NOT_SHOWN, buildFamilyEmailSamples, type FamilyEmail } from "@/lib/family-email-samples"

// The body of /admin/emails (Lionel's #1003): every email the portal sends
// families, each filled in with made-up details, so all the wording can be read
// in one place. The samples come from the same builders the senders use
// (lib/family-emails.ts via lib/family-email-samples.ts), so they are word for
// word what goes out. The page (app/admin/emails/page.tsx) checks for the admin
// login before showing this.

function EmailCard({ email }: { email: FamilyEmail }) {
    return (
        <Card id={email.id} className="scroll-mt-4">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg">{email.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
                    <dt className="text-muted-foreground">When</dt>
                    <dd>{email.when}</dd>
                    <dt className="text-muted-foreground">Who gets it</dt>
                    <dd>{email.who}</dd>
                    {email.note && (
                        <>
                            <dt className="text-muted-foreground">Good to know</dt>
                            <dd>{email.note}</dd>
                        </>
                    )}
                </dl>
                <EmailSampleViewer
                    name={email.name}
                    samples={email.samples.map(s => ({ label: s.label, subject: s.subject, preview: s.preview, html: s.html }))}
                />
            </CardContent>
        </Card>
    )
}

export async function FamilyEmailsView() {
    let emails: FamilyEmail[] = []
    let loadError: string | null = null
    try {
        emails = await buildFamilyEmailSamples()
    } catch (e) {
        loadError = e instanceof Error ? e.message : String(e)
    }

    const groups = FAMILY_EMAIL_GROUPS
        .map(group => ({ group, emails: emails.filter(e => e.group === group) }))
        .filter(g => g.emails.length)

    return (
        <main id="top" className="container mx-auto max-w-3xl space-y-6 px-4 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Mail className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Family emails</h1>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/admin" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to admin
                    </Link>
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                Every email the portal sends families, filled in with made-up details for the test student (Piano Student,
                a family on Pacific time, so times show Eastern with their own time). The wording comes from the same code
                that sends each email, so this is exactly what families read. To change any of it, say which email and what
                it should say.
            </p>

            {loadError ? (
                <Card>
                    <CardContent className="pt-6 text-sm text-red-700 dark:text-red-400">
                        Couldn&apos;t build the samples: {loadError}
                    </CardContent>
                </Card>
            ) : (
                <>
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">{emails.length} emails</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <nav aria-label="Emails on this page" className="grid gap-4 text-sm sm:grid-cols-2">
                                {groups.map(({ group, emails: list }) => (
                                    <div key={group}>
                                        <p className="font-medium">{group}</p>
                                        <ul className="mt-1 space-y-1">
                                            {list.map(e => (
                                                <li key={e.id}>
                                                    <a href={`#${e.id}`} className="text-primary underline underline-offset-4 hover:no-underline">
                                                        {e.name}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                                <div>
                                    <a href="#not-shown" className="font-medium text-primary underline underline-offset-4 hover:no-underline">
                                        Not on this page
                                    </a>
                                </div>
                            </nav>
                        </CardContent>
                    </Card>

                    {groups.map(({ group, emails: list }) => (
                        <section key={group} aria-label={group} className="space-y-4">
                            <div className="flex items-baseline justify-between gap-3 pt-2">
                                <h2 className="text-xl font-semibold">{group}</h2>
                                <a href="#top" className="text-xs text-muted-foreground hover:underline">Back to the list</a>
                            </div>
                            {list.map(email => <EmailCard key={email.id} email={email} />)}
                        </section>
                    ))}

                    <Card id="not-shown" className="scroll-mt-4">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg">Not on this page</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm">
                                {NOT_SHOWN.map(item => (
                                    <li key={item.name}>
                                        <span className="font-medium">{item.name}:</span>{" "}
                                        <span className="text-muted-foreground">{item.where}</span>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                </>
            )}
        </main>
    )
}
