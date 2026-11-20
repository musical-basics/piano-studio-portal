import type { MetadataRoute } from "next"

/**
 * The web app manifest (#1081): lets a family put the student portal on a
 * phone's home screen with its own icon, opening full screen like an app.
 *
 * Android Chrome offers "Install" once the manifest has a name, a start_url,
 * display "standalone" and 192 and 512 icons; no service worker is needed, so
 * none is registered and nothing signed-in is ever cached.
 *
 * The scope is the whole site so the sign-in pages (/login, /auth/callback,
 * /reset-password) stay inside the app instead of opening a browser bar. On
 * Android a link to this site (an email's sign-in or reset link) opens in the
 * installed app. iPhone keeps a home-screen app's sign-in apart from Safari,
 * so a family signs in once inside the app.
 *
 * Icons: the portal header's mark (white note on the portal's near-black),
 * made by a one-off script; public/icons and app/apple-icon.png.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/student",
        name: "Lionel Yu Piano Studio",
        short_name: "Piano Studio",
        description: "Your lessons, messages, recordings and homework.",
        start_url: "/student",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    }
}
