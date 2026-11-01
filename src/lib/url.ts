/**
 * Validates and sanitizes callback URLs to prevent Open Redirect vulnerabilities.
 * Rule: Must be a relative path starting with a single '/' and must not contain
 * protocol-relative slashes ('//'), backslashes ('\'), or full URLs ('http:', 'https:').
 */
export function validateCallbackUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();

  // Reject empty string
  if (trimmed.length === 0) {
    return null;
  }

  // Must start with exactly one '/' and not '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  // Reject backslashes which browsers might resolve to protocol/domain
  if (trimmed.includes('\\')) {
    return null;
  }

  // Reject explicit protocol schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }

  return trimmed;
}
