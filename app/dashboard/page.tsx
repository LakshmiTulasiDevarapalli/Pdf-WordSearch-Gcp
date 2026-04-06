"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, FileSearch } from "lucide-react"
import { FileUploadSection } from "@/next-js-pdf-app/components/file-upload-section"
import { CleanupStorageButton } from "@/components/cleanup-storage-button"
import { SettingsDropdown } from "@/components/settings-dropdown"
import { supabase } from "@/lib/supabase"
import { recordAuditEvent } from "@/lib/login-audit"

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationId: number
    const PARTICLE_COUNT = 80

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    class Particle {
      x: number; y: number; vx: number; vy: number
      radius: number; opacity: number; color: string
      constructor() {
        this.x = Math.random() * canvas!.width
        this.y = Math.random() * canvas!.height
        this.vx = (Math.random() - 0.5) * 0.3
        this.vy = (Math.random() - 0.5) * 0.3
        this.radius = Math.random() * 2 + 0.5
        this.opacity = Math.random() * 0.3 + 0.08
        const colors = ["#c9a84c", "#1a2e6e", "#6b21a8", "#b8860b", "#4c1d95", "#1e3a8a"]
        this.color = colors[Math.floor(Math.random() * colors.length)]
      }
      update() {
        this.x += this.vx; this.y += this.vy
        if (this.x < 0) this.x = canvas!.width
        if (this.x > canvas!.width) this.x = 0
        if (this.y < 0) this.y = canvas!.height
        if (this.y > canvas!.height) this.y = 0
      }
      draw() {
        ctx!.save()
        ctx!.globalAlpha = this.opacity
        ctx!.fillStyle = this.color
        ctx!.shadowBlur = 8
        ctx!.shadowColor = this.color
        ctx!.beginPath()
        ctx!.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx!.fill()
        ctx!.restore()
      }
    }

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => new Particle())

    let patternOffset = 0
    const drawOrnatePattern = () => {
      patternOffset += 0.0005
      const spacing = 60
      ctx.save()
      for (let x = 0; x < canvas.width + spacing; x += spacing) {
        for (let y = 0; y < canvas.height + spacing; y += spacing) {
          const wave = Math.sin(patternOffset + x * 0.01 + y * 0.01) * 0.5 + 0.5
          ctx.globalAlpha = 0.025 + wave * 0.025
          ctx.fillStyle = "#c9a84c"
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate(Math.PI / 4)
          ctx.fillRect(-3, -3, 6, 6)
          ctx.restore()
        }
      }
      ctx.restore()
    }

    let bloomOffset = 0
    const drawBlooms = () => {
      bloomOffset += 0.002
      const g1 = ctx.createRadialGradient(canvas.width * 0.08, canvas.height * 0.05, 0, canvas.width * 0.08, canvas.height * 0.05, canvas.width * 0.4)
      g1.addColorStop(0, `hsla(43, 74%, 60%, ${0.07 + Math.sin(bloomOffset) * 0.02})`)
      g1.addColorStop(1, "transparent")
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const g2 = ctx.createRadialGradient(canvas.width * 0.92, canvas.height * 0.08, 0, canvas.width * 0.92, canvas.height * 0.08, canvas.width * 0.35)
      g2.addColorStop(0, `hsla(270, 80%, 50%, ${0.06 + Math.cos(bloomOffset * 1.2) * 0.02})`)
      g2.addColorStop(1, "transparent")
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const g3 = ctx.createRadialGradient(canvas.width * 0.5, canvas.height, 0, canvas.width * 0.5, canvas.height, canvas.width * 0.45)
      g3.addColorStop(0, `hsla(225, 70%, 35%, ${0.05 + Math.sin(bloomOffset * 0.8) * 0.02})`)
      g3.addColorStop(1, "transparent")
      ctx.fillStyle = g3
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    const drawConnections = (parts: Particle[]) => {
      const maxDist = 110
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const dx = parts[i].x - parts[j].x
          const dy = parts[i].y - parts[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < maxDist) {
            ctx.save()
            ctx.globalAlpha = (1 - dist / maxDist) * 0.1
            ctx.strokeStyle = "#c9a84c"
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(parts[i].x, parts[i].y)
            ctx.lineTo(parts[j].x, parts[j].y)
            ctx.stroke()
            ctx.restore()
          }
        }
      }
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      drawOrnatePattern()
      drawBlooms()
      particles.forEach(p => p.update())
      drawConnections(particles)
      particles.forEach(p => p.draw())
      animationId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ zIndex: 0 }} />
}

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState("")
  const [userDepartment, setUserDepartment] = useState("")
  const [userRole, setUserRole] = useState("")

  // ✅ FIX: Read email from Supabase session instead of sessionStorage
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || "")

      // Fetch department and role from the users table to control feature visibility
      if (user?.email) {
        const { data: userData } = await supabase
          .from("users")
          .select("department, role")
          .eq("email", user.email)
          .single()
        setUserDepartment(userData?.department || "")
        setUserRole(userData?.role || "")
      }
    }
    getUser()
  }, [])

  // ✅ FIX: Sign out via Supabase instead of manually clearing sessionStorage
  const handleLogout = async () => {
  await recordAuditEvent("LOGOUT", userEmail)   // ← add this
    await supabase.auth.signOut()
    router.push("/")
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif", background: "#ffffff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');
        .royal-title { font-family: 'Playfair Display', serif; }
        .royal-gradient-text {
          background: linear-gradient(135deg, #1a2e6e 0%, #4c1d95 60%, #1a2e6e 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .header-bar {
          border-bottom: 1px solid rgba(201,168,76,0.2);
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(20px);
        }
        .btn-royal-sm {
          background: linear-gradient(135deg, #1a2e6e, #4c1d95);
          color: #fff;
          box-shadow: 0 2px 12px rgba(26,46,110,0.2);
          transition: all 0.2s;
        }
        .btn-royal-sm:hover { box-shadow: 0 4px 18px rgba(26,46,110,0.35); transform: translateY(-1px); }
        .btn-royal {
          background: linear-gradient(135deg, #1a2e6e, #4c1d95);
          color: #fff;
          box-shadow: 0 4px 20px rgba(26,46,110,0.3);
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
        }
        .btn-royal { cursor: pointer; }
        .btn-royal:hover { box-shadow: 0 8px 30px rgba(26,46,110,0.45); transform: translateY(-1px); }

        /* Override card styles for royal theme */
        .dashboard-royal [data-slot="card"] {
          background: rgba(255,255,255,0.92) !important;
          backdrop-filter: blur(24px) !important;
          border: 1px solid rgba(201,168,76,0.35) !important;
          box-shadow: 0 8px 50px rgba(26,46,110,0.1), 0 1px 0 rgba(201,168,76,0.5) inset !important;
          color: #1f2937 !important;
        }
        .dashboard-royal [data-slot="card-title"] {
          color: #111827 !important;
        }
        .dashboard-royal [data-slot="card-description"] {
          color: #6b7280 !important;
        }
        .dashboard-royal [data-slot="card-header"],
        .dashboard-royal [data-slot="card-content"] {
          color: #374151 !important;
        }
        .dashboard-royal label {
          color: #374151 !important;
        }
        .dashboard-royal input[type="file"] {
          color: #4b5563 !important;
        }
        .dashboard-royal .text-muted-foreground {
          color: #6b7280 !important;
        }
      `}</style>

      <ParticleCanvas />

      {/* Header */}
      <header className="header-bar relative z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: "linear-gradient(135deg, #1a2e6e, #4c1d95)", boxShadow: "0 4px 14px rgba(26,46,110,0.3)" }}>
                <FileSearch className="size-5 text-yellow-300" />
              </div>
              <div className="flex flex-col">
                <span className="royal-title text-lg font-black tracking-wide royal-gradient-text">PDF Search</span>
                <span className="text-[10px] tracking-widest uppercase hidden md:block" style={{ color: "#92400e", letterSpacing: "0.18em" }}>Document Analysis Tool</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="hidden text-xs md:inline" style={{ color: "#9ca3af" }}>{userEmail}</span>
            )}
            {userDepartment === "IT" && <CleanupStorageButton />}
            {/* Settings Dropdown — hidden for Viewer role */}
            {userRole !== "Viewer" && <SettingsDropdown />}
            <button
              type="button"
              onClick={handleLogout}
              className="btn-royal flex items-center gap-1.5 rounded-xl px-7 py-2.5 text-sm font-semibold"
              aria-label="Logout"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-royal relative z-10 mx-auto max-w-7xl px-6 py-8">
        <FileUploadSection />
      </main>
    </div>
  )
}
