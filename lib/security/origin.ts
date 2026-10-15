export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).origin === new URL(request.url).origin
    } catch {
      return false
    }
  }

  return request.headers.get('sec-fetch-site') !== 'cross-site'
}
