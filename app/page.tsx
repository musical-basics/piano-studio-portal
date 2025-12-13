import { createClient } from "@/lib/supabase/server"
import { DynamicLandingPage } from "@/components/dynamic-landing-page"
import { StaticLandingPage } from "@/components/static-landing-page"

export const dynamic = 'force-dynamic'

export default async function LandingPage() {
  const supabase = await createClient()

  // Fetch the home page content
  const { data: page } = await supabase
    .from('site_pages')
    .select('*')
    .eq('id', 'home')
    .single()

  // If dynamic content exists, render it
  if (page && page.html_template) {
    // Replace variables in the template
    let html = page.html_template
    const variables = page.variable_values || {}

    Object.entries(variables).forEach(([key, value]) => {
      html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value as string)
    })

    return (
      <DynamicLandingPage
        html={html}
        script={page.script_content || ""}
      />
    )
  }

  // Otherwise, render the static landing page
  return <StaticLandingPage />
}
