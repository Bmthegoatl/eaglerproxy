import { Logger } from "../../logger.js";

export type RateLimitData = {
  success: boolean;
  missingTokens?: number;
  retryIn?: number;
  retryAt?: number;
};

type KeyData = {
  tokens: number;
  lastRefillTime: number;
};

export default class BucketRateLimiter {
  public capacity: number;
  public refillsPerMin: number;
  public keyMap: Map<string, KeyData>;
  public static readonly GC_TOLERANCE: number = 50;
  private sweeper: NodeJS.Timeout;

  constructor(capacity: number, refillsPerMin: number) {
    this.capacity = capacity;
    this.refillsPerMin = refillsPerMin;
    this.keyMap = new Map();

    // sweeper cleans up full buckets every 5 seconds
    this.sweeper = setInterval(() => this.removeFull(), 5000);
  }

  public cleanUp(): void {
    clearInterval(this.sweeper);
  }

  public consume(key: string, consumeTokens: number = 1): RateLimitData {
    let bucket = this.keyMap.get(key);

    const now = Date.now();

    if (!bucket) {
      // first access
      bucket = { tokens: this.capacity, lastRefillTime: now };
      this.keyMap.set(key, bucket);
    }

    // refill logic
    const elapsedMinutes = (now - bucket.lastRefillTime) / 60000;
    if (elapsedMinutes >= 1) {
      const refillTimes = Math.floor(elapsedMinutes);
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refillTimes * this.refillsPerMin);
      bucket.lastRefillTime = now - ((elapsedMinutes % 1) * 60000);
    }

    if (bucket.tokens >= consumeTokens) {
      bucket.tokens -= consumeTokens;
      return { success: true };
    } else {
      const difference = consumeTokens - bucket.tokens;
      const retryIn = Math.ceil(difference / this.refillsPerMin) * 60000 - ((now - bucket.lastRefillTime) % 60000);
      return {
        success: false,
        missingTokens: difference,
        retryIn,
        retryAt: now + retryIn,
      };
    }
  }

  public addToBucket(key: string, amount: number): void {
    const bucket = this.keyMap.get(key);
    if (bucket) bucket.tokens += amount;
    else this.keyMap.set(key, { tokens: this.capacity + amount, lastRefillTime: Date.now() });
  }

  public setBucketSize(key: string, amount: number): void {
    const bucket = this.keyMap.get(key);
    if (bucket) bucket.tokens = amount;
    else this.keyMap.set(key, { tokens: amount, lastRefillTime: Date.now() });
  }

  public subtractFromBucket(key: string, amount: number): void {
    const bucket = this.keyMap.get(key);
    if (bucket) bucket.tokens -= amount;
    else this.keyMap.set(key, { tokens: this.capacity - amount, lastRefillTime: Date.now() });
  }

  public removeFull(): void {
    const now = Date.now();
    for (const [key, bucket] of this.keyMap.entries()) {
      const elapsedMinutes = (now - bucket.lastRefillTime) / 60000;
      if (elapsedMinutes >= 1) {
        const refillTimes = Math.floor(elapsedMinutes);
        bucket.tokens = Math.min(this.capacity, bucket.tokens + refillTimes * this.refillsPerMin);
        bucket.lastRefillTime = now - ((elapsedMinutes % 1) * 60000);
      }

      if (bucket.tokens >= this.capacity) {
        this.keyMap.delete(key);
      }
    }
  }
}
