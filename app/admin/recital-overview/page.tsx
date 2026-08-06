import { redirect } from "next/navigation"

// Alias: the review page lives at /admin/recital-review.
export default function RecitalOverviewRedirect() {
    redirect("/admin/recital-review")
}
