function normalizeOrigin(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return url.origin
  } catch {
    return null
  }
}

export function isSameOriginRequest(request: Request) {
  const origin = normalizeOrigin(request.headers.get('origin'))
  const requestOrigin = normalizeOrigin(request.url)
  if (origin && origin === requestOrigin) return true

  if (origin) {
    const trustedOrigins = [
      process.env.BETTER_AUTH_URL,
      process.env.V0_RUNTIME_URL,
      process.env.V0_DEV_APP_URL,
      process.env.V0_BUILD_URL,
      process.env.V0_SANDBOX_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ].map(normalizeOrigin)
    return trustedOrigins.some((trustedOrigin) => trustedOrigin === origin)
  }

  const fetchSite = request.headers.get('sec-fetch-site')
  return fetchSite === 'same-origin' || fetchSite === 'none'
}
