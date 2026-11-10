/**
 * Links for the landing page's MusicalBasics header and footer. They mirror the
 * main site's Shopify menus (snapshot in musicalbasics-monorepo's SiteChrome,
 * 2026-09-18) and point at musicalbasics.com, which keeps these paths after it
 * moves off Shopify. "Lessons" is this site.
 */

export const STORE = "https://musicalbasics.com"

export type NavItem = { title: string; href: string; items?: NavItem[] }

export const MAIN_MENU: NavItem[] = [
    { title: "Lessons", href: "/" },
    { title: "Home", href: `${STORE}/` },
    {
        title: "Info",
        href: `${STORE}/pages/about`,
        items: [
            { title: "About", href: `${STORE}/pages/about` },
            { title: "Stories", href: `${STORE}/pages/stories` },
            { title: "FAQs", href: `${STORE}/pages/faqs` },
            { title: "References", href: `${STORE}/pages/references` },
        ],
    },
    {
        title: "Store",
        href: `${STORE}/collections/all`,
        items: [
            { title: "All Sheet Music", href: `${STORE}/collections/all` },
            { title: "Staff Picks", href: `${STORE}/collections/staff-picks` },
            { title: "Request A Song", href: `${STORE}/pages/request-a-song` },
        ],
    },
    { title: "Memberships", href: `${STORE}/pages/membership` },
    { title: "Members Area", href: `${STORE}/pages/member-area` },
]

export const FOOTER_MENU: NavItem[] = [
    { title: "Search", href: `${STORE}/search` },
    { title: "Become A Member", href: `${STORE}/pages/membership` },
    { title: "Request A Song", href: `${STORE}/pages/request-a-song` },
    { title: "FAQs", href: `${STORE}/pages/faqs` },
    { title: "Useful Links", href: `${STORE}/pages/references` },
    { title: "Refund Policy", href: `${STORE}/policies/refund-policy` },
    { title: "Terms of Service", href: `${STORE}/policies/terms-of-service` },
    // The studio's own pages. Twilio's texting approval cites both, so keep them linked.
    { title: "Text Messages", href: "/texting" },
    { title: "Privacy Policy", href: "/privacy" },
]

/** The main site's mailing list signup posts to the Shopify store, exactly like the main site's footer. */
export const NEWSLETTER_ACTION = "https://musicalbasics.myshopify.com/contact#ContactFooter"

export const SOCIAL_LINKS = [
    { name: "Twitter", href: "https://twitter.com/musicalbasics", icon: "x" },
    { name: "Facebook", href: "https://www.facebook.com/musicalBasicsmusic", icon: "facebook" },
    { name: "Pinterest", href: "https://www.pinterest.com/musicalbasics/", icon: "pinterest" },
    { name: "Instagram", href: "https://www.instagram.com/musicalbasics", icon: "instagram" },
    { name: "TikTok", href: "https://www.tiktok.com/@musicalbasics", icon: "tiktok" },
    { name: "YouTube", href: "https://www.youtube.com/musicalbasics", icon: "youtube" },
] as const

export type SocialIconName = (typeof SOCIAL_LINKS)[number]["icon"]
