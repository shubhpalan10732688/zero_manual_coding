import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { optionalEnv, requireEnv } from './config';

/**
 * Envelope for API keys held at rest.
 *
 * These are other people's credentials: a Cursor user key can create Cloud Agents and
 * reach the repositories that user can reach. So the plaintext exists only inside this
 * module, the ciphertext is useless without a master key held outside the database, and
 * nothing here ever returns a key in an error message or a log line.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits, the size GCM is specified for.
const KEY_BYTES = 32;

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  /** Which master key sealed this, so keys can be rotated without a flag day. */
  keyVersion: number;
}

function masterKey(): Buffer {
  const encoded = requireEnv('ENCRYPTION_KEY');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return key;
}

export function currentKeyVersion(): number {
  return Number(optionalEnv('ENCRYPTION_KEY_VERSION', '1'));
}

export function seal(plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: currentKeyVersion() };
}

export function unseal(sealed: SealedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, masterKey(), sealed.iv);
  decipher.setAuthTag(sealed.authTag);
  try {
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // The GCM tag check failed: wrong master key, or the stored row was tampered with.
    // Deliberately vague, and deliberately not echoing any of the inputs.
    throw new Error('Stored credential could not be decrypted');
  }
}

/**
 * Stable identifier for a key that is safe to store, log and compare. Lets us notice
 * "this is the same key you connected last week" without decrypting anything.
 */
export function fingerprint(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex').slice(0, 32);
}

export function fingerprintMatches(plaintext: string, expected: string): boolean {
  const actual = Buffer.from(fingerprint(plaintext));
  const target = Buffer.from(expected);
  return actual.length === target.length && timingSafeEqual(actual, target);
}

/**
 * For display. Shows enough for someone to recognise their own key and nothing more.
 * Cursor keys are `crsr_` plus 64 characters.
 */
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 12) return '****';
  return `${plaintext.slice(0, 9)}...${plaintext.slice(-4)}`;
}

const KEY_PATTERN = /^crsr_[A-Za-z0-9]{64}$/;

export function looksLikeCursorKey(candidate: string): boolean {
  return KEY_PATTERN.test(candidate.trim());
}
