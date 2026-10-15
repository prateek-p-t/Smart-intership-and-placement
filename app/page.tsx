import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ArrowUpRightFromSquare, BriefcaseBusiness, Check, CircleDot, Compass, LockKeyhole, Sparkles } from 'lucide-react'

const pillars = [
  { title: 'Discover work that fits', detail: 'Browse real, published opportunities and see exactly how your skills line up.', icon: Compass },
  { title: 'Know where you stand', detail: 'Track every application in one private workspace, from submitted to offer.', icon: CircleDot },
  { title: 'Keep the process fair', detail: 'Eligibility stays rule-based. Recommendations show their work, and people make decisions.', icon: LockKeyhole },
]

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="brand-lockup" aria-label="Pathway home"><span className="brand-mark"><BriefcaseBusiness size={17} /></span><span>pathway<span className="brand-period">.</span></span></Link>
        <nav aria-label="Main navigation" className="landing-links"><a href="#how-it-works">How it works</a><Link href="/sign-in">For your campus</Link></nav>
        <div className="nav-actions"><Link className="text-action" href="/sign-in">Sign in</Link><Link className="button button-dark button-small" href="/sign-up">Create account <ArrowUpRight size={15} /></Link></div>
      </header>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> THE NEXT STEP, MADE CLEAR</div>
          <h1>Build a career<br />that <span>starts here.</span></h1>
          <p className="hero-description">Internships and placements, connected to your skills, your campus, and what you want to become.</p>
          <div className="hero-ctas"><Link href="/sign-up" className="button button-dark">Get started <ArrowUpRight size={16} /></Link><a href="#how-it-works" className="quiet-link">See how it works <ArrowDownRight size={15} /></a></div>
          <div className="trust-note"><span className="trust-icon"><Check size={14} /></span> Private by default. Your profile is yours.</div>
        </div>
        <div className="hero-visual" aria-label="Career matching workspace preview">
          <div className="workspace-card">
            <div className="workspace-top"><div><div className="workspace-kicker">YOUR CAREER DESK</div><div className="workspace-title">A little more clarity.</div></div><span className="live-pill"><span /> LIVE WORKSPACE</span></div>
            <div className="match-feature"><div className="match-icon"><Sparkles size={17} /></div><div className="match-content"><span>SKILL ALIGNMENT</span><strong>Understand the fit.</strong><small>See matched skills and what to build next.</small></div><ArrowUpRightFromSquare size={16} className="match-arrow" /></div>
            <div className="workspace-divider" />
            <div className="workflow-list"><div className="workflow-row"><span className="workflow-index">A</span><span>Explore verified opportunities</span><span className="workflow-state">OPEN</span></div><div className="workflow-row"><span className="workflow-index">B</span><span>Check clear eligibility rules</span><Check size={15} className="workflow-check" /></div><div className="workflow-row"><span className="workflow-index">C</span><span>Track every application</span><ArrowUpRight size={15} className="match-arrow" /></div></div>
            <div className="workspace-footer"><span>Student workspace</span><span>Designed for your next move <ArrowUpRight size={13} /></span></div>
          </div>
          <div className="visual-caption"><span className="caption-line" /> A more thoughtful way forward</div>
        </div>
      </section>
      <section className="value-strip" id="how-it-works"><div className="section-label">YOUR NEXT MOVE, IN THREE PARTS</div><div className="pillar-grid">{pillars.map(({ title, detail, icon: Icon }) => <article className="pillar" key={title}><div className="pillar-icon"><Icon size={19} strokeWidth={1.7} /></div><h2>{title}</h2><p>{detail}</p></article>)}</div></section>
      <footer className="landing-footer"><Link href="/" className="brand-lockup"><span className="brand-mark"><BriefcaseBusiness size={16} /></span><span>pathway<span className="brand-period">.</span></span></Link><span>Opportunities with a little more intention.</span><Link href="/sign-up" className="footer-link">Find your next step <ArrowUpRight size={14} /></Link></footer>
    </main>
  )
}
