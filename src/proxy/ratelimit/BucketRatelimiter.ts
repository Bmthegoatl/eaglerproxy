import { Logger } from "../../logger.js";

export default class BucketRateLimiter {
  public capacity: number;
  public refillsPerMin: number;
  public keyMap: Map<string, KeyData>;
  public static readonly GC_TOLERANCE: number = 50;
  private sweeper: NodeJS.Timeout; // <-- change from Timer to Timeout

  constructor(capacity: number, refillsPerMin: number) {
    this.capacity = capacity;
    this.refillsPerMin = refillsPerMin;
    this.keyMap = new Map();
    this.sweeper = setInterval(() => {
      this.removeFull();
    }, 5000);
  }

  public cleanUp() {
    clearInterval(this.sweeper);
  }

  public consume(key: string, consumeTokens: number = 1): RateLimitData {
    const bucket = this.keyMap.get(key);

    if (bucket) {
      const now = Date.now();

      if (now - bucket.lastRefillTime > 60000 && bucket.tokens < this.capacity) {
        const refillTimes = Math.floor((now - bucket.lastRefillTime) / 60000);
        bucket.tokens = Math.min(this.capacity, bucket.tokens + refillTimes * this.refillsPerMin);
        bucket.lastRefillTime = now - ((now - bucket.lastRefillTime) % 60000);
      } else if (now - bucket.lastRefillTime > 60000 && bucket.tokens >= this.capacity) {
        bucket.lastRefillTime = now;
      }

      if (bucket.tokens >= consumeTokens) {
        bucket.tokens -= consumeTokens;
        return { success: true };
      } else {
        const difference = consumeTokens - bucket.tokens;
        return {
          success: false,
          missingTokens: difference,
          retryIn: Math.ceil(difference / this.refillsPerMin) * 60000 - ((now - bucket.lastRefillTime) % 60000),
          retryAt: Date.now() + Math.ceil(difference / this.refillsPerMin) * 60000 - ((now - bucket.lastRefillTime) % 60000),
        };
      }
    } else {
      const newBucket: KeyData = { tokens: this.capacity - consumeTokens, lastRefillTime: Date.now() };
      this.keyMap.set(key, newBucket);
      return { success: consumeTokens <= this.capacity };
    }
  }

  public addToBucket(key: string, amount: number) {
    const bucket = this.keyMap.get(key);
    if (bucket) {
      bucket.tokens += amount;
    } else {
      this.keyMap.set(key, { tokens: this.capacity + amount, lastRefillTime: Date.now() });
    }
  }

  public setBucketSize(key: string, amount: number) {
    const bucket = this.keyMap.get(key);
    if (bucket) {
      bucket.tokens = amount;
    } else {
      this.keyMap.set(key, { tokens: amount, lastRefillTime: Date.now() });
    }
  }

  public subtractFromBucket(key: string, amount: number) {
    const bucket = this.keyMap.get(key);
    if (bucket) {
      bucket.tokens -= amount;
    } else {
      this.keyMap.set(key, { tokens: this.capacity - amount, lastRefillTime: Date.now() });
    }
  }

  public removeFull() {
    const now = Date.now();
    this.keyMap.forEach((v, k) => {
      if (now - v.lastRefillTime > 60000 && v.tokens < this.capacity) {
        const refillTimes = Math.floor((now - v.lastRefillTime) / 60000);
        v.tokens = Math.min(this.capacity, v.tokens + refillTimes * this.refillsPerMin);
        v.lastRefillTime = now - ((now - v.lastRefillTime) % 60000);
      } else if (now - v.lastRefillTime > 60000 && v.tokens >= this.capacity) {
        v.lastRefillTime = now;
      }

      if (v.tokens >= this.capacity) this.keyMap.delete(k);
    });
  }
}

type RateLimitData = {
  success: boolean;
  missingTokens?: number;
  retryIn?: number;
  retryAt?: number;
};

type KeyData = {
  tokens: number;
  lastRefillTime: number;
};
