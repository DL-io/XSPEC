const SECRET_PATTERNS = [/api[_-]?key/i, /secret/i, /private[_-]?key/i, /token/i, /password/i];

export function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SECRET_PATTERNS.some((pattern) => pattern.test(key)) ? '[REDACTED]' : sanitizeForLog(entry)]));
  }
  return value;
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  console.info(JSON.stringify({ level: 'info', message, context: sanitizeForLog(context ?? {}), at: new Date().toISOString() }));
}
