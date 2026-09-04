import { CursorApiError } from '../src/client/cursorClient';

/**
 * The login gate, without a database.
 *
 * `authenticate` writes on success, so these tests cover the checks that happen before any
 * write: the domain allowlist, the key format, and the rule that decides the whole design —
 * the key is the credential and the typed email is a claim checked against it. Every failure
 * here has to occur before `storeVerifiedKey` is reached, which is what the module mock
 * asserts.
 */

const storeVerifiedKey = jest.fn(async () => 'crsr_ab…yz');
const ensureAppUser = jest.fn(async () => undefined);

jest.mock('../src/users/keyStore', () => ({
  storeVerifiedKey: (...args: unknown[]) => storeVerifiedKey(...(args as [])),
  ensureAppUser: (...args: unknown[]) => ensureAppUser(...(args as [])),
}));

jest.mock('../src/db/pool', () => ({
  query: jest.fn(async () => []),
}));

// Imported after the mocks so the module graph picks them up.
import { allowedDomains, authenticate, isAllowedDomain, LoginError } from '../src/auth/login';

const KEY = `crsr_${'a'.repeat(64)}`;

function clientReturning(email: string | undefined) {
  return () =>
    ({
      getApiKeyIdentity: async () => ({
        userEmail: email,
        apiKeyName: 'laptop',
      }),
    }) as never;
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    throw new Error('expected authenticate to reject');
  } catch (error) {
    if (error instanceof LoginError) return error.reason;
    throw error;
  }
}

describe('allowedDomains', () => {
  const original = process.env.ALLOWED_EMAIL_DOMAINS;
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
    else process.env.ALLOWED_EMAIL_DOMAINS = original;
  });

  it('is empty when unset, which allows anyone', () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(allowedDomains()).toEqual([]);
    expect(isAllowedDomain('anyone@anywhere.test')).toBe(true);
  });

  it('accepts a comma-separated list and tolerates spacing and a leading @', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = ' @corp.test, Example.COM ';
    expect(allowedDomains()).toEqual(['corp.test', 'example.com']);
  });

  it('matches case-insensitively', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    expect(isAllowedDomain('Ada@CORP.test')).toBe(true);
  });

  it('rejects a domain that merely ends with an allowed one', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    expect(isAllowedDomain('ada@notcorp.test')).toBe(false);
  });

  it('rejects a subdomain, which is a different organisation as far as this is concerned', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    expect(isAllowedDomain('ada@mail.corp.test')).toBe(false);
  });

  it('rejects an address with no domain at all', () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    expect(isAllowedDomain('ada')).toBe(false);
  });
});

describe('authenticate', () => {
  beforeEach(() => {
    storeVerifiedKey.mockClear();
    ensureAppUser.mockClear();
    delete process.env.ALLOWED_EMAIL_DOMAINS;
  });

  it('accepts a key whose account matches the typed email', async () => {
    const result = await authenticate('Ada@corp.test', KEY, clientReturning('ada@corp.test'));
    expect(result.email).toBe('ada@corp.test');
    expect(result.hasKey).toBe(true);
    expect(storeVerifiedKey).toHaveBeenCalledTimes(1);
  });

  it('normalises the email before storing it', async () => {
    const result = await authenticate('  ADA@Corp.Test ', KEY, clientReturning('Ada@Corp.Test'));
    expect(result.email).toBe('ada@corp.test');
  });

  it('refuses a key belonging to somebody else', async () => {
    expect(
      await failureOf(authenticate('ada@corp.test', KEY, clientReturning('grace@corp.test'))),
    ).toBe('identity-mismatch');
    expect(storeVerifiedKey).not.toHaveBeenCalled();
  });

  it('does not name the real owner of a mismatched key', async () => {
    try {
      await authenticate('ada@corp.test', KEY, clientReturning('grace@corp.test'));
    } catch (error) {
      expect((error as Error).message).not.toContain('grace');
    }
  });

  it('refuses a key Cursor cannot attribute to anyone', async () => {
    expect(await failureOf(authenticate('ada@corp.test', KEY, clientReturning(undefined)))).toBe(
      'key-anonymous',
    );
  });

  it('refuses something that is not a Cursor key before calling Cursor', async () => {
    const client = jest.fn(clientReturning('ada@corp.test'));
    expect(await failureOf(authenticate('ada@corp.test', 'hunter2', client))).toBe('key-format');
    expect(client).not.toHaveBeenCalled();
  });

  it('refuses an address that is not an address', async () => {
    expect(await failureOf(authenticate('not-an-email', KEY, clientReturning('x@y.test')))).toBe(
      'email-missing',
    );
  });

  it('enforces the domain allowlist before touching the key', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    const client = jest.fn(clientReturning('ada@other.test'));
    expect(await failureOf(authenticate('ada@other.test', KEY, client))).toBe('email-domain');
    expect(client).not.toHaveBeenCalled();
  });

  it('signs somebody in with no key at all, without storing one', async () => {
    const client = jest.fn(clientReturning('ada@corp.test'));
    const result = await authenticate('Ada@corp.test', '', client);

    expect(result).toMatchObject({ email: 'ada@corp.test', hasKey: false });
    expect(result.identity).toBeUndefined();
    expect(ensureAppUser).toHaveBeenCalledWith('ada@corp.test');
    // Nothing to verify means nothing to ask Cursor about, and nothing to seal.
    expect(client).not.toHaveBeenCalled();
    expect(storeVerifiedKey).not.toHaveBeenCalled();
  });

  it('treats whitespace and a missing key as the same thing', async () => {
    expect((await authenticate('ada@corp.test', '   ', clientReturning('x@y.test'))).hasKey).toBe(
      false,
    );
    expect((await authenticate('ada@corp.test', undefined, clientReturning('x@y.test'))).hasKey).toBe(
      false,
    );
  });

  it('still enforces the domain allowlist when no key is given', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'corp.test';
    expect(await failureOf(authenticate('ada@other.test', ''))).toBe('email-domain');
    expect(ensureAppUser).not.toHaveBeenCalled();
  });

  it('still requires a real address when no key is given', async () => {
    expect(await failureOf(authenticate('not-an-email', ''))).toBe('email-missing');
    expect(ensureAppUser).not.toHaveBeenCalled();
  });

  it('reports a revoked key as rejected rather than as an outage', async () => {
    const denied = () =>
      ({
        getApiKeyIdentity: async () => {
          throw new CursorApiError('Forbidden', 403, '/v1/me');
        },
      }) as never;
    expect(await failureOf(authenticate('ada@corp.test', KEY, denied))).toBe('key-rejected');
  });

  it('lets an unexpected transport failure surface instead of blaming the key', async () => {
    const broken = () =>
      ({
        getApiKeyIdentity: async () => {
          throw new Error('socket hang up');
        },
      }) as never;

    await expect(authenticate('ada@corp.test', KEY, broken)).rejects.toThrow('socket hang up');
  });
});
