import type { Metadata } from "next"
import { LessonsLandingPage } from "@/components/lessons-landing/lessons-landing-page"

export const metadata: Metadata = {
  title: "Private Piano Lessons with Lionel Yu",
  description:
    "Private piano and improvisation lessons with Lionel Yu, for complete beginners through to working professionals.",
}

// The "studio is full" notice names the current month, so rebuild the page hourly.
export const revalidate = 3600

export default function LandingPage() {
  return <LessonsLandingPage />
}
