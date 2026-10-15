import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles, profileRoleNames, type PortalRole } from '@/lib/db/schema'

export type PortalActor = { userId: string; role: PortalRole }

export async function getPortalActor(): Promise<PortalActor | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const [profile] = await db
    .select({ role: portalProfiles.role })
    .from(portalProfiles)
    .where(eq(portalProfiles.userId, session.user.id))
    .limit(1)

  if (!profile || !profileRoleNames.includes(profile.role as PortalRole)) return null
  return { userId: session.user.id, role: profile.role as PortalRole }
}

export function hasPortalRole(actor: PortalActor | null, roles: readonly PortalRole[]) {
  return actor !== null && roles.includes(actor.role)
}

export function portalAuthError(actor: PortalActor | null) {
  return actor ? { error: 'You do not have permission to perform this action.' } : { error: 'Sign in to continue.' }
}

export function portalAuthStatus(actor: PortalActor | null) {
  return actor ? 403 : 401
}
