import { describe, expect, it } from 'vitest';
import { redact } from '@/observability/logger';

describe('redact', () => {
  it('masque les champs sensibles quelle que soit la casse', () => {
    const output = redact({
      username: 'mor_2314',
      password: '83r5^_',
      Token: 'jwt',
      Authorization: 'Bearer jwt',
      apiKey: 'k',
    });

    expect(output.username).toBe('mor_2314');
    expect(output.password).toBe('[REDACTED]');
    expect(output.Token).toBe('[REDACTED]');
    expect(output.Authorization).toBe('[REDACTED]');
    expect(output.apiKey).toBe('[REDACTED]');
  });

  it('laisse intacts les champs non sensibles', () => {
    expect(redact({ count: 20, durationMs: 130 })).toEqual({ count: 20, durationMs: 130 });
  });
});
