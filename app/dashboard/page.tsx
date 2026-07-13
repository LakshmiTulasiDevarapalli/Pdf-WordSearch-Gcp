"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, FileSearch, Settings } from "lucide-react"
import { FileUploadSection } from "@/components/file-upload-section"
import { MedicationSection } from "@/components/medication-section"
import { OrderListingSection } from "@/components/order-listing-section"
import { BGMComplianceSection } from "@/components/bgm-compliance-section"
import { DiabetesCheckTrackSection } from "@/components/diabetes-check-track-section"
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

export default function DashboardPage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState("")
  const [userRole, setUserRole] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState<"progress" | "medication" | "order-listing" | "bgm-compliance" | "diabetes-check-track">("progress")

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/"); return }
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
    router.push("/")
  }

  if (!authChecked) return null

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
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');

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

        .tab-btn {
          display:inline-flex;align-items:center;gap:7px;
          padding:9px 22px;border-radius:10px;border:none;cursor:pointer;
          font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;
          transition:all .2s;
        }
        .tab-btn-active {
          background:linear-gradient(135deg,#1a2e6e,#4c1d95);
          color:#fff;
          box-shadow:0 4px 16px rgba(26,46,110,0.25);
        }
        .tab-btn-inactive {
          background:rgba(255,255,255,0.7);
          color:#6b7280;
          border:1px solid rgba(201,168,76,0.2) !important;
        }
        .tab-btn-inactive:hover {
          background:rgba(255,255,255,0.95);
          color:#1a2e6e;
          border-color:rgba(26,46,110,0.2) !important;
        }
      `}</style>

      <ParticleCanvas/>

      {/* ── Header ── */}
      <header className="dash-header" style={{ position:"relative", zIndex:50, height:"64px", flexShrink:0, display:"flex", alignItems:"center", borderBottom:"1px solid rgba(201,168,76,0.15)", background:"rgba(255,255,255,0.88)", backdropFilter:"blur(20px)" }}>
        <div style={{ maxWidth:"1280px", margin:"0 auto", padding:"0 24px", width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>

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

      {/* ── Main Content ── */}
      <main className="dash-content" style={{ flex:1, overflow:"auto", position:"relative", zIndex:10 }}>
        <div style={{ maxWidth:"1280px", margin:"0 auto", padding:"24px 24px 32px" }}>

          {/* Page title */}
          <div style={{ marginBottom:"20px" }}>
            <h1 style={{ fontFamily:"'Instrument Serif',Georgia,serif", fontSize:"clamp(22px,2.5vw,30px)", lineHeight:1.15, marginBottom:"4px" }}>
              <span style={{ background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Document </span>
              <span className="shimmer-text">Search</span>
            </h1>
            <p style={{ fontSize:"13px", color:"#9ca3af" }}>Upload a PDF, search compliance keywords, and export your findings as a Word document.</p>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"20px", padding:"5px", borderRadius:"14px", background:"rgba(255,255,255,0.7)", border:"1px solid rgba(201,168,76,0.18)", width:"fit-content" }}>
            <button
              type="button"
              className={`tab-btn ${activeTab === "progress" ? "tab-btn-active" : "tab-btn-inactive"}`}
              onClick={() => setActiveTab("progress")}
            >
              📋 Progress Notes
            </button>
            {userRole?.toLowerCase() === "admin" && (
              <button
                type="button"
                className={`tab-btn ${activeTab === "medication" ? "tab-btn-active" : "tab-btn-inactive"}`}
                onClick={() => setActiveTab("medication")}
              >
                💊 Medication Availability
              </button>
            )}
            {userRole?.toLowerCase() === "admin" && (
              <button
                type="button"
                className={`tab-btn ${activeTab === "order-listing" ? "tab-btn-active" : "tab-btn-inactive"}`}
                onClick={() => setActiveTab("order-listing")}
              >
                📝 Order Listing
              </button>
            )}
            {userRole?.toLowerCase() === "admin" && (
              <button
                type="button"
                className={`tab-btn ${activeTab === "bgm-compliance" ? "tab-btn-active" : "tab-btn-inactive"}`}
                onClick={() => setActiveTab("bgm-compliance")}
              >
                🩸 BGM Compliance Review
              </button>
            )}
            {userRole?.toLowerCase() === "admin" && (
              <button
                type="button"
                className={`tab-btn ${activeTab === "diabetes-check-track" ? "tab-btn-active" : "tab-btn-inactive"}`}
                onClick={() => setActiveTab("diabetes-check-track")}
              >
                🧪 Diabetes Check and Track
              </button>
            )}
          </div>

          {/* Gold divider */}
          <div style={{ height:"1px", background:"linear-gradient(90deg,rgba(26,46,110,0.15),rgba(201,168,76,0.4),transparent)", marginBottom:"20px" }}/>

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
        </div>
      </main>

      {/* ── Footer strip ── */}
      <footer style={{ position:"relative", zIndex:10, flexShrink:0, height:"36px", display:"flex", alignItems:"center", borderTop:"1px solid rgba(201,168,76,0.12)", background:"rgba(255,255,255,0.88)", backdropFilter:"blur(12px)" }}>
        <div style={{ maxWidth:"1280px", margin:"0 auto", padding:"0 24px", width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:"11px", color:"#b0b0b0" }}>© 2026 AICS. All rights reserved.</span>
          <span style={{ fontSize:"11px", color:"#b0b0b0" }}>🔒 Zero data retention · ⚡ In-memory processing</span>
        </div>
      </footer>
    </div>
  )
}