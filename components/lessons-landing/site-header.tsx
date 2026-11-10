"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Menu as MenuIcon, Search, ShoppingBag, User, X } from "lucide-react"
import { MAIN_MENU, SOCIAL_LINKS, STORE, type NavItem } from "./site-links"
import { SocialIcon } from "./social-icon"

/**
 * The MusicalBasics header from the main site: dark bar, search on the left,
 * centered logo, Login and cart on the right, a centered menu row, and a
 * drawer below 990px. Login goes to this portal's sign-in; search, cart and
 * the store menu go to musicalbasics.com.
 */

const LOGIN_HREF = "/login"

function NavLink({ item, className, onClick }: { item: NavItem; className?: string; onClick?: () => void }) {
    if (item.href.startsWith("/")) {
        return (
            <Link href={item.href} className={className} onClick={onClick}>
                {item.title}
            </Link>
        )
    }
    return (
        <a href={item.href} className={className} onClick={onClick}>
            {item.title}
        </a>
    )
}

function Dropdown({ item, open, onToggle, onClose }: { item: NavItem; open: boolean; onToggle: () => void; onClose: () => void }) {
    const ref = useRef<HTMLLIElement>(null)
    const panelId = useId()

    useEffect(() => {
        if (!open) return
        const onPointer = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose()
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose()
        }
        document.addEventListener("mousedown", onPointer)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", onPointer)
            document.removeEventListener("keydown", onKey)
        }
    }, [open, onClose])

    return (
        <li ref={ref} className="relative">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={onToggle}
                className={`flex items-center gap-1.5 px-3 py-3 transition-colors hover:text-[rgb(var(--mb-fg))] ${open ? "text-[rgb(var(--mb-fg))]" : ""}`}
            >
                <span className="hover:underline hover:underline-offset-[5px]">{item.title}</span>
                <ChevronDown size={14} strokeWidth={1.5} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open ? (
                <ul
                    id={panelId}
                    className="mb-scheme-accent1 absolute left-0 top-full z-40 min-w-[240px] rounded-b-[6px] border border-white/15 py-4 shadow-lg"
                >
                    {item.items?.map((child) => (
                        <li key={child.title}>
                            <NavLink
                                item={child}
                                onClick={onClose}
                                className="block px-6 py-2 text-[16.25px] leading-snug text-[rgba(var(--mb-fg),0.75)] transition-colors hover:text-[rgb(var(--mb-fg))] hover:underline hover:underline-offset-4"
                            />
                        </li>
                    ))}
                </ul>
            ) : null}
        </li>
    )
}

function MobileItem({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
    const [expanded, setExpanded] = useState(false)
    const panelId = useId()
    if (!item.items?.length) {
        return (
            <li>
                <NavLink
                    item={item}
                    onClick={onNavigate}
                    className={`block px-8 py-3.5 text-[22.5px] ${item.href === "/" ? "text-[rgb(var(--mb-fg))] underline underline-offset-4" : ""}`}
                />
            </li>
        )
    }
    return (
        <li>
            <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-8 py-3.5 text-left text-[22.5px]"
            >
                {item.title}
                <ChevronDown size={18} strokeWidth={1.25} aria-hidden className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? (
                <ul id={panelId} className="bg-white/[0.04] py-2">
                    {item.items.map((child) => (
                        <li key={child.title}>
                            <NavLink item={child} onClick={onNavigate} className="block px-12 py-2.5 text-[18px]" />
                        </li>
                    ))}
                </ul>
            ) : null}
        </li>
    )
}

export function SiteHeader() {
    const [dropdown, setDropdown] = useState<string | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const closeDropdown = () => setDropdown(null)

    // Lock page scroll behind the open mobile drawer.
    useEffect(() => {
        if (!drawerOpen) return
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = previous
        }
    }, [drawerOpen])

    // Sticky header that slides away while scrolling down and returns on scroll up.
    const [scrolledAway, setScrolledAway] = useState(false)
    useEffect(() => {
        let lastY = window.scrollY
        const onScroll = () => {
            const y = window.scrollY
            if (y > lastY && y > 240) setScrolledAway(true)
            else if (y < lastY - 4 || y <= 240) setScrolledAway(false)
            lastY = y
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])
    const hidden = scrolledAway && !dropdown && !drawerOpen

    return (
        <header className={`mb-scheme-accent1 sticky top-0 z-40 transition-transform duration-300 ${hidden ? "-translate-y-full" : ""}`}>
            <div className="mb-page-width grid grid-cols-[1fr_auto_1fr] items-center pb-3 pt-3 lg:pb-0 lg:pt-7">
                <div className="flex items-center gap-1 text-[rgb(var(--mb-fg))]">
                    <button
                        type="button"
                        className="-ml-2 flex h-11 w-11 items-center justify-center lg:hidden"
                        aria-label={drawerOpen ? "Close menu" : "Menu"}
                        aria-expanded={drawerOpen}
                        onClick={() => setDrawerOpen((v) => !v)}
                    >
                        {drawerOpen ? <X size={26} strokeWidth={1.25} aria-hidden /> : <MenuIcon size={26} strokeWidth={1.25} aria-hidden />}
                    </button>
                    <a
                        href={`${STORE}/search`}
                        className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-105"
                        aria-label="Search MusicalBasics"
                    >
                        <Search size={26} strokeWidth={1.25} aria-hidden />
                    </a>
                </div>

                <a href={`${STORE}/`} className="block" aria-label="MusicalBasics home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/landing/musicalbasics-logo.png"
                        alt="MusicalBasics"
                        width={100}
                        height={100}
                        className="h-[72px] w-[72px] lg:h-[100px] lg:w-[100px]"
                    />
                </a>

                <div className="flex items-center justify-end gap-1 text-[rgb(var(--mb-fg))]">
                    <Link
                        href={LOGIN_HREF}
                        className="hidden px-2 text-[17.5px] text-[rgba(var(--mb-fg),0.75)] transition-colors hover:text-[rgb(var(--mb-fg))] hover:underline hover:underline-offset-4 sm:inline"
                    >
                        Login
                    </Link>
                    <Link href={LOGIN_HREF} className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-105" aria-label="Student login">
                        <User size={28} strokeWidth={1.2} aria-hidden />
                    </Link>
                    <a
                        href={`${STORE}/cart`}
                        className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-105"
                        aria-label="MusicalBasics cart"
                    >
                        <ShoppingBag size={28} strokeWidth={1.2} aria-hidden />
                    </a>
                </div>
            </div>

            <nav aria-label="Main" className="hidden lg:block">
                <ul className="mb-page-width flex flex-wrap items-center justify-center gap-x-1 pb-5 pt-5 text-[17.5px] text-[rgba(var(--mb-fg),0.75)]">
                    {MAIN_MENU.map((item) =>
                        item.items?.length ? (
                            <Dropdown
                                key={item.title}
                                item={item}
                                open={dropdown === item.title}
                                onToggle={() => setDropdown((d) => (d === item.title ? null : item.title))}
                                onClose={closeDropdown}
                            />
                        ) : (
                            <li key={item.title}>
                                <NavLink
                                    item={item}
                                    className={`block px-3 py-3 transition-colors hover:text-[rgb(var(--mb-fg))] ${
                                        item.href === "/"
                                            ? "text-[rgb(var(--mb-fg))] underline underline-offset-[5px]"
                                            : "hover:underline hover:underline-offset-[5px]"
                                    }`}
                                />
                            </li>
                        )
                    )}
                </ul>
            </nav>

            {drawerOpen ? (
                <div className="mb-scheme-accent1 fixed inset-x-0 bottom-0 top-[96px] z-40 overflow-y-auto border-t border-white/10 lg:hidden">
                    <nav aria-label="Main" className="flex min-h-full flex-col justify-between">
                        <ul className="py-4 text-[rgba(var(--mb-fg),0.85)]">
                            {MAIN_MENU.map((item) => (
                                <MobileItem key={item.title} item={item} onNavigate={() => setDrawerOpen(false)} />
                            ))}
                        </ul>
                        <div className="bg-white/[0.04] px-8 pb-10 pt-6">
                            <Link href={LOGIN_HREF} onClick={() => setDrawerOpen(false)} className="flex items-center gap-3 text-[18px] text-[rgb(var(--mb-fg))]">
                                <User size={22} strokeWidth={1.25} aria-hidden />
                                Log in
                            </Link>
                            <ul className="mt-6 flex flex-wrap gap-5 text-[rgb(var(--mb-fg))]">
                                {SOCIAL_LINKS.map((s) => (
                                    <li key={s.name}>
                                        <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} className="block p-1">
                                            <SocialIcon name={s.icon} size={20} />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </nav>
                </div>
            ) : null}
        </header>
    )
}
