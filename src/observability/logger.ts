import { getConfig } from '@/api/config';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Champs à ne jamais laisser sortir dans un log. */
const REDACTED_KEYS = ['password', 'token', 'authorization', 'secret', 'apikey'];

export function redact(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) =>
      REDACTED_KEYS.includes(key.toLowerCase()) ? [key, '[REDACTED]'] : [key, value],
    ),
  );
}

/**
 * Log structuré JSON : la sortie est parsée telle quelle par Promtail puis
 * indexée par Loki. Un log non structuré coûte cher à requêter en incident.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const { environment, appVersion } = getConfig();
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    service: 'shopflow-frontend',
    env: environment,
    version: appVersion,
    ...redact(fields),
  });
  if (level === 'error') console.error(entry);
  else console.warn(entry);
}
