export const securityHeaders = (
  production: boolean
): Record<string, string> => {
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()'
  };
  if (production) {
    headers['strict-transport-security'] =
      'max-age=31536000; includeSubDomains';
  }
  return headers;
};
