export const PRODUCTION_APP_ORIGIN = 'https://vital-cyan-beta.vercel.app'

export function getAuthRedirectUrl(path, options = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Authentication redirect paths must be relative to the app origin.')
  }

  const production = options.production ?? import.meta.env.PROD
  const origin = production
    ? PRODUCTION_APP_ORIGIN
    : options.origin ?? window.location.origin

  return new URL(path, origin).toString()
}
