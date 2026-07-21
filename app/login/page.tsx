"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FileSearch, Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { recordAuditEvent } from "@/lib/login-audit"

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current!
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let id: number
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize(); window.addEventListener("resize", resize)
    class P {
      x=Math.random()*canvas!.width; y=Math.random()*canvas!.height
      vx=(Math.random()-.5)*.18; vy=(Math.random()-.5)*.18
      r=Math.random()*1.4+.3; o=Math.random()*.15+.03
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

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError("Invalid email or password. Please try again."); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await recordAuditEvent("LOGIN", email)
      // Write the first activity heartbeat so the server-side idle-timeout
      // check (isSessionFresh) has a row to read immediately after login,
      // instead of a brief window with none.
      await supabase.from("user_sessions").upsert({
        user_id: session.user.id,
        last_activity_at: new Date().toISOString(),
      })
    }
    router.push("/dashboard")
  }

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@400;500;600;700&display=swap');

        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.3)} 50%{box-shadow:0 0 0 6px rgba(201,168,76,0)} }

        .d1{animation:fadeUp .55s ease .0s both}
        .d2{animation:fadeUp .55s ease .08s both}
        .d3{animation:fadeUp .55s ease .16s both}
        .d4{animation:fadeUp .55s ease .24s both}
        .d5{animation:fadeUp .55s ease .32s both}
        .d6{animation:fadeUp .55s ease .40s both}

        .shimmer-text {
          background:linear-gradient(90deg,#b8860b,#f5d06e,#c9a84c,#f5d06e,#b8860b);
          background-size:200% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          animation:shimmer 4s linear infinite;
        }

        .login-input {
          width:100%;padding:13px 16px 13px 48px;border-radius:14px;
          border:1.5px solid rgba(201,168,76,0.22);
          background:rgba(255,255,255,0.85);
          font-size:14px;font-family:inherit;color:#1f2937;
          outline:none;transition:all .2s;box-sizing:border-box;
          backdrop-filter:blur(8px);
        }
        .login-input:focus {
          border-color:rgba(26,46,110,0.5);
          background:#fff;
          box-shadow:0 0 0 4px rgba(26,46,110,0.07);
        }
        .login-input::placeholder { color:#b0b0b0; }
        .login-input-pr { padding-right:48px; }

        .field-icon {
          position:absolute;left:15px;top:50%;transform:translateY(-50%);
          width:17px;height:17px;pointer-events:none;transition:color .2s;
          color:#c4c4c4;
        }
        .login-input:focus ~ .field-icon-label .field-icon { color:#1a2e6e; }

        .eye-toggle {
          position:absolute;right:14px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;color:#b0b0b0;
          display:flex;align-items:center;padding:0;transition:color .2s;
        }
        .eye-toggle:hover { color:#1a2e6e; }

        .btn-signin {
          width:100%;padding:15px;border-radius:14px;border:none;cursor:pointer;
          background:linear-gradient(135deg,#1a2e6e 0%,#3730a3 50%,#4c1d95 100%);
          color:#fff;font-size:15px;font-weight:700;font-family:inherit;
          display:flex;align-items:center;justify-content:center;gap:8px;
          box-shadow:0 8px 28px rgba(26,46,110,0.32);
          transition:all .22s;
        }
        .btn-signin:hover:not(:disabled) {
          box-shadow:0 12px 40px rgba(26,46,110,0.48);
          transform:translateY(-2px);
        }
        .btn-signin:active:not(:disabled) { transform:translateY(0); }
        .btn-signin:disabled { opacity:.65;cursor:not-allowed;transform:none; }

        .spin { animation:spin .75s linear infinite; }

        .back-btn {
          display:inline-flex;align-items:center;gap:5px;text-decoration:none;
          font-size:13px;font-weight:600;color:#6b7280;
          border:1.5px solid rgba(0,0,0,0.1);border-radius:10px;
          padding:7px 16px;transition:all .18s;background:rgba(255,255,255,0.7);
        }
        .back-btn:hover { color:#1a2e6e;border-color:rgba(26,46,110,0.25);background:#fff; }
      `}</style>

      <ParticleCanvas/>

      {/* Header */}
      <header style={{ position:"relative",zIndex:10,height:"64px",display:"flex",alignItems:"center", borderBottom:"1px solid rgba(201,168,76,0.12)",background:"rgba(255,255,255,0.82)",backdropFilter:"blur(20px)" }}>
        <div style={{ maxWidth:"1200px",margin:"0 auto",padding:"0 24px",width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <Link href="/" style={{ display:"flex",alignItems:"center",gap:"10px",textDecoration:"none" }}>
            <div style={{ padding:"8px",borderRadius:"11px",background:"linear-gradient(135deg,#1a2e6e,#4c1d95)",boxShadow:"0 3px 10px rgba(26,46,110,0.25)" }}>
              <FileSearch style={{ width:"16px",height:"16px",color:"#fbbf24" }}/>
            </div>
            <div>
              <div style={{ fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"18px",background:"linear-gradient(135deg,#1a2e6e,#4c1d95)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",lineHeight:1.1 }}>AICS</div>
              <div style={{ fontSize:"8.5px",fontWeight:700,letterSpacing:"0.2em",color:"#92400e",textTransform:"uppercase" }}>PDF Search Engine</div>
            </div>
          </Link>
          <Link href="/" className="back-btn">← Back</Link>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex:1,position:"relative",zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",padding:"32px 16px" }}>
        <div style={{ width:"100%",maxWidth:"420px" }}>

          {/* Logo mark */}
          <div className="d1" style={{ display:"flex",flexDirection:"column",alignItems:"center",marginBottom:"28px" }}>
            <div style={{ width:"56px",height:"56px",borderRadius:"18px",background:"linear-gradient(135deg,#1a2e6e,#4c1d95)",boxShadow:"0 8px 28px rgba(26,46,110,0.3)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"14px",animation:"glow 3s ease-in-out infinite" }}>
              <FileSearch style={{ width:"26px",height:"26px",color:"#fbbf24" }}/>
            </div>
            <h1 style={{ fontFamily:"'Instrument Serif',Georgia,serif",fontSize:"28px",textAlign:"center",lineHeight:1.15,marginBottom:"6px" }}>
              <span style={{ background:"linear-gradient(135deg,#1a2e6e,#4c1d95)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>Welcome back to </span>
              <span className="shimmer-text">AICS</span>
            </h1>
            <p style={{ fontSize:"13px",color:"#9ca3af",textAlign:"center" }}>Sign in to access your compliance workspace</p>
          </div>

          {/* Card */}
          <div className="d2" style={{ borderRadius:"24px",overflow:"hidden",background:"rgba(255,255,255,0.92)",border:"1px solid rgba(201,168,76,0.25)",boxShadow:"0 20px 72px rgba(26,46,110,0.1),0 1px 0 rgba(201,168,76,0.35) inset",backdropFilter:"blur(24px)" }}>

            {/* Accent bar */}
            <div style={{ height:"3px",background:"linear-gradient(90deg,#1a2e6e,#c9a84c,#f5d06e,#c9a84c,#4c1d95)" }}/>

            <div style={{ padding:"32px 32px 36px" }}>
              <form onSubmit={handleSignIn} style={{ display:"flex",flexDirection:"column",gap:"20px" }}>

                {/* Email */}
                <div className="d3">
                  <label style={{ display:"block",fontSize:"12px",fontWeight:700,color:"#374151",marginBottom:"8px",letterSpacing:"0.03em" }}>
                    Email Address
                  </label>
                  <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
                    <Mail style={{ position:"absolute",left:"15px",zIndex:2,width:"17px",height:"17px",color: email ? "#1a2e6e" : "#c4c4c4",transition:"color .2s",pointerEvents:"none",flexShrink:0 }}/>
                    <input
                      type="email" required value={email}
                      onChange={e=>setEmail(e.target.value)}
                      placeholder="you@yourcompany.com"
                      className="login-input"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="d4">
                  <label style={{ display:"block",fontSize:"12px",fontWeight:700,color:"#374151",marginBottom:"8px",letterSpacing:"0.03em" }}>
                    Password
                  </label>
                  <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
                    <Lock style={{ position:"absolute",left:"15px",zIndex:2,width:"17px",height:"17px",color: password ? "#1a2e6e" : "#c4c4c4",transition:"color .2s",pointerEvents:"none",flexShrink:0 }}/>
                    <input
                      type={showPassword ? "text" : "password"} required value={password}
                      onChange={e=>setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="login-input login-input-pr"
                    />
                    <button type="button" className="eye-toggle" onClick={()=>setShowPassword(p=>!p)} aria-label={showPassword?"Hide":"Show"}>
                      {showPassword ? <EyeOff style={{width:"17px",height:"17px"}}/> : <Eye style={{width:"17px",height:"17px"}}/>}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{ borderRadius:"12px",padding:"12px 16px",fontSize:"13px",background:"#fef2f2",color:"#b91c1c",border:"1px solid #fecaca",display:"flex",alignItems:"center",gap:"8px",lineHeight:1.5 }}>
                    <span>⚠</span>{error}
                  </div>
                )}

                {/* Gold divider */}
                <div className="d5" style={{ height:"1px",background:"linear-gradient(90deg,transparent,rgba(201,168,76,0.35),transparent)" }}/>

                {/* Submit */}
                <button type="submit" disabled={loading} className="btn-signin d6">
                  {loading ? (
                    <>
                      <svg className="spin" style={{width:"17px",height:"17px",flexShrink:0}} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.25)" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    <>Sign In <ArrowRight style={{width:"17px",height:"17px"}}/></>
                  )}
                </button>

              </form>
            </div>
          </div>

          {/* Below card trust line */}
          <div className="d6" style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",marginTop:"20px" }}>
            {["🔒 TLS 1.3 encrypted","🚫 Zero data stored","⚡ In-memory only"].map(t=>(
              <span key={t} style={{ fontSize:"11px",color:"#b0b0b0",fontWeight:500 }}>{t}</span>
            ))}
          </div>

        </div>
      </main>
    </div>
  )
}