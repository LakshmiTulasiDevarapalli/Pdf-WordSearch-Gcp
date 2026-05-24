"use client"

import Link from "next/link"
import { FileSearch, Search, Shield, Clock, X, Mail, Phone, Zap, FileText, Download, ChevronRight, ArrowRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let animationId: number
    const PARTICLE_COUNT = 60
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener("resize", resize)
    class Particle {
      x: number; y: number; vx: number; vy: number; radius: number; opacity: number; color: string
      constructor() {
        this.x = Math.random() * canvas!.width; this.y = Math.random() * canvas!.height
        this.vx = (Math.random() - 0.5) * 0.25; this.vy = (Math.random() - 0.5) * 0.25
        this.radius = Math.random() * 1.5 + 0.5; this.opacity = Math.random() * 0.25 + 0.05
        this.color = ["#c9a84c","#1a2e6e","#6b21a8","#b8860b","#4c1d95"][Math.floor(Math.random()*5)]
      }
      update() {
        this.x += this.vx; this.y += this.vy
        if (this.x < 0) this.x = canvas!.width; if (this.x > canvas!.width) this.x = 0
        if (this.y < 0) this.y = canvas!.height; if (this.y > canvas!.height) this.y = 0
      }
      draw() {
        ctx!.save(); ctx!.globalAlpha = this.opacity; ctx!.fillStyle = this.color
        ctx!.shadowBlur = 6; ctx!.shadowColor = this.color
        ctx!.beginPath(); ctx!.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx!.fill(); ctx!.restore()
      }
    }
    const particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle())
    const render = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height)
      // subtle gradient background
      const bg = ctx.createLinearGradient(0,0,canvas.width,canvas.height)
      bg.addColorStop(0,"#f8f6ff"); bg.addColorStop(0.5,"#fefcf3"); bg.addColorStop(1,"#f0f4ff")
      ctx.fillStyle = bg; ctx.fillRect(0,0,canvas.width,canvas.height)
      // connections
      for (let i=0;i<particles.length;i++) for (let j=i+1;j<particles.length;j++) {
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y
        const dist=Math.sqrt(dx*dx+dy*dy)
        if (dist<100) { ctx.save(); ctx.globalAlpha=(1-dist/100)*0.06; ctx.strokeStyle="#c9a84c"; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y); ctx.stroke(); ctx.restore() }
      }
      particles.forEach(p=>{p.update();p.draw()})
      animationId = requestAnimationFrame(render)
    }
    render()
    return () => { cancelAnimationFrame(animationId); window.removeEventListener("resize",resize) }
  }, [])
  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" style={{ zIndex: -1 }} />
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = "" }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,14,40,0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: "#fff", boxShadow: "0 40px 100px rgba(26,46,110,0.25), 0 0 0 1px rgba(201,168,76,0.2)" }}>
        <div className="h-1 w-full flex-shrink-0" style={{ background: "linear-gradient(90deg, #1a2e6e, #c9a84c, #f5d06e, #c9a84c, #4c1d95)" }} />
        <div className="flex items-center justify-between px-8 py-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(201,168,76,0.15)" }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: "linear-gradient(135deg, #1a2e6e, #4c1d95)" }}>
              <FileSearch className="size-4 text-yellow-300" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: "#92400e", fontSize:"9px", letterSpacing:"0.2em" }}>AICS PDF Search</p>
              <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:"20px", fontWeight:900, background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-all hover:scale-110" style={{ background:"rgba(26,46,110,0.07)", color:"#1a2e6e" }}>
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-8 py-6 flex-1" style={{ color:"#374151" }}>{children}</div>
      </div>
    </div>
  )
}

function PrivacyContent() {
  const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-7">
      <h3 style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:"15px", color:"#1a2e6e", marginBottom:"8px" }}>{title}</h3>
      <div className="text-sm leading-relaxed space-y-2" style={{ color:"#4b5563" }}>{children}</div>
    </div>
  )
  return (
    <div>
      <p className="text-sm mb-5 leading-relaxed" style={{ color:"#6b7280" }}><strong style={{ color:"#1a2e6e" }}>Effective: Jan 1, 2026 · Updated: Mar 1, 2026</strong><br/>Your privacy is the foundation of everything we build.</p>
      <div className="mb-5 h-px" style={{ background:"linear-gradient(90deg,transparent,#c9a84c,transparent)" }} />
      <S title="1. Information We Collect"><p><strong>Account data:</strong> Name, email, and encrypted password on registration.</p><p><strong>Documents:</strong> PDFs are processed in-memory. We do not store document contents beyond the active session.</p><p><strong>Usage data:</strong> Anonymised analytics only — cannot be linked to individuals.</p></S>
      <S title="2. How We Use Your Information"><p>We use data solely to operate and improve AICS. We never sell or trade your personal information.</p></S>
      <S title="3. Document Security"><p>All uploads are encrypted in transit via TLS 1.3. Files are purged within 60 minutes of session end.</p></S>
      <S title="4. Your Rights"><p>Under GDPR/CCPA you may access, correct, export, or delete your data. Email <strong style={{color:"#1a2e6e"}}>privacy@aics.ai</strong>. We respond within 30 days.</p></S>
    </div>
  )
}

function TermsContent() {
  const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-7">
      <h3 style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:"15px", color:"#1a2e6e", marginBottom:"8px" }}>{title}</h3>
      <div className="text-sm leading-relaxed space-y-2" style={{ color:"#4b5563" }}>{children}</div>
    </div>
  )
  return (
    <div>
      <p className="text-sm mb-5" style={{ color:"#6b7280" }}><strong style={{ color:"#1a2e6e" }}>Effective: January 1, 2026</strong><br/>Please read carefully before using AICS.</p>
      <div className="mb-5 h-px" style={{ background:"linear-gradient(90deg,transparent,#c9a84c,transparent)" }} />
      <S title="1. Acceptance"><p>By using AICS you confirm you are 16+ and have authority to enter this agreement.</p></S>
      <S title="2. Permitted Use"><p>You may not reverse-engineer our algorithms, upload IP-violating documents, or resell access without written approval.</p></S>
      <S title="3. Intellectual Property"><p>You retain ownership of uploaded documents. AICS retains all platform IP.</p></S>
      <S title="4. Liability"><p>AICS liability is limited to fees paid in the prior 12 months. We are not liable for indirect or consequential damages.</p></S>
      <p className="text-xs mt-4" style={{ color:"#9ca3af" }}>Legal: <strong>legal@aics.ai</strong></p>
    </div>
  )
}

function ContactContent() {
  return (
    <div>
      <p className="text-sm mb-5" style={{ color:"#6b7280" }}>Have a question or need support? We're here to help.</p>
      <div className="mb-5 h-px" style={{ background:"linear-gradient(90deg,transparent,#c9a84c,transparent)" }} />
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon: <Mail className="size-5" />, label: "Email", value: "hello@aics.ai", sub: "Reply within 4 business hours" },
          { icon: <Phone className="size-5" />, label: "Phone", value: "+1 (800) 247-2427", sub: "Mon–Fri, 9 AM – 6 PM EST" },
        ].map(c => (
          <div key={c.label} className="rounded-2xl p-5" style={{ background:"#f8f7ff", border:"1px solid rgba(201,168,76,0.25)" }}>
            <div className="flex items-center justify-center w-10 h-10 rounded-xl mb-3" style={{ background:"linear-gradient(135deg,#1a2e6e,#4c1d95)" }}>
              <span style={{ color:"#fbbf24" }}>{c.icon}</span>
            </div>
            <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color:"#92400e" }}>{c.label}</p>
            <p className="font-semibold mb-1" style={{ color:"#1a2e6e", fontSize:"15px" }}>{c.value}</p>
            <p className="text-xs" style={{ color:"#9ca3af" }}>{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function FeaturesContent() {
  const features = [
    { emoji:"📤", title:"Large File Support", desc:"Upload PDFs up to 5TB in size. No matter how large or complex your document, our engine handles it efficiently without any server-side storage.", accent:"#1a2e6e" },
    { emoji:"🔍", title:"Smart Keyword Search", desc:"50+ compliance keywords are automatically matched across every page. Results show the full paragraph with context, resident name, location, and page number.", accent:"#4c1d95" },
    { emoji:"🧠", title:"In-Memory Processing", desc:"Your PDF is parsed entirely in your browser using PDF.js. No file is ever uploaded to any server — data lives only in your session memory and is gone when you close the tab.", accent:"#0f766e" },
    { emoji:"🔒", title:"Zero Data Retention", desc:"Because everything is processed in-memory, there is nothing to delete. No blob storage, no cleanup jobs, no privacy risk. Your documents never touch our servers.", accent:"#7c3aed" },
    { emoji:"📄", title:"Export to Word", desc:"Generate a professional .docx report with all extracted paragraphs, keyword highlights, resident details, and page references — ready to share with your compliance team.", accent:"#b8860b" },
    { emoji:"⚡", title:"Instant Results", desc:"Search completes in under a second regardless of PDF size. The entire pipeline — parse, match, extract — runs client-side with no upload delays or server queues.", accent:"#dc2626" },
  ]
  const stats = [
    { num:"50+", label:"Keywords tracked" },
    { num:"5TB",  label:"Max file size" },
    { num:"100%", label:"In-memory" },
    { num:"<1s",  label:"Search speed" },
  ]
  const steps = [
    { num:"01", title:"Upload PDF", desc:"Drop any PDF. Parsed instantly in your browser — nothing leaves your device." },
    { num:"02", title:"Auto-search", desc:"All 50+ keywords matched across every page with full paragraph context." },
    { num:"03", title:"Export .docx", desc:"Download a polished Word report with findings, names, and page refs." },
  ]
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"28px" }}>
      <div>
        <p style={{ fontSize:"13px", color:"#6b7280", marginBottom:"16px", lineHeight:1.6 }}>Everything you need to work with compliance documents — faster, safer, and without storing a single file.</p>
        <div style={{ height:"1px", background:"linear-gradient(90deg,transparent,#c9a84c,transparent)", marginBottom:"20px" }} />

        {/* Stats row */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"10px", marginBottom:"24px" }}>
          {stats.map(({ num, label }) => (
            <div key={label} style={{ textAlign:"center", padding:"14px 8px", borderRadius:"12px", background:"rgba(26,46,110,0.04)", border:"1px solid rgba(201,168,76,0.2)" }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"26px", fontWeight:900, background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1 }}>{num}</div>
              <div style={{ fontSize:"10px", fontWeight:600, color:"#6b7280", marginTop:"4px", letterSpacing:"0.03em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {features.map(({ emoji, title, desc, accent }) => (
            <div key={title} style={{ display:"flex", gap:"14px", alignItems:"flex-start", padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.95)", border:`1px solid ${accent}18`, boxShadow:"0 2px 12px rgba(26,46,110,0.05)" }}>
              <div style={{ flexShrink:0, width:"40px", height:"40px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"10px", background:`${accent}10`, border:`1px solid ${accent}18`, fontSize:"18px" }}>{emoji}</div>
              <div>
                <div style={{ height:"2px", width:"20px", borderRadius:"2px", marginBottom:"6px", background:`linear-gradient(90deg,${accent},#c9a84c)` }} />
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"14px", fontWeight:700, color:"#111827", marginBottom:"4px" }}>{title}</div>
                <div style={{ fontSize:"12px", color:"#6b7280", lineHeight:1.65 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div>
        <div style={{ height:"1px", background:"linear-gradient(90deg,transparent,#c9a84c,transparent)", marginBottom:"20px" }} />
        <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.16em", color:"#92400e", textTransform:"uppercase", marginBottom:"12px" }}>How It Works</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"10px" }}>
          {steps.map(({ num, title, desc }) => (
            <div key={num} style={{ padding:"16px", borderRadius:"14px", background:"rgba(255,255,255,0.95)", border:"1px solid rgba(201,168,76,0.18)", position:"relative", overflow:"hidden" }}>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"52px", fontWeight:900, color:"rgba(26,46,110,0.04)", position:"absolute", top:"-6px", right:"8px", lineHeight:1, pointerEvents:"none" }}>{num}</div>
              <div style={{ fontSize:"10px", fontWeight:700, color:"#c9a84c", letterSpacing:"0.1em", marginBottom:"6px" }}>{num}</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:"14px", color:"#111827", marginBottom:"5px" }}>{title}</div>
              <div style={{ fontSize:"12px", color:"#6b7280", lineHeight:1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  const [activeModal, setActiveModal] = useState<"Privacy"|"Terms"|"Contact"|"Features"|null>(null)
  const modalContent: Record<string,{title:string;component:React.ReactNode}> = {
    Privacy:  { title:"Privacy Policy",    component:<PrivacyContent /> },
    Terms:    { title:"Terms of Service",  component:<TermsContent /> },
    Contact:  { title:"Contact Us",        component:<ContactContent /> },
    Features: { title:"Features",          component:<FeaturesContent /> },
  }

  const stats = [
    { num:"50+",  label:"Keywords tracked" },
    { num:"5TB",  label:"Max file size" },
    { num:"100%", label:"In-memory processing" },
    { num:"<1s",  label:"Search speed" },
  ]

  const steps = [
    { icon:<FileText className="size-5"/>,   num:"01", title:"Upload PDF",        desc:"Drop any PDF file — up to 5TB supported" },
    { icon:<Search className="size-5"/>,     num:"02", title:"Auto-Search",       desc:"Keywords are matched across every page instantly" },
    { icon:<Download className="size-5"/>,   num:"03", title:"Export Results",    desc:"Download a polished Word document with findings" },
  ]

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col" style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        @keyframes fadeUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        @keyframes shimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes pulse    { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.4)} 50%{box-shadow:0 0 0 8px rgba(201,168,76,0)} }
        @keyframes borderGlow { 0%,100%{border-color:rgba(201,168,76,0.3)} 50%{border-color:rgba(201,168,76,0.7)} }
        @keyframes scanLine { 0%{top:-4px} 100%{top:100%} }
        @keyframes countUp  { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }

        .anim-d0 { animation: fadeUp 0.7s ease 0.0s both }
        .anim-d1 { animation: fadeUp 0.7s ease 0.12s both }
        .anim-d2 { animation: fadeUp 0.7s ease 0.24s both }
        .anim-d3 { animation: fadeUp 0.7s ease 0.36s both }
        .anim-d4 { animation: fadeUp 0.7s ease 0.5s both }
        .anim-d5 { animation: fadeUp 0.7s ease 0.65s both }
        .float   { animation: float 6s ease-in-out infinite }

        .gold-shimmer {
          background: linear-gradient(90deg,#b8860b,#f5d06e,#c9a84c,#f5d06e,#b8860b);
          background-size:200% auto;
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
          animation: shimmer 4s linear infinite;
        }
        .royal-gradient-text {
          background: linear-gradient(135deg,#1a2e6e 0%,#4c1d95 60%,#1a2e6e 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .btn-royal {
          background: linear-gradient(135deg,#1a2e6e,#4c1d95);
          color:#fff;
          box-shadow: 0 4px 20px rgba(26,46,110,0.3);
          transition: all 0.2s;
          display:inline-flex; align-items:center;
        }
        .btn-royal:hover { box-shadow:0 8px 32px rgba(26,46,110,0.5); transform:translateY(-2px) }

        .btn-outline {
          background: transparent;
          border: 1.5px solid rgba(26,46,110,0.3);
          color: #1a2e6e;
          transition: all 0.2s;
          display:inline-flex; align-items:center;
        }
        .btn-outline:hover { background:rgba(26,46,110,0.05); border-color:#1a2e6e; transform:translateY(-1px) }

        .royal-card {
          background: rgba(255,255,255,0.95);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(201,168,76,0.3);
          box-shadow: 0 12px 60px rgba(26,46,110,0.1), 0 1px 0 rgba(201,168,76,0.4) inset;
        }
        .step-card {
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(201,168,76,0.2);
          box-shadow: 0 4px 24px rgba(26,46,110,0.07);
          transition: all 0.25s;
        }
        .step-card:hover { transform:translateY(-6px); box-shadow:0 16px 48px rgba(26,46,110,0.14); border-color:rgba(201,168,76,0.5) }

        .stat-card {
          background: rgba(255,255,255,0.9);
          border: 1px solid rgba(201,168,76,0.2);
          transition: all 0.2s;
        }
        .stat-card:hover { border-color:rgba(201,168,76,0.5); transform:translateY(-3px) }

        .badge-pill {
          background: linear-gradient(135deg,#fef9ec,#fef3c7);
          border: 1px solid rgba(201,168,76,0.4);
          animation: pulse 3s ease-in-out infinite;
        }

        .header-bar {
          border-bottom: 1px solid rgba(201,168,76,0.15);
          background: rgba(255,255,255,0.88);
          backdrop-filter: blur(20px);
        }

        .scan-line {
          position:absolute; left:0; right:0; height:2px;
          background: linear-gradient(90deg,transparent,rgba(201,168,76,0.6),transparent);
          animation: scanLine 3s linear infinite;
        }

        .nav-link {
          position:relative; color:#374151; font-weight:500; font-size:14px;
          background:none; border:none; cursor:pointer; padding:4px 0;
          transition: color 0.2s; font-family:inherit;
        }
        .nav-link::after {
          content:''; position:absolute; bottom:-2px; left:0; right:0; height:2px;
          background:linear-gradient(90deg,#1a2e6e,#c9a84c);
          transform:scaleX(0); transition:transform 0.2s; transform-origin:left;
        }
        .nav-link:hover { color:#1a2e6e }
        .nav-link:hover::after { transform:scaleX(1) }

        .footer-link { transition:color 0.18s; color:#9ca3af; background:none; border:none; cursor:pointer; font-family:inherit; font-size:13px; font-weight:500 }
        .footer-link:hover { color:#b45309 !important }

        .result-row {
          border-left:2px solid rgba(201,168,76,0.25);
          transition:all 0.18s;
          background:#fafafa;
        }
        .result-row:hover { border-left-color:#c9a84c; background:#fff }

        .keyword-tag {
          background: linear-gradient(135deg,rgba(26,46,110,0.08),rgba(76,29,149,0.08));
          border: 1px solid rgba(76,29,149,0.15);
          color: #4c1d95;
          font-size:10px; font-weight:700; letter-spacing:0.05em;
          border-radius:6px; padding:2px 7px;
        }
      `}</style>

      <ParticleCanvas />

      {/* ── Header ── */}
      <header className="header-bar relative z-10 sticky top-0">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6" style={{ height:"72px" }}>
          <Link href="/" className="flex items-center gap-3 anim-d0">
            <div className="p-2.5 rounded-xl" style={{ background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow:"0 4px 14px rgba(26,46,110,0.3)" }}>
              <FileSearch className="size-5 text-yellow-300" />
            </div>
            <div className="flex flex-col">
              <span style={{ fontFamily:"'Playfair Display',serif", fontSize:"20px", fontWeight:900, background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>AICS</span>
              <span style={{ fontSize:"9px", letterSpacing:"0.2em", color:"#92400e", fontWeight:700, textTransform:"uppercase" }}>PDF Search Engine</span>
            </div>
          </Link>

          <nav className="flex items-center gap-8">
            <Link href="/login" className="btn-royal anim-d2 rounded-xl px-6 py-2.5 text-sm font-semibold gap-2">
              Sign In <ArrowRight className="size-4" />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <main className="relative z-10 flex-1" style={{ display:"flex", alignItems:"center", overflow:"hidden" }}>
        <section style={{ width:"100%", maxWidth:"1280px", margin:"0 auto", padding:"0 24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"48px", flexWrap:"wrap" }}>

            {/* Left */}
            <div style={{ flex:1, maxWidth:"560px", display:"flex", flexDirection:"column", gap:"16px" }}>
              <div className="badge-pill anim-d0 inline-flex items-center gap-2 rounded-full px-4 py-2">
                <Zap className="size-3.5" style={{ color:"#b8860b" }} />
                <span style={{ fontSize:"12px", fontWeight:700, color:"#92400e" }}>Lightning-fast document analysis</span>
              </div>

              <div className="anim-d1 space-y-2">
                <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(36px,4vw,56px)", fontWeight:900, lineHeight:1.08 }}>
                  <span className="royal-gradient-text">Find Anything</span>
                  <br />
                  <span className="gold-shimmer">In Your PDFs</span>
                </h1>
              </div>

              <p className="anim-d2" style={{ color:"#4b5563", maxWidth:"480px", fontSize:"15px", lineHeight:1.65 }}>
                Transform compliance workflows. Upload PDFs, search keywords instantly,
                extract paragraphs with context, and export professional reports.
              </p>

              <div className="anim-d4 flex items-center gap-6">
                {[
                  { icon:<Shield className="size-3.5"/>, label:"Secure & Private" },
                  { icon:<Clock className="size-3.5"/>,  label:"Save Hours Daily" },
                  { icon:<Zap className="size-3.5"/>,    label:"No Storage Needed" },
                ].map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5" style={{ color:"#6b7280", fontSize:"12px", fontWeight:500 }}>
                    <span style={{ color:"#1a2e6e" }}>{icon}</span>
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Preview Card */}
            <div className="flex-1 anim-d5 w-full max-w-md">
              <div className="float">
                <div className="h-1 w-full rounded-t-2xl" style={{ background:"linear-gradient(90deg,#1a2e6e,#c9a84c,#f5d06e,#c9a84c,#4c1d95)" }} />
                <div className="royal-card rounded-b-2xl rounded-tr-2xl relative overflow-hidden" style={{ padding:"20px" }}>
                  <div className="scan-line" />

                  {/* Mock search bar */}
                  <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 mb-4" style={{ background:"#f3f1ff", border:"1px solid rgba(76,29,149,0.15)" }}>
                    <Search className="size-4" style={{ color:"#9ca3af" }} />
                    <span style={{ fontSize:"13px", color:"#9ca3af", flex:1 }}>Searching keywords...</span>
                    <span className="keyword-tag">ABUSE</span>
                    <span className="keyword-tag">HIT</span>
                  </div>

                  {/* Mock results */}
                  <div className="space-y-2 mb-4">
                    {[
                      { page:4,  resident:"J. Smith",   kw:"CONCERN",  matches:2 },
                      { page:11, resident:"M. Johnson",  kw:"WANDER",   matches:1 },
                      { page:17, resident:"R. Davis",   kw:"APS",      matches:3 },
                    ].map((r,i) => (
                      <div key={i} className="result-row rounded-r-xl px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="keyword-tag">{r.kw}</span>
                              <span style={{ fontSize:"12px", fontWeight:600, color:"#1a2e6e" }}>{r.resident}</span>
                            </div>
                            <p style={{ fontSize:"11px", color:"#9ca3af" }}>Page {r.page} · {r.matches} match{r.matches>1?"es":""} found</p>
                          </div>
                          <div className="h-2 w-2 rounded-full animate-pulse" style={{ background:"#c9a84c", boxShadow:"0 0 8px rgba(201,168,76,0.6)" }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Export button mock */}
                  <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background:"linear-gradient(135deg,rgba(26,46,110,0.05),rgba(76,29,149,0.05))", border:"1px solid rgba(201,168,76,0.2)" }}>
                    <div>
                      <p style={{ fontSize:"12px", fontWeight:700, color:"#1a2e6e" }}>3 paragraphs extracted</p>
                      <p style={{ fontSize:"11px", color:"#9ca3af" }}>Ready to export</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background:"linear-gradient(135deg,#1a2e6e,#4c1d95)", boxShadow:"0 4px 12px rgba(26,46,110,0.3)" }}>
                      <Download className="size-3.5 text-yellow-300" />
                      <span style={{ fontSize:"12px", fontWeight:700, color:"#fff" }}>Export .docx</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10" style={{ borderTop:"1px solid rgba(201,168,76,0.18)", background:"rgba(255,255,255,0.98)" }}>
        {/* Top footer bar */}
        <div className="mx-auto max-w-7xl px-6 py-5">
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"32px" }}>
            {/* Brand */}
            <div style={{ maxWidth:"280px" }}>
              <p style={{ fontFamily:"'Playfair Display',serif", fontSize:"13px", color:"#1a2e6e", fontWeight:700, marginBottom:"6px" }}>Built for compliance teams.</p>
              <p style={{ fontSize:"12px", color:"#9ca3af", lineHeight:1.65 }}>
                Search, extract, and export compliance findings from any PDF — instantly, securely, with zero data stored.
              </p>
            </div>

            {/* Links */}
            <div style={{ display:"flex", gap:"48px" }}>
              <div>
                <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.16em", color:"#92400e", textTransform:"uppercase", marginBottom:"10px" }}>Product</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <button onClick={() => setActiveModal("Features")} className="footer-link" style={{ textAlign:"left" }}>Features & How It Works</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.16em", color:"#92400e", textTransform:"uppercase", marginBottom:"10px" }}>Legal</div>
                <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                  <button onClick={() => setActiveModal("Privacy")} className="footer-link" style={{ textAlign:"left" }}>Privacy Policy</button>
                  <button onClick={() => setActiveModal("Terms")} className="footer-link" style={{ textAlign:"left" }}>Terms of Service</button>
                  <button onClick={() => setActiveModal("Contact")} className="footer-link" style={{ textAlign:"left" }}>Contact</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop:"1px solid rgba(201,168,76,0.12)", padding:"16px 0" }}>
          <div className="mx-auto max-w-7xl px-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize:"12px", color:"#9ca3af" }}>© 2026 AICS. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-2" style={{ fontSize:"12px", color:"#9ca3af" }}>
              <Shield className="size-3" style={{ color:"#1a2e6e" }} />
              <span>Zero data retention · In-memory processing · TLS 1.3 encrypted</span>
            </div>
          </div>
        </div>
      </footer>

      {activeModal && (
        <Modal title={modalContent[activeModal].title} onClose={() => setActiveModal(null)}>
          {modalContent[activeModal].component}
        </Modal>
      )}
    </div>
  )
}