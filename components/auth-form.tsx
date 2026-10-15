'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { authClient } from '@/lib/auth-client'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, LoaderCircle, ShieldCheck } from 'lucide-react'

const credentialsSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(100, 'Name is too long.').optional(),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Password is too long.'),
})

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = credentialsSchema.safeParse({ name: isSignUp ? name : undefined, email, password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the information and try again.')
      return
    }
    setPending(true)
    setError('')
    try {
      const result = isSignUp
        ? await authClient.signUp.email({ name: parsed.data.name!, email: parsed.data.email, password: parsed.data.password })
        : await authClient.signIn.email({ email: parsed.data.email, password: parsed.data.password })
      if (result.error) throw new Error('Unable to continue with those details.')
      router.replace('/dashboard')
      router.refresh()
    } catch {
      setError('Unable to continue with those details. Check your information and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link href="/" className="brand-lockup auth-brand"><span className="brand-mark"><BriefcaseBusiness size={17} /></span><span>pathway<span className="brand-period">.</span></span></Link>
        <div className="auth-aside-copy"><div className="eyebrow"><span className="eyebrow-dot" /> YOUR CAREER, IN CONTEXT</div><h1>Good things<br />start with a<br /><span>next step.</span></h1><p>A clearer connection between what you can do and where you could go.</p></div>
        <div className="auth-aside-foot"><ShieldCheck size={16} /> Your account is private and protected.</div>
      </section>
      <section className="auth-main"><div className="auth-box"><Link className="back-link" href="/"><ArrowLeft size={15} /> Back to home</Link><div className="auth-heading"><div className="section-label">{isSignUp ? 'START YOUR JOURNEY' : 'WELCOME BACK'}</div><h2>{isSignUp ? 'Create your account' : 'Sign in to Pathway'}</h2><p>{isSignUp ? 'Set up your student workspace to get started.' : 'Pick up where you left off.'}</p></div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {isSignUp && <label className="form-field"><span>Full name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" required minLength={2} maxLength={100} /></label>}
          <label className="form-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" required /></label>
          <label className="form-field"><span>Password</span><input type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={isSignUp ? 'At least 8 characters' : 'Your password'} required minLength={8} maxLength={128} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-dark auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="spin" size={16} /> : null}{pending ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}{!pending && <ArrowRight size={16} />}</button>
        </form>
        <p className="auth-switch">{isSignUp ? 'Already have an account?' : 'New to Pathway?'} <Link href={isSignUp ? '/sign-in' : '/sign-up'}>{isSignUp ? 'Sign in' : 'Create an account'}</Link></p>
        <p className="auth-legal">By continuing, you agree to use this platform responsibly. Account access is role-assigned; registration does not grant recruiter or administrator privileges.</p>
      </div></section>
    </main>
  )
}
