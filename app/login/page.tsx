
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"

export default async function LoginPage() {
  const supabase = await createClient()

  // 1. Check if the user is already logged in
  const { data: { user } } = await supabase.auth.getUser()

  // 2. If they are, kick them to the dashboard immediately
  if (user) {
    redirect('/student')
  }

  // 3. If not, render the login page as usual
  return <LoginForm />
}
