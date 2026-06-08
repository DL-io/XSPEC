'use client';

export const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'system';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const operatorApiKey = process.env.NEXT_PUBLIC_OPERATOR_API_KEY;
  if (!operatorApiKey && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_OPERATOR_API_KEY is required for the browser terminal to call protected APIs in production.');
  }
  if (operatorApiKey) headers.set('x-api-key', operatorApiKey);
  return fetch(input, { ...init, headers });
}
