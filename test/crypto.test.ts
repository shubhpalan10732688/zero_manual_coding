import { randomBytes } from 'node:crypto';

import {
  fingerprint,
  fingerprintMatches,
  looksLikeCursorKey,
  maskKey,
  seal,
  unseal,
} from '../src/crypto';

const SAMPLE_KEY = `crsr_${'a1b2c3d4'.repeat(8)}`;

describe('seal and unseal', () => {
  const original = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  it('round-trips a key', () => {
    expect(unseal(seal(SAMPLE_KEY))).toBe(SAMPLE_KEY);
  });

  it('produces different ciphertext each time, so equal keys are not detectable by comparison', () => {
    const first = seal(SAMPLE_KEY);
    const second = seal(SAMPLE_KEY);
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
    expect(first.iv.equals(second.iv)).toBe(false);
  });

  it('never leaves the plaintext in the sealed payload', () => {
    const sealed = seal(SAMPLE_KEY);
    const blob = Buffer.concat([sealed.ciphertext, sealed.iv, sealed.authTag]).toString('binary');
    expect(blob).not.toContain(SAMPLE_KEY);
    expect(blob).not.toContain('crsr_');
  });

  it('refuses tampered ciphertext rather than returning garbage', () => {
    const sealed = seal(SAMPLE_KEY);
    sealed.ciphertext[0] = sealed.ciphertext[0]! ^ 0xff;
    expect(() => unseal(sealed)).toThrow('Stored credential could not be decrypted');
  });

  it('refuses a tampered auth tag', () => {
    const sealed = seal(SAMPLE_KEY);
    sealed.authTag[0] = sealed.authTag[0]! ^ 0xff;
    expect(() => unseal(sealed)).toThrow('Stored credential could not be decrypted');
  });

  it('cannot be decrypted with a different master key', () => {
    const sealed = seal(SAMPLE_KEY);
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(() => unseal(sealed)).toThrow('Stored credential could not be decrypted');
  });

  it('rejects a master key of the wrong length with actionable guidance', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('too short').toString('base64');
    expect(() => seal(SAMPLE_KEY)).toThrow(/must decode to 32 bytes/);
  });

  it('never mentions the plaintext in an error', () => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const sealed = seal(SAMPLE_KEY);
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      unseal(sealed);
      throw new Error('expected decryption to fail');
    } catch (error) {
      expect((error as Error).message).not.toContain(SAMPLE_KEY);
    }
  });
});

describe('fingerprint', () => {
  it('is stable for the same key', () => {
    expect(fingerprint(SAMPLE_KEY)).toBe(fingerprint(SAMPLE_KEY));
  });

  it('differs for different keys', () => {
    expect(fingerprint(SAMPLE_KEY)).not.toBe(fingerprint(`${SAMPLE_KEY}x`));
  });

  it('does not embed the key', () => {
    expect(fingerprint(SAMPLE_KEY)).not.toContain('crsr_');
  });

  it('compares without leaking timing', () => {
    expect(fingerprintMatches(SAMPLE_KEY, fingerprint(SAMPLE_KEY))).toBe(true);
    expect(fingerprintMatches(SAMPLE_KEY, fingerprint('other'))).toBe(false);
  });
});

describe('maskKey', () => {
  it('shows the prefix and last four only', () => {
    const masked = maskKey(SAMPLE_KEY);
    expect(masked.startsWith('crsr_a1b2')).toBe(true);
    expect(masked.endsWith(SAMPLE_KEY.slice(-4))).toBe(true);
    expect(masked.length).toBeLessThan(20);
  });

  it('does not reveal a short string at all', () => {
    expect(maskKey('short')).toBe('****');
  });
});

describe('looksLikeCursorKey', () => {
  it.each([
    [SAMPLE_KEY, true],
    [` ${SAMPLE_KEY} `, true],
    ['crsr_tooshort', false],
    [`sk_${'a'.repeat(64)}`, false],
    ['', false],
  ])('validates %s', (candidate, expected) => {
    expect(looksLikeCursorKey(candidate)).toBe(expected);
  });
});
