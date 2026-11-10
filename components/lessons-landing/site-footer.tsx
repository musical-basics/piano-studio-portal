import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { FOOTER_MENU, NEWSLETTER_ACTION, SOCIAL_LINKS, STORE } from "./site-links"
import { SocialIcon } from "./social-icon"

const linkClass =
    "text-[17.5px] text-[rgba(var(--mb-fg),0.75)] transition-colors hover:text-[rgb(var(--mb-fg))] hover:underline hover:underline-offset-4"

/** The MusicalBasics footer from the main site: menu links, mailing list signup, socials and copyright. */
export function SiteFooter() {
    const year = new Date().getFullYear()
    return (
        <footer className="mb-scheme-accent1 mt-auto">
            <div className="mb-page-width pb-8 pt-8 md:pt-10">
                <nav aria-label="Footer">
                    <ul className="flex flex-col gap-3 md:flex-row md:flex-wrap md:justify-center md:gap-x-7 md:gap-y-2">
                        {FOOTER_MENU.map((item) => (
                            <li key={item.title}>
                                {item.href.startsWith("/") ? (
                                    <Link href={item.href} className={linkClass}>
                                        {item.title}
                                    </Link>
                                ) : (
                                    <a href={item.href} className={linkClass}>
                                        {item.title}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="mt-10 flex flex-col gap-10 md:mt-12 md:flex-row md:items-end md:justify-between">
                    <div className="w-full md:max-w-[450px]">
                        <h2 className="mb-h3 text-center md:text-left">Subscribe to MusicalBasics Mailing List</h2>
                        <form method="post" action={NEWSLETTER_ACTION} acceptCharset="UTF-8" className="mt-5 flex flex-col gap-4">
                            <input type="hidden" name="form_type" value="customer" />
                            <input type="hidden" name="utf8" value="✓" />
                            <input type="hidden" name="contact[tags]" value="newsletter" />
                            <label className="mb-visually-hidden" htmlFor="footer-first-name">
                                First Name
                            </label>
                            <input
                                id="footer-first-name"
                                name="contact[first_name]"
                                type="text"
                                required
                                autoComplete="given-name"
                                placeholder="First Name"
                                className="mb-field"
                            />
                            <label className="mb-visually-hidden" htmlFor="footer-last-name">
                                Last Name
                            </label>
                            <input
                                id="footer-last-name"
                                name="contact[last_name]"
                                type="text"
                                autoComplete="family-name"
                                placeholder="Last Name"
                                className="mb-field"
                            />
                            <label className="mb-visually-hidden" htmlFor="footer-email">
                                Email
                            </label>
                            <div className="relative">
                                <input
                                    id="footer-email"
                                    name="contact[email]"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    placeholder="Email"
                                    className="mb-field mb-field--icon"
                                />
                                <button
                                    type="submit"
                                    aria-label="Subscribe"
                                    className="absolute right-0 top-0 flex h-full w-14 items-center justify-center text-[rgb(var(--mb-fg))] transition-transform hover:translate-x-0.5"
                                >
                                    <ArrowRight size={18} strokeWidth={1.25} aria-hidden />
                                </button>
                            </div>
                        </form>
                    </div>

                    <ul className="flex justify-center gap-2 md:justify-end" aria-label="Social media">
                        {SOCIAL_LINKS.map((s) => (
                            <li key={s.name}>
                                <a
                                    href={s.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={s.name}
                                    className="flex h-11 w-11 items-center justify-center text-[rgb(var(--mb-fg))] transition-transform hover:scale-110"
                                >
                                    <SocialIcon name={s.icon} size={19} />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="border-t border-white/10">
                <div className="mb-page-width flex justify-center py-6 md:justify-end">
                    <p className="mb-caption text-[rgba(var(--mb-fg),0.75)]">
                        &copy; {year},{" "}
                        <a href={`${STORE}/`} className="hover:underline">
                            MusicalBasics
                        </a>
                    </p>
                </div>
            </div>
        </footer>
    )
}
