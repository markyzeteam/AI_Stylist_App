/**
 * Rate Limiter for Gemini API calls
 * Tracks requests per minute (RPM) and requests per day (RPD)
 * Automatically pauses when limits are reached
 */

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  enableRateLimiting: boolean;
}

interface RateLimitState {
  requestsThisMinute: number;
  requestsToday: number;
  minuteResetTime: number; // Unix timestamp
  dayResetTime: number; // Unix timestamp
  lastRequestTime: number; // Unix timestamp
}

// In-memory storage for rate limit states per shop
const shopRateLimits = new Map<string, RateLimitState>();

/**
 * Get the current rate limit state for a shop
 */
function getRateLimitState(shop: string): RateLimitState {
  const now = Date.now();
  const existing = shopRateLimits.get(shop);

  if (!existing) {
    // Initialize new state
    const state: RateLimitState = {
      requestsThisMinute: 0,
      requestsToday: 0,
      minuteResetTime: now + 60 * 1000, // 1 minute from now
      dayResetTime: getNextDayResetTime(),
      lastRequestTime: 0,
    };
    shopRateLimits.set(shop, state);
    return state;
  }

  // Check if we need to reset minute counter
  if (now >= existing.minuteResetTime) {
    existing.requestsThisMinute = 0;
    existing.minuteResetTime = now + 60 * 1000;
  }

  // Check if we need to reset daily counter
  if (now >= existing.dayResetTime) {
    existing.requestsToday = 0;
    existing.dayResetTime = getNextDayResetTime();
  }

  return existing;
}

/**
 * Get the next day reset time (midnight Pacific Time)
 * Gemini resets quotas at midnight PT
 */
function getNextDayResetTime(): number {
  const now = new Date();

  // Convert to Pacific Time
  const ptOffset = -7 * 60; // PDT is UTC-7 (adjust for PST -8 if needed)
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const ptTime = new Date(utcTime + ptOffset * 60000);

  // Set to next midnight PT
  const nextMidnight = new Date(ptTime);
  nextMidnight.setHours(24, 0, 0, 0);

  return nextMidnight.getTime();
}

/**
 * Check if we can make a request without exceeding rate limits
 */
export function canMakeRequest(shop: string, config: RateLimitConfig): {
  allowed: boolean;
  reason?: string;
  waitTimeMs?: number;
  remainingMinute?: number;
  remainingDay?: number;
} {
  // If rate limiting is disabled, always allow
  if (!config.enableRateLimiting) {
    return { allowed: true };
  }

  const state = getRateLimitState(shop);
  const now = Date.now();

  // Check minute limit
  if (state.requestsThisMinute >= config.requestsPerMinute) {
    const waitTime = state.minuteResetTime - now;
    return {
      allowed: false,
      reason: `Rate limit reached: ${state.requestsThisMinute}/${config.requestsPerMinute} requests per minute`,
      waitTimeMs: waitTime,
      remainingMinute: 0,
      remainingDay: config.requestsPerDay - state.requestsToday,
    };
  }

  // Check daily limit
  if (state.requestsToday >= config.requestsPerDay) {
    const waitTime = state.dayResetTime - now;
    return {
      allowed: false,
      reason: `Daily limit reached: ${state.requestsToday}/${config.requestsPerDay} requests today`,
      waitTimeMs: waitTime,
      remainingMinute: config.requestsPerMinute - state.requestsThisMinute,
      remainingDay: 0,
    };
  }

  return {
    allowed: true,
    remainingMinute: config.requestsPerMinute - state.requestsThisMinute,
    remainingDay: config.requestsPerDay - state.requestsToday,
  };
}

/**
 * Record that a request was made
 */
export function recordRequest(shop: string): void {
  const state = getRateLimitState(shop);
  state.requestsThisMinute++;
  state.requestsToday++;
  state.lastRequestTime = Date.now();
}

/**
 * Wait if needed to respect rate limits
 * Returns immediately if request is allowed
 * Throws error if daily limit is reached
 */
export async function waitIfNeeded(
  shop: string,
  config: RateLimitConfig,
  onWait?: (waitTimeMs: number, reason: string) => void
): Promise<void> {
  const check = canMakeRequest(shop, config);

  if (check.allowed) {
    return; // No wait needed
  }

  // If daily limit reached, throw error
  if (check.remainingDay === 0) {
    throw new Error(
      `Daily API limit reached (${config.requestsPerDay} requests). Will reset at midnight PT.`
    );
  }

  // Wait for minute limit to reset
  if (check.waitTimeMs && check.waitTimeMs > 0) {
    if (onWait) {
      onWait(check.waitTimeMs, check.reason || "Rate limit reached");
    }
    await new Promise((resolve) => setTimeout(resolve, check.waitTimeMs));
  }
}

/**
 * Get remaining quota information
 */
export function getRemainingQuota(shop: string, config: RateLimitConfig): {
  remainingMinute: number;
  remainingDay: number;
  requestsThisMinute: number;
  requestsToday: number;
  minuteResetIn: number; // seconds
  dayResetIn: number; // seconds
} {
  if (!config.enableRateLimiting) {
    return {
      remainingMinute: Infinity,
      remainingDay: Infinity,
      requestsThisMinute: 0,
      requestsToday: 0,
      minuteResetIn: 0,
      dayResetIn: 0,
    };
  }

  const state = getRateLimitState(shop);
  const now = Date.now();

  return {
    remainingMinute: Math.max(0, config.requestsPerMinute - state.requestsThisMinute),
    remainingDay: Math.max(0, config.requestsPerDay - state.requestsToday),
    requestsThisMinute: state.requestsThisMinute,
    requestsToday: state.requestsToday,
    minuteResetIn: Math.max(0, Math.floor((state.minuteResetTime - now) / 1000)),
    dayResetIn: Math.max(0, Math.floor((state.dayResetTime - now) / 1000)),
  };
}

/**
 * Reset rate limits for a shop (useful for testing or manual resets)
 */
export function resetRateLimits(shop: string): void {
  shopRateLimits.delete(shop);
}

/**
 * Get formatted time string from milliseconds
 */
export function formatWaitTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Predefined API tier configurations
 */
export const API_TIERS = {
  FREE: {
    name: "Free Tier",
    requestsPerMinute: 15,
    requestsPerDay: 1500,
    enableRateLimiting: true,
  },
  PAID: {
    name: "Paid Tier",
    requestsPerMinute: 2000,
    requestsPerDay: 50000,
    enableRateLimiting: true,
  },
  ENTERPRISE: {
    name: "Enterprise (Unlimited)",
    requestsPerMinute: 10000,
    requestsPerDay: 1000000,
    enableRateLimiting: false,
  },
} as const;
