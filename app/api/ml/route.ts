import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { modelServiceCapabilities } from '@/lib/ml-services/contracts'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to view service capabilities.' }, { status: 401 })

  return NextResponse.json({ capabilities: modelServiceCapabilities }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
