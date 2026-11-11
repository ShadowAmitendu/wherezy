/**
 * Convert a direct non-root browser URL (without a hash fragment) into a HashRouter path
 * so unknown server-fallback URLs like `/missing` render the client 404 page instead of `/`.
 */
export function getHashRedirectForDirectPath(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  if (hash) return null;
  if (!pathname || pathname === "/" || pathname === "/index.html") {
    return null;
  }
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `/#${normalizedPath}${search || ""}`;
}
