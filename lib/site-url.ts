// Prefer a configured canonical origin, but allow local and Vercel deployments
// to generate edit links without requiring an extra environment variable.
export function siteUrl(requestUrl: string, configuredUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const url = new URL(configuredUrl?.trim() || requestUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Site URL must use HTTP or HTTPS.");
  }
  return url.origin;
}
