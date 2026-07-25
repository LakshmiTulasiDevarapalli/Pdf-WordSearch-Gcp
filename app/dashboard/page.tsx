"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  LogOut, FileSearch, FileText, Pill, ClipboardList,
  Droplet, Activity, Syringe, Menu, X, HeartPulse,
} from "lucide-react"
import { FileUploadSection } from "@/components/file-upload-section"
import { MedicationSection } from "@/components/medication-section"
import { OrderListingSection } from "@/components/order-listing-section"
import { BGMComplianceSection } from "@/components/bgm-compliance-section"
import { DiabetesCheckTrackSection } from "@/components/diabetes-check-track-section"
import { AntibioticsCheckSection } from "@/components/antibiotics-check-section"
import { VitalExceptionReportSection } from "@/components/vital-exception-report-section"
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
    let id: number
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener("resize", resize)
    class P {
      x=Math.random()*canvas!.width; y=Math.random()*canvas!.height
      vx=(Math.random()-.5)*.18; vy=(Math.random()-.5)*.18
      r=Math.random()*1.4+.3; o=Math.random()*.14+.03
      c=["#c9a84c","#1a2e6e","#6b21a8","#4c1d95"][Math.floor(Math.random()*4)]
      update(){this.x+=this.vx;this.y+=this.vy;if(this.x<0)this.x=canvas!.width;if(this.x>canvas!.width)this.x=0;if(this.y<0)this.y=canvas!.height;if(this.y>canvas!.height)this.y=0}
      draw(){ctx!.save();ctx!.globalAlpha=this.o;ctx!.fillStyle=this.c;ctx!.beginPath();ctx!.arc(this.x,this.y,this.r,0,Math.PI*2);ctx!.fill();ctx!.restore()}
    }
    const pts=Array.from({length:45},()=>new P())
    const render=()=>{
      ctx.clearRect(0,0,canvas.width,canvas.height)
      const bg=ctx.createLinearGradient(0,0,canvas.width,canvas.height)
      bg.addColorStop(0,"#f5f3ff"); bg.addColorStop(.5,"#fefcf3"); bg.addColorStop(1,"#f0f4ff")
      ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height)
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy)
        if(d<85){ctx.save();ctx.globalAlpha=(1-d/85)*.04;ctx.strokeStyle="#c9a84c";ctx.lineWidth=.4;ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();ctx.restore()}
      }
      pts.forEach(p=>{p.update();p.draw()})
      id=requestAnimationFrame(render)
    }
    render()
    return()=>{cancelAnimationFrame(id);window.removeEventListener("resize",resize)}
  },[])
  return <canvas ref={canvasRef} style={{position:"fixed",inset:0,width:"100%",height:"100%",zIndex:0}}/>
}

type TabKey = "progress" | "medication" | "order-listing" | "bgm-compliance" | "diabetes-check-track" | "antibiotics-check" | "vital-exception-report"

const TAB_META: Record<TabKey, { label: string; icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }>; description: string; adminOnly: boolean }> = {
  "progress": {
    label: "Progress Notes",
    icon: FileText,
    description: "Upload a PDF, search compliance keywords, and export your findings as a Word document.",
    adminOnly: false,
  },
  "medication": {
    label: "Medication Availability",
    icon: Pill,
    description: "Check current stock levels and flag medications that are due for reorder.",
    adminOnly: true,
  },
  "order-listing": {
    label: "Order Listing",
    icon: ClipboardList,
    description: "Review outstanding supply orders and their fulfilment status.",
    adminOnly: true,
  },
  "bgm-compliance": {
    label: "BGM Compliance Review",
    icon: Droplet,
    description: "Audit blood glucose monitoring logs against your facility's compliance schedule.",
    adminOnly: true,
  },
  "diabetes-check-track": {
    label: "Diabetes Check and Track",
    icon: Activity,
    description: "Track diabetes screening checkpoints and follow-up status across residents.",
    adminOnly: true,
  },
  "antibiotics-check": {
    label: "Antibiotics Stewardship",
    icon: Syringe,
    description: "Review active antibiotic courses against stewardship policy.",
    adminOnly: true,
  },
  "vital-exception-report": {
    label: "Vital Exception Report",
    icon: HeartPulse,
    description: "Review vital sign readings that fall outside expected thresholds.",
    adminOnly: false,
  },
}

const TAB_ORDER: TabKey[] = ["progress", "medication", "order-listing", "bgm-compliance", "diabetes-check-track", "antibiotics-check", "vital-exception-report"]

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState("")
  const [userRole, setUserRole] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>("progress")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sweepKey, setSweepKey] = useState(0)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }
      setUserEmail(user.email || "")
      const { data: userData } = await supabase
        .from("users").select("department, role").eq("email", user.email).single()
      setUserRole(userData?.role ?? "")
      setAuthChecked(true)
    }
    getUser()
  }, [])

  const handleLogout = async () => {
    await recordAuditEvent("LOGOUT", userEmail)
    await supabase.auth.signOut()
    router.push("/login")
  }

  if (!authChecked) return null

  const isAdmin = userRole?.toLowerCase() === "admin"
  const visibleTabs = TAB_ORDER.filter(key => !TAB_META[key].adminOnly || isAdmin)
  const active = TAB_META[activeTab]
  const ActiveIcon = active.icon

  // Initials avatar
  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "??"
  const roleBadgeColor: Record<string, string> = {
    admin:   "rgba(26,46,110,0.1)",
    viewer:  "rgba(201,168,76,0.15)",
    default: "rgba(76,29,149,0.1)",
  }
  const roleColor = roleBadgeColor[(userRole||"").toLowerCase()] || roleBadgeColor.default

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", height:"100vh", display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');

        @keyframes fadeDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }

        .dash-header { animation: fadeDown .5s ease both; }

        .shimmer-text {
          background:linear-gradient(90deg,#b8860b,#f5d06e,#c9a84c,#f5d06e,#b8860b);
          background-size:200% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          animation:shimmer 4s linear infinite;
        }

        .logout-btn {
          display:inline-flex;align-items:center;gap:6px;
          background:linear-gradient(135deg,#1a2e6e,#4c1d95);
          color:#fff;border:none;cursor:pointer;
          border-radius:12px;padding:9px 18px;
          font-size:13px;font-weight:600;font-family:inherit;
          box-shadow:0 4px 16px rgba(26,46,110,0.28);
          transition:all .2s;
        }
        .logout-btn:hover { box-shadow:0 6px 24px rgba(26,46,110,0.42); transform:translateY(-1px); }

        .icon-btn {
          display:inline-flex;align-items:center;justify-content:center;
          width:36px;height:36px;border-radius:10px;border:1px solid rgba(201,168,76,0.25);
          background:rgba(255,255,255,0.8);color:#1a2e6e;cursor:pointer;
          transition:all .18s;
        }
        .icon-btn:hover { background:#fff;border-color:rgba(26,46,110,0.3); }

        .avatar {
          width:34px;height:34px;border-radius:10px;
          background:linear-gradient(135deg,#1a2e6e,#4c1d95);
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:700;color:#fbbf24;
          flex-shrink:0;
        }

        /* Card overrides to match theme */
        .dash-content [data-slot="card"] {
          background:rgba(255,255,255,0.92) !important;
          backdrop-filter:blur(24px) !important;
          border:1px solid rgba(201,168,76,0.3) !important;
          box-shadow:0 4px 32px rgba(26,46,110,0.08), 0 1px 0 rgba(201,168,76,0.4) inset !important;
          color:#1f2937 !important;
          border-radius:16px !important;
        }
        .dash-content [data-slot="card-title"]       { color:#111827 !important; font-family:'Instrument Serif',Georgia,serif !important; font-size:18px !important; }
        .dash-content [data-slot="card-description"] { color:#6b7280 !important; font-size:13px !important; }
        .dash-content [data-slot="card-header"],
        .dash-content [data-slot="card-content"]     { color:#374151 !important; }
        .dash-content label                          { color:#374151 !important; font-size:12px !important; font-weight:700 !important; letter-spacing:.03em !important; }
        .dash-content input[type="file"]             { color:#4b5563 !important; }
        .dash-content .text-muted-foreground         { color:#6b7280 !important; }

        /* Search button inside file-upload-section */
        .dash-content button[style*="1a2e6e"] {
          border-radius:12px !important;
        }

        /* ── Shell: sidebar + main ── */
        .dash-shell { flex:1; display:grid; grid-template-columns:240px 1fr; overflow:hidden; position:relative; z-index:10; }

        .sidebar {
          border-right:1px solid rgba(201,168,76,0.16);
          background:rgba(255,255,255,0.62);
          backdrop-filter:blur(18px);
          padding:20px 14px;
          overflow-y:auto;
        }
        .sidebar-eyebrow {
          font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;
          color:#9ca3af;padding:0 6px 10px;
        }
        .sidebar-nav { display:flex; flex-direction:column; gap:3px; }
        .sidebar-nav-btn {
          position:relative;
          display:flex;align-items:center;gap:10px;
          width:100%;padding:10px 12px 10px 18px;
          border-radius:10px;border:none;background:transparent;cursor:pointer;
          font-family:inherit;font-size:13px;font-weight:600;color:#6b7280;
          text-align:left;transition:all .18s;
        }
        .sidebar-nav-btn:hover { background:rgba(26,46,110,0.05); color:#1a2e6e; }
        .sidebar-nav-btn.active {
          background:linear-gradient(135deg, rgba(26,46,110,0.09), rgba(76,29,149,0.06));
          color:#1a2e6e;
        }
        .sidebar-nav-btn.active::before {
          content:"";position:absolute;left:4px;top:7px;bottom:7px;width:3px;border-radius:2px;
          background:linear-gradient(180deg,#1a2e6e,#c9a84c,#4c1d95);
        }
        .sidebar-nav-btn .nav-icon { flex-shrink:0; width:16px; height:16px; }
        .sidebar-nav-btn .nav-label { flex:1; }
        .sidebar-nav-btn .nav-index {
          font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:500;
          color:#c4c4c4; letter-spacing:0.02em;
        }
        .sidebar-nav-btn.active .nav-index { color:#c9a84c; }

        .module-meta {
          font-family:'IBM Plex Mono',monospace; font-size:10.5px; font-weight:500;
          letter-spacing:0.08em; color:#9ca3af; text-transform:uppercase; margin-bottom:8px;
        }

        .sweep {
          position:absolute; top:0; left:-30%; width:30%; height:100%;
          background:linear-gradient(90deg, transparent, rgba(201,168,76,0.14), transparent);
          pointer-events:none; animation: sweepMove .9s ease-out;
        }
        @keyframes sweepMove { from { left:-30%; } to { left:100%; } }

        .dash-content { overflow:auto; position:relative; }
        .dash-content-inner { position:relative; overflow:hidden; }

        /* Themed scrollbars for the scrolling panels */
        .dash-content, .sidebar {
          scrollbar-width: thin;
          scrollbar-color: rgba(76,29,149,0.35) transparent;
        }
        .dash-content::-webkit-scrollbar, .sidebar::-webkit-scrollbar {
          width: 9px;
        }
        .dash-content::-webkit-scrollbar-track, .sidebar::-webkit-scrollbar-track {
          background: transparent;
        }
        .dash-content::-webkit-scrollbar-thumb, .sidebar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(26,46,110,0.28), rgba(201,168,76,0.4), rgba(76,29,149,0.28));
          border-radius: 8px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .dash-content::-webkit-scrollbar-thumb:hover, .sidebar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(26,46,110,0.45), rgba(201,168,76,0.6), rgba(76,29,149,0.45));
          background-clip: padding-box;
        }

        .module-header-icon {
          width:44px;height:44px;border-radius:13px;flex-shrink:0;
          background:linear-gradient(135deg,#1a2e6e,#4c1d95);
          box-shadow:0 6px 20px rgba(26,46,110,0.28);
          display:flex;align-items:center;justify-content:center;
        }

        /* Mobile: sidebar collapses to a slide-over panel */
        .sidebar-toggle { display:none; }
        .sidebar-scrim { display:none; }
        @media (max-width: 860px) {
          .dash-shell { grid-template-columns: 1fr; }
          .sidebar {
            position:fixed; top:64px; left:0; bottom:0; width:250px; z-index:60;
            transform:translateX(-100%); transition:transform .22s ease;
            box-shadow:0 12px 40px rgba(0,0,0,0.18);
          }
          .sidebar.open { transform:translateX(0); }
          .sidebar-toggle { display:inline-flex; }
          .sidebar-scrim.open {
            display:block; position:fixed; inset:64px 0 0 0; background:rgba(15,20,40,0.35); z-index:55;
          }
        }
      `}</style>

      <ParticleCanvas/>

      {/* ── Header ── */}
      <header className="dash-header" style={{ position:"relative", zIndex:50, height:"64px", flexShrink:0, display:"flex", alignItems:"center", borderBottom:"1px solid rgba(201,168,76,0.15)", background:"rgba(255,255,255,0.88)", backdropFilter:"blur(20px)" }}>
        <div style={{ maxWidth:"1440px", margin:"0 auto", padding:"0 24px", width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"12px" }}>

          <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
            {/* Mobile nav toggle */}
            <button
              type="button"
              className="icon-btn sidebar-toggle"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle navigation"
            >
              {sidebarOpen ? <X style={{width:"16px",height:"16px"}}/> : <Menu style={{width:"16px",height:"16px"}}/>}
            </button>

            {/* Logo */}
            <Link href="/" style={{ display:"flex", alignItems:"center", gap:"10px", textDecoration:"none" }}>
              <div style={{ padding:"8px", borderRadius:"12px", background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow:"0 3px 12px rgba(26,46,110,0.28)" }}>
                <FileSearch style={{ width:"17px", height:"17px", color:"#fbbf24" }}/>
              </div>
              <div>
                <div style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontSize:"19px", background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1.1 }}>AICS</div>
                <div style={{ fontSize:"8.5px", fontWeight:700, letterSpacing:"0.2em", color:"#92400e", textTransform:"uppercase" }}>PDF Search Engine</div>
              </div>
            </Link>
          </div>

          {/* Right side */}
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            {/* User info */}
            {userEmail && (
              <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"6px 12px 6px 6px", borderRadius:"12px", background:"rgba(255,255,255,0.8)", border:"1px solid rgba(201,168,76,0.2)" }}>
                <div className="avatar">{initials}</div>
                <div>
                  <div style={{ fontSize:"12px", fontWeight:600, color:"#1f2937", maxWidth:"180px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{userEmail}</div>
                  {userRole && (
                    <div style={{ display:"inline-flex", alignItems:"center", marginTop:"2px" }}>
                      <span style={{ fontSize:"10px", fontWeight:700, color:"#1a2e6e", background:roleColor, borderRadius:"5px", padding:"1px 7px", textTransform:"capitalize" }}>{userRole}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settings */}
            {userRole !== null && userRole.toLowerCase() !== "viewer" && <SettingsDropdown/>}

            {/* Logout */}
            <button type="button" onClick={handleLogout} className="logout-btn">
              <LogOut style={{ width:"14px", height:"14px" }}/>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Shell: sidebar + content ── */}
      <div className="dash-shell">

        {/* Mobile scrim */}
        <div className={`sidebar-scrim ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* Sidebar */}
        <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-eyebrow">Compliance Modules</div>
          <div className="sidebar-nav">
            {visibleTabs.map((key, i) => {
              const meta = TAB_META[key]
              const Icon = meta.icon
              return (
                <button
                  key={key}
                  type="button"
                  className={`sidebar-nav-btn ${activeTab === key ? "active" : ""}`}
                  onClick={() => { setActiveTab(key); setSidebarOpen(false); setSweepKey(k => k + 1) }}
                >
                  <Icon className="nav-icon" style={{ width:"16px", height:"16px" }}/>
                  <span className="nav-label">{meta.label}</span>
                  <span className="nav-index">{String(i + 1).padStart(2, "0")}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Main Content */}
        <main className="dash-content">
          <div className="dash-content-inner" style={{ maxWidth:"1120px", margin:"0 auto", padding:"24px 24px 32px" }}>
            <div className="sweep" key={sweepKey}/>

            <div className="module-meta">
              Module {String(visibleTabs.indexOf(activeTab) + 1).padStart(2, "0")} · {active.label}
            </div>

            {/* Module header */}
            <div style={{ display:"flex", alignItems:"flex-start", gap:"14px", marginBottom:"22px" }}>
              <div className="module-header-icon">
                <ActiveIcon style={{ width:"20px", height:"20px", color:"#fbbf24" }}/>
              </div>
              <div>
                <h1 style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontSize:"clamp(20px,2.4vw,27px)", lineHeight:1.15, marginBottom:"4px" }}>
                  <span className="shimmer-text">{active.label}</span>
                </h1>
                <p style={{ fontSize:"13px", color:"#9ca3af", maxWidth:"560px" }}>{active.description}</p>
              </div>
            </div>

            {/* Gold divider */}
            <div style={{ height:"1px", background:"linear-gradient(90deg,rgba(26,46,110,0.15),rgba(201,168,76,0.4),transparent)", marginBottom:"22px" }}/>

            {/* Tab Content */}
            {activeTab === "progress" && (
              <FileUploadSection userRole={userRole}/>
            )}

            {activeTab === "medication" && (
              <MedicationSection />
            )}

            {activeTab === "order-listing" && (
              <OrderListingSection userRole={userRole} />
            )}

            {activeTab === "bgm-compliance" && (
              <BGMComplianceSection userRole={userRole} />
            )}

            {activeTab === "diabetes-check-track" && (
              <DiabetesCheckTrackSection userRole={userRole} />
            )}

            {activeTab === "antibiotics-check" && (
              <AntibioticsCheckSection userRole={userRole} />
            )}

            {activeTab === "vital-exception-report" && (
              <VitalExceptionReportSection userRole={userRole} />
            )}
          </div>
        </main>
      </div>

      {/* ── Footer strip ── */}
      <footer style={{ position:"relative", zIndex:10, flexShrink:0, height:"36px", display:"flex", alignItems:"center", borderTop:"1px solid rgba(201,168,76,0.12)", background:"rgba(255,255,255,0.88)", backdropFilter:"blur(12px)" }}>
        <div style={{ maxWidth:"1440px", margin:"0 auto", padding:"0 24px", width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:"11px", color:"#b0b0b0" }}>© 2026 AICS. All rights reserved.</span>
          <span style={{ fontSize:"11px", color:"#b0b0b0" }}>🔒 Zero data retention · ⚡ In-memory processing</span>
        </div>
      </footer>
    </div>
  )
}