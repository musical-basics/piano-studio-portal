import Link from "next/link"
import { Music, ArrowLeft } from "lucide-react"

/** Header, title block and footer shared by the studio's public text pages (texting terms, privacy). */
export function PublicPageShell({
    title,
    intro,
    children,
}: {
    title: string
    intro: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="bg-white text-gray-950 font-sans antialiased">
            <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2">
                        <Music className="h-6 w-6" />
                        <span className="font-serif text-xl font-bold">Lionel Yu Piano Studio</span>
                    </Link>
                    <Link
                        href="/login"
                        className="px-4 py-2 border border-gray-200 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        Student Login
                    </Link>
                </div>
            </nav>

            <div className="h-16" />

            <section className="py-16 lg:py-24">
                <div className="max-w-3xl mx-auto px-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black transition-colors mb-8"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to home
                    </Link>

                    <div className="space-y-4 mb-12">
                        <h1 className="font-serif text-4xl lg:text-5xl font-bold">{title}</h1>
                        <div className="text-lg text-gray-500">{intro}</div>
                        <div className="h-1 w-20 bg-black" />
                    </div>

                    <div className="space-y-12">{children}</div>
                </div>
            </section>

            <footer className="border-t border-gray-100 bg-gray-50/50">
                <div className="max-w-7xl mx-auto px-4 py-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
                    <span>© {new Date().getFullYear()} Lionel Yu Piano Studio</span>
                    <Link href="/texting" className="hover:text-black">Text messages</Link>
                    <Link href="/privacy" className="hover:text-black">Privacy policy</Link>
                    <a href="mailto:support@musicalbasics.com" className="hover:text-black">support@musicalbasics.com</a>
                </div>
            </footer>
        </div>
    )
}

export function PublicSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="font-serif text-2xl font-bold">{title}</h2>
            <div className="space-y-3 text-gray-600 leading-relaxed">{children}</div>
        </section>
    )
}
