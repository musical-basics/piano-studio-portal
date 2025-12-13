"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Music, ArrowLeft, Save, Monitor, Smartphone, Code, Eye, Settings } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { savePage, getPage } from "@/app/actions/site-editor"

const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{site_title}}</title>
</head>
<body class="bg-white text-black font-sans">
  <!-- Navigation -->
  <nav class="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-b border-black/10 z-50">
    <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-2xl">♪</span>
        <span class="font-serif text-xl font-semibold">{{studio_name}}</span>
      </div>
      <a href="/login" class="px-4 py-2 border border-black text-sm hover:bg-black hover:text-white transition-colors">
        {{login_button_text}}
      </a>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="min-h-screen flex items-center pt-20">
    <div class="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <h1 class="font-serif text-5xl lg:text-6xl font-bold leading-tight mb-6">
          {{hero_headline}}
        </h1>
        <p class="text-xl text-gray-600 mb-8 leading-relaxed">
          {{hero_subheadline}}
        </p>
        <div class="flex flex-col sm:flex-row gap-4">
          <a href="#contact" class="px-8 py-4 bg-black text-white text-center hover:bg-gray-800 transition-colors">
            {{cta_primary}}
          </a>
          <a href="/login" class="px-8 py-4 border border-black text-center hover:bg-black hover:text-white transition-colors">
            {{cta_secondary}}
          </a>
        </div>
        <div class="flex gap-12 mt-12 pt-8 border-t border-gray-200">
          <div>
            <div class="font-serif text-3xl font-bold">{{stat_1_number}}</div>
            <div class="text-gray-500 text-sm">{{stat_1_label}}</div>
          </div>
          <div>
            <div class="font-serif text-3xl font-bold">{{stat_2_number}}</div>
            <div class="text-gray-500 text-sm">{{stat_2_label}}</div>
          </div>
          <div>
            <div class="font-serif text-3xl font-bold">{{stat_3_number}}</div>
            <div class="text-gray-500 text-sm">{{stat_3_label}}</div>
          </div>
        </div>
      </div>
      <div class="relative">
        <img src="{{hero_image_url}}" alt="Piano Teacher" class="w-full rounded-lg shadow-2xl" />
      </div>
    </div>
  </section>

  <!-- About Section -->
  <section class="py-24 bg-black text-white">
    <div class="max-w-6xl mx-auto px-6">
      <h2 class="font-serif text-4xl font-bold mb-6">{{about_title}}</h2>
      <div class="grid lg:grid-cols-2 gap-12">
        <p class="text-xl text-gray-300 leading-relaxed">
          {{about_paragraph_1}}
        </p>
        <p class="text-xl text-gray-300 leading-relaxed">
          {{about_paragraph_2}}
        </p>
      </div>
    </div>
  </section>

  <!-- Testimonials Section -->
  <section class="py-24">
    <div class="max-w-6xl mx-auto px-6">
      <h2 class="font-serif text-4xl font-bold mb-12 text-center">{{testimonials_title}}</h2>
      <div class="grid md:grid-cols-3 gap-8">
        <div class="p-8 border border-gray-200">
          <p class="text-gray-600 mb-6 italic">"{{testimonial_1_quote}}"</p>
          <div class="font-semibold">{{testimonial_1_name}}</div>
          <div class="text-sm text-gray-500">{{testimonial_1_role}}</div>
        </div>
        <div class="p-8 border border-gray-200">
          <p class="text-gray-600 mb-6 italic">"{{testimonial_2_quote}}"</p>
          <div class="font-semibold">{{testimonial_2_name}}</div>
          <div class="text-sm text-gray-500">{{testimonial_2_role}}</div>
        </div>
        <div class="p-8 border border-gray-200">
          <p class="text-gray-600 mb-6 italic">"{{testimonial_3_quote}}"</p>
          <div class="font-semibold">{{testimonial_3_name}}</div>
          <div class="text-sm text-gray-500">{{testimonial_3_role}}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-12 bg-black text-white">
    <div class="max-w-6xl mx-auto px-6 text-center">
      <p class="text-gray-400">{{footer_copyright}}</p>
    </div>
  </footer>
</body>
</html>`

const DEFAULT_VARIABLES: Record<string, string> = {
    site_title: "Piano Studio",
    studio_name: "Piano Studio",
    login_button_text: "Student Login",
    hero_headline: "Master Piano with Excellence",
    hero_subheadline:
        "Transform your musical journey with personalized instruction, flexible scheduling, and a proven system designed for serious students.",
    cta_primary: "Inquire for Lessons",
    cta_secondary: "Student Portal",
    stat_1_number: "15+",
    stat_1_label: "Years Teaching",
    stat_2_number: "200+",
    stat_2_label: "Students Taught",
    stat_3_number: "98%",
    stat_3_label: "Satisfaction Rate",
    hero_image_url: "/professional-piano-teacher-at-grand-piano-in-elega.jpg",
    about_title: "About Your Teacher",
    about_paragraph_1:
        "With over 15 years of dedicated teaching experience, I bring a wealth of knowledge from my training at prestigious conservatories and years of professional performance.",
    about_paragraph_2:
        "My teaching philosophy centers on building strong fundamentals while nurturing each student's unique musical voice. I believe in structured progress with room for creative exploration.",
    testimonials_title: "What Students Say",
    testimonial_1_quote:
        "The structured approach combined with flexibility has been perfect for my busy schedule. I've made more progress in 6 months than years of previous lessons.",
    testimonial_1_name: "Sarah Chen",
    testimonial_1_role: "Adult Student, 2 years",
    testimonial_2_quote:
        "My daughter has flourished under this instruction. The recitals and group classes have built her confidence tremendously.",
    testimonial_2_name: "Michael Torres",
    testimonial_2_role: "Parent of Emma, age 12",
    testimonial_3_quote:
        "Professional, demanding, but always supportive. Exactly what I needed to prepare for my conservatory auditions.",
    testimonial_3_name: "James Kim",
    testimonial_3_role: "Pre-Conservatory Student",
    footer_copyright: "© 2025 Piano Studio. All rights reserved.",
}

export default function Editor2Page() {
    const router = useRouter()
    const { toast } = useToast()

    // State
    const [htmlCode, setHtmlCode] = useState(DEFAULT_HTML_TEMPLATE)
    const [variables, setVariables] = useState<Record<string, string>>(DEFAULT_VARIABLES)
    const [scriptCode, setScriptCode] = useState("")
    const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">("desktop")
    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    // Load existing page data
    useEffect(() => {
        async function loadPage() {
            setIsLoading(true)
            const { page, error } = await getPage('home')
            if (error) {
                toast({ variant: "destructive", title: "Error", description: error })
            } else if (page) {
                // If we have saved content, use it. Otherwise fall back to default template
                setHtmlCode(page.html_template || DEFAULT_HTML_TEMPLATE)
                setScriptCode(page.script_content || "")
                // For variables, merge saved values with defaults to ensure all needed keys exist
                setVariables(prev => ({
                    ...DEFAULT_VARIABLES,
                    ...(page.variable_values || {})
                }))
            }
            setIsLoading(false)
        }
        loadPage()
    }, [toast])

    // Parse HTML for {{variable}} patterns
    const detectedVariables = useMemo(() => {
        const regex = /\{\{([\w_]+)\}\}/g
        const matches: string[] = []
        let match
        while ((match = regex.exec(htmlCode)) !== null) {
            if (!matches.includes(match[1])) {
                matches.push(match[1])
            }
        }
        return matches
    }, [htmlCode])

    // Initialize new variables when detected
    useEffect(() => {
        setVariables((prev) => {
            const updated = { ...prev }
            detectedVariables.forEach((varName) => {
                if (!(varName in updated)) {
                    updated[varName] = ""
                }
            })
            return updated
        })
    }, [detectedVariables])

    // Generate preview HTML with variables replaced
    const previewHtml = useMemo(() => {
        let result = htmlCode
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g")
            result = result.replace(regex, value || `{{${key}}}`)
        })

        // Inject Tailwind CDN into head
        if (result.includes("<head>")) {
            result = result.replace("<head>", `<head>\n  <script src="https://cdn.tailwindcss.com"><\/script>\n  <script>${scriptCode}<\/script>`)
        }

        return result
    }, [htmlCode, variables, scriptCode])

    const handleVariableChange = useCallback((varName: string, value: string) => {
        setVariables((prev) => ({ ...prev, [varName]: value }))
    }, [])

    const handleSave = async () => {
        setIsSaving(true)
        const result = await savePage('home', htmlCode, scriptCode, variables)
        setIsSaving(false)

        if (result.success) {
            toast({ title: "Saved!", description: "Landing page updated successfully." })
            router.refresh()
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error })
        }
    }

    // Format variable name for display
    const formatLabel = (varName: string) => {
        return varName
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")
    }

    // Group variables by section
    const groupedVariables = useMemo(() => {
        const groups: Record<string, string[]> = {
            General: [],
            "Hero Section": [],
            Statistics: [],
            "About Section": [],
            Testimonials: [],
            Footer: [],
            Other: [],
        }

        detectedVariables.forEach((varName) => {
            if (varName.includes("site_") || varName.includes("studio_") || varName.includes("login_")) {
                groups["General"].push(varName)
            } else if (varName.includes("hero_") || varName.includes("cta_")) {
                groups["Hero Section"].push(varName)
            } else if (varName.includes("stat_")) {
                groups["Statistics"].push(varName)
            } else if (varName.includes("about_")) {
                groups["About Section"].push(varName)
            } else if (varName.includes("testimonial")) {
                groups["Testimonials"].push(varName)
            } else if (varName.includes("footer_")) {
                groups["Footer"].push(varName)
            } else {
                groups["Other"].push(varName)
            }
        })

        return Object.entries(groups).filter(([, vars]) => vars.length > 0)
    }, [detectedVariables])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/admin")} className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Admin
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <div className="flex items-center gap-2">
                        <Music className="h-5 w-5" />
                        <span className="font-serif font-semibold">Site Builder</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center border border-border rounded-md overflow-hidden">
                        <Button
                            variant={deviceMode === "desktop" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setDeviceMode("desktop")}
                            className="rounded-none gap-1.5"
                        >
                            <Monitor className="h-4 w-4" />
                            Desktop
                        </Button>
                        <Button
                            variant={deviceMode === "mobile" ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setDeviceMode("mobile")}
                            className="rounded-none gap-1.5"
                        >
                            <Smartphone className="h-4 w-4" />
                            Mobile
                        </Button>
                    </div>
                    <Separator orientation="vertical" className="h-6" />
                    <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </header>

            {/* Main Content - 3 Column Layout */}
            <div className="flex-1 grid grid-cols-[280px_1fr_1fr] min-h-0">
                {/* Left Sidebar - Variables */}
                <div className="border-r border-border bg-card flex flex-col min-h-0">
                    <div className="p-4 border-b border-border shrink-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Settings className="h-4 w-4" />
                            Variables
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Edit content without touching code</p>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-6">
                            {groupedVariables.map(([groupName, vars]) => (
                                <div key={groupName}>
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                        {groupName}
                                    </h3>
                                    <div className="space-y-3">
                                        {vars.map((varName) => (
                                            <div key={varName}>
                                                <Label htmlFor={varName} className="text-xs font-medium">
                                                    {formatLabel(varName)}
                                                </Label>
                                                {variables[varName]?.length > 80 ? (
                                                    <Textarea
                                                        id={varName}
                                                        value={variables[varName] || ""}
                                                        onChange={(e) => handleVariableChange(varName, e.target.value)}
                                                        className="mt-1 text-sm min-h-[80px]"
                                                        placeholder={`Enter ${formatLabel(varName).toLowerCase()}`}
                                                    />
                                                ) : (
                                                    <Input
                                                        id={varName}
                                                        value={variables[varName] || ""}
                                                        onChange={(e) => handleVariableChange(varName, e.target.value)}
                                                        className="mt-1 text-sm"
                                                        placeholder={`Enter ${formatLabel(varName).toLowerCase()}`}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                {/* Middle - Code Editor */}
                <div className="border-r border-border bg-zinc-950 flex flex-col min-h-0">
                    <div className="p-4 border-b border-zinc-800 shrink-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                            <Code className="h-4 w-4" />
                            HTML Editor
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">Use {"{{variable_name}}"} for dynamic content</p>
                    </div>
                    <div className="flex-1 min-h-0">
                        <Textarea
                            value={htmlCode}
                            onChange={(e) => setHtmlCode(e.target.value)}
                            className="h-full w-full resize-none rounded-none border-0 bg-zinc-950 text-zinc-100 font-mono text-sm p-4 focus-visible:ring-0 focus-visible:ring-offset-0"
                            spellCheck={false}
                        />
                    </div>
                </div>

                {/* Right - Live Preview */}
                <div className="bg-zinc-100 flex flex-col min-h-0">
                    <div className="p-4 border-b border-zinc-200 shrink-0 bg-white">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <Eye className="h-4 w-4" />
                            Live Preview
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {deviceMode === "desktop" ? "Desktop view" : "Mobile view (375px)"}
                        </p>
                    </div>
                    <div className="flex-1 p-4 flex items-start justify-center overflow-auto">
                        <div
                            className={`bg-white shadow-2xl transition-all duration-300 ${deviceMode === "mobile" ? "w-[375px] rounded-[2rem] ring-8 ring-zinc-800" : "w-full h-full"
                                }`}
                            style={deviceMode === "mobile" ? { height: "667px" } : {}}
                        >
                            <iframe
                                srcDoc={previewHtml}
                                className={`w-full h-full ${deviceMode === "mobile" ? "rounded-[1.5rem]" : ""}`}
                                title="Live Preview"
                                sandbox="allow-scripts"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
