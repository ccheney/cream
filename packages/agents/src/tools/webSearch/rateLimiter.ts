/**
 * Web Search Rate Limiter
 *
 * Rate limiting and alerting for web search API calls.
 */

import { log } from "../../logger.js";

export const RATE_LIMITS = {
  tavily: {
    perMinute: 60,
    perDay: 1000,
  },
} as const;

interface RateLimitState {
  minute: number;
  day: number;
  minuteReset: number;
  dayReset: number;
}

class RateLimiter {
  private counts = new Map<string, RateLimitState>();

  canProceed(provider: keyof typeof RATE_LIMITS): boolean {
    const limits = RATE_LIMITS[provider];
    if (!limits) {
      return true;
    }

    const now = Date.now();
    const state = this.getState(provider, now);

    return state.minute < limits.perMinute && state.day < limits.perDay;
  }

  record(provider: keyof typeof RATE_LIMITS): void {
    const now = Date.now();
    const state = this.getState(provider, now);
    state.minute++;
    state.day++;
    this.counts.set(provider, state);
  }

  getRemainingQuota(provider: keyof typeof RATE_LIMITS): { minute: number; day: number } {
    const limits = RATE_LIMITS[provider];
    if (!limits) {
      return { minute: Infinity, day: Infinity };
    }

    const state = this.getState(provider, Date.now());
    return {
      minute: Math.max(0, limits.perMinute - state.minute),
      day: Math.max(0, limits.perDay - state.day),
    };
  }

  reset(): void {
    this.counts.clear();
  }

  private getState(provider: string, now: number): RateLimitState {
    let state = this.counts.get(provider);

    if (!state) {
      state = {
        minute: 0,
        day: 0,
        minuteReset: now + 60000,
        dayReset: now + 86400000,
      };
      this.counts.set(provider, state);
      return state;
    }

    if (now >= state.minuteReset) {
      state.minute = 0;
      state.minuteReset = now + 60000;
    }

    if (now >= state.dayReset) {
      state.day = 0;
      state.dayReset = now + 86400000;
    }

    return state;
  }
}

export const rateLimiter = new RateLimiter();

const ALERT_THRESHOLDS = {
  tavily: {
    minuteWarning: 0.8,
    minuteCritical: 0.95,
    dayWarning: 0.7,
    dayCritical: 0.9,
  },
} as const;

export type AlertSeverity = "warning" | "critical";

export type RateLimitAlertType = "minute_limit" | "day_limit";

export interface RateLimitAlert {
  timestamp: string;
  provider: string;
  severity: AlertSeverity;
  type: RateLimitAlertType;
  current: number;
  limit: number;
  percentUsed: number;
  message: string;
}

class RateLimitAlerter {
  private lastAlerts = new Map<string, number>();
  private readonly alertCooldownMs = 5 * 60 * 1000;

  check(provider: keyof typeof RATE_LIMITS): RateLimitAlert[] {
    const thresholds = ALERT_THRESHOLDS[provider];
    const limits = RATE_LIMITS[provider];
    if (!thresholds || !limits) {
      return [];
    }

    const remaining = rateLimiter.getRemainingQuota(provider);
    const alerts: RateLimitAlert[] = [];

    const minuteUsed = 1 - remaining.minute / limits.perMinute;
    const dayUsed = 1 - remaining.day / limits.perDay;

    if (minuteUsed >= thresholds.minuteCritical) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "critical", minuteUsed, limits.perMinute)
      );
    } else if (minuteUsed >= thresholds.minuteWarning) {
      alerts.push(
        this.createAlert(provider, "minute_limit", "warning", minuteUsed, limits.perMinute)
      );
    }

    if (dayUsed >= thresholds.dayCritical) {
      alerts.push(this.createAlert(provider, "day_limit", "critical", dayUsed, limits.perDay));
    } else if (dayUsed >= thresholds.dayWarning) {
      alerts.push(this.createAlert(provider, "day_limit", "warning", dayUsed, limits.perDay));
    }

    return this.filterCooldown(alerts);
  }

  reset(): void {
    this.lastAlerts.clear();
  }

  private createAlert(
    provider: string,
    type: RateLimitAlertType,
    severity: AlertSeverity,
    percentUsed: number,
    limit: number
  ): RateLimitAlert {
    const current = Math.round(percentUsed * limit);
    const limitType = type === "minute_limit" ? "minute" : "daily";
    return {
      timestamp: new Date().toISOString(),
      provider,
      severity,
      type,
      current,
      limit,
      percentUsed,
      message: `${provider} ${limitType} rate limit ${severity}: ${Math.round(percentUsed * 100)}% used (${current}/${limit})`,
    };
  }

  private filterCooldown(alerts: RateLimitAlert[]): RateLimitAlert[] {
    const now = Date.now();
    return alerts.filter((alert) => {
      const key = `${alert.provider}:${alert.type}:${alert.severity}`;
      const lastAlertTime = this.lastAlerts.get(key);

      if (lastAlertTime && now - lastAlertTime < this.alertCooldownMs) {
        return false;
      }

      this.lastAlerts.set(key, now);
      return true;
    });
  }
}

export const rateLimitAlerter = new RateLimitAlerter();

export function checkAndLogRateLimitAlerts(provider: keyof typeof RATE_LIMITS = "tavily"): void {
  const alerts = rateLimitAlerter.check(provider);
  for (const alert of alerts) {
    if (alert.severity === "critical") {
      log.error({ alert }, "Rate limit alert");
    } else {
      log.warn({ alert }, "Rate limit alert");
    }
  }
}
