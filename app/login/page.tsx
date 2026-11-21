import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { afterSignIn } from "@/lib/safe-next"

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string | string[] }>
}) {
  const asked = (await searchParams)?.next
  const next = typeof asked === "string" ? asked : undefined

  const supabase = await createClient()

  // 1. Check if the user is already logged in
  const { data: { user } } = await supabase.auth.getUser()

  // 2. If they are, send them straight on: to the page they came for (#1925,
  //    e.g. a chat opened from an email), else their own home (admin to /admin).
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    redirect(afterSignIn(next, profile?.role))
  }

  // 3. If not, render the login page, remembering where to go after
  return <LoginForm next={next} />
}
