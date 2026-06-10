'use client';

export const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'system';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const operatorApiKey = process.env.NEXT_PUBLIC_OPERATOR_API_KEY;
  if (operatorApiKey) {
    headers.set('x-api-key', operatorApiKey);
  } else {
    // Local operator terminal: use trusted role headers bypass (requires TRUST_OPERATOR_ROLE_HEADERS=true server-side)
    headers.set('x-polyshore-role', 'operator');
    headers.set('x-operator-id', 'local-operator');
  }
  return fetch(input, { ...init, headers });
}
