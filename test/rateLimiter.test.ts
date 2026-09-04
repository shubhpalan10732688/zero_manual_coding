import { RateLimiter } from '../src/client/rateLimiter';

describe('RateLimiter', () => {
  it('lets the first `limit` calls through without waiting', async () => {
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      20,
      60_000,
      async (ms) => {
        sleeps.push(ms);
      },
      () => 1_000_000,
    );

    for (let i = 0; i < 20; i += 1) {
      await limiter.acquire();
    }

    expect(sleeps).toHaveLength(0);
  });

  it('waits once the per-minute budget is spent, then proceeds', async () => {
    let clock = 1_000_000;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      3,
      60_000,
      async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      () => clock,
    );

    for (let i = 0; i < 5; i += 1) {
      await limiter.acquire();
    }

    // The three hits share a timestamp, so one wait past the window frees all of them
    // and the remaining two calls proceed without sleeping again.
    expect(sleeps).toEqual([60_001]);
    expect(clock).toBe(1_060_001);
  });

  it('does not wait when calls are spread beyond the window', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(
      2,
      60_000,
      async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      () => clock,
    );

    await limiter.acquire();
    clock += 61_000;
    await limiter.acquire();
    clock += 61_000;
    await limiter.acquire();

    expect(sleeps).toHaveLength(0);
  });

  it('rejects a nonsensical limit', () => {
    expect(() => new RateLimiter(0)).toThrow(/at least 1/);
  });
});
