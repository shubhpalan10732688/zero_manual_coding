import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

import { optionalEnv } from './config';

let cached: string | undefined;

/**
 * Resolves the Cursor Admin API key. Prefers CURSOR_API_KEY for local runs and falls
 * back to Secrets Manager in Lambda. The key is cached for the life of the process so
 * a warm Lambda does not call Secrets Manager on every invocation.
 *
 * The secret may be a bare string or JSON containing a `CURSOR_API_KEY` or `apiKey` field.
 */
export async function getCursorApiKey(): Promise<string> {
  if (cached) return cached;

  const fromEnv = optionalEnv('CURSOR_API_KEY');
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  const secretId = optionalEnv('CURSOR_API_KEY_SECRET_ID');
  if (!secretId) {
    throw new Error(
      'No Cursor API key available. Set CURSOR_API_KEY for local runs or CURSOR_API_KEY_SECRET_ID in AWS.',
    );
  }

  const client = new SecretsManagerClient({ region: optionalEnv('AWS_REGION', 'us-east-1') });
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = result.SecretString;
  if (!raw) {
    throw new Error(`Secret ${secretId} has no string value`);
  }

  cached = extractKey(raw);
  return cached;
}

function extractKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const value = parsed.CURSOR_API_KEY ?? parsed.apiKey ?? parsed.cursorApiKey;
    if (typeof value === 'string' && value) return value;
  } catch {
    // Fall through: treat a non-JSON payload as the key itself.
  }
  return trimmed;
}

/** Test seam. */
export function resetApiKeyCache(): void {
  cached = undefined;
}
