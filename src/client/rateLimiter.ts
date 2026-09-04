/**
 * Sliding-window limiter. Cursor enforces per-minute budgets per team that differ by
 * endpoint (20/min for most Admin endpoints, 60/min for filtered usage events), so each
 * endpoint family gets its own instance rather than sharing one global budget.
 */
export class RateLimiter {
  private readonly hits: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (limit < 1) throw new Error('limit must be at least 1');
  }

  async acquire(): Promise<void> {
    for (;;) {
      const cutoff = this.now() - this.windowMs;
      while (this.hits.length > 0 && (this.hits[0] as number) <= cutoff) {
        this.hits.shift();
      }

      if (this.hits.length < this.limit) {
        this.hits.push(this.now());
        return;
      }

      const oldest = this.hits[0] as number;
      const waitMs = oldest + this.windowMs - this.now() + 1;
      await this.sleep(Math.max(waitMs, 1));
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
