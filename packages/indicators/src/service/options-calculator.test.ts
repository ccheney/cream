/**
 * Tests for OptionsCalculatorAdapter
 */

import { describe, expect, test } from "bun:test";
import type { OptionPosition, OptionsChain, OptionsContract } from "../calculators/options";
import type { OHLCVBar } from "../types";
import { createOptionsCalculator, OptionsCalculatorAdapter } from "./options-calculator";

// ============================================================
// Test Fixtures
// ============================================================

function generateBars(count: number, startPrice = 100, volatility = 0.02): OHLCVBar[] {
  const bars: OHLCVBar[] = [];
  let price = startPrice;
  const baseTime = Date.now() - count * 86400000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatility;
    const open = price;
    const high = price * (1 + Math.abs(change) + Math.random() * 0.005);
    const low = price * (1 - Math.abs(change) - Math.random() * 0.005);
    price = price * (1 + change);
    const close = price;
    const volume = Math.floor(1000000 + Math.random() * 500000);

    bars.push({
      timestamp: baseTime + i * 86400000,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  return bars;
}

// Helper to generate future expiration dates
function getFutureExpiration(daysOut: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOut);
  return date.toISOString().split("T")[0]!;
}

function generateOptionsChain(
  underlyingSymbol: string,
  underlyingPrice: number,
  expiration: string,
  atmIV = 0.25
): OptionsChain {
  const calls: OptionsContract[] = [];
  const puts: OptionsContract[] = [];

  // Generate strikes from 80% to 120% of underlying price
  const strikes = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15].map((m) =>
    Math.round(underlyingPrice * m)
  );

  for (const strike of strikes) {
    const moneyness = strike / underlyingPrice;

    // Delta approximation (simplified)
    const callDelta = Math.max(0.05, Math.min(0.95, 1 - (moneyness - 0.5)));
    const putDelta = callDelta - 1;

    // IV smile: higher for OTM options
    const skewAdjustment = Math.abs(moneyness - 1) * 0.1;
    const callIV = atmIV + skewAdjustment * 0.5; // Less skew on calls
    const putIV = atmIV + skewAdjustment; // More skew on puts (typical equity skew)

    calls.push({
      symbol: `${underlyingSymbol}${expiration.replace(/-/g, "")}C${strike}`,
      underlyingSymbol,
      strike,
      expiration,
      optionType: "call",
      impliedVolatility: callIV,
      delta: callDelta,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.15,
      openInterest: Math.floor(1000 + Math.random() * 5000),
      volume: Math.floor(100 + Math.random() * 1000),
    });

    puts.push({
      symbol: `${underlyingSymbol}${expiration.replace(/-/g, "")}P${strike}`,
      underlyingSymbol,
      strike,
      expiration,
      optionType: "put",
      impliedVolatility: putIV,
      delta: putDelta,
      gamma: 0.02,
      theta: -0.04,
      vega: 0.14,
      openInterest: Math.floor(800 + Math.random() * 4000),
      volume: Math.floor(80 + Math.random() * 800),
    });
  }

  return {
    underlyingSymbol,
    underlyingPrice,
    expiration,
    calls,
    puts,
  };
}

function generateOptionPosition(
  underlyingSymbol: string,
  strike: number,
  optionType: "call" | "put",
  quantity: number,
  underlyingPrice = 100
): OptionPosition {
  const moneyness = strike / underlyingPrice;
  const baseDelta = optionType === "call" ? 0.5 : -0.5;
  const deltaAdjust = (1 - moneyness) * 0.5;

  return {
    symbol: `${underlyingSymbol}20240315${optionType.charAt(0).toUpperCase()}${strike}`,
    underlyingSymbol,
    optionType,
    strike,
    expiration: "2024-03-15",
    quantity,
    delta: baseDelta + deltaAdjust,
    gamma: 0.02,
    theta: -0.05,
    vega: 0.15,
    impliedVolatility: 0.25,
    currentPrice: 3.5,
    underlyingPrice,
  };
}

// ============================================================
// Factory Tests
// ============================================================

describe("createOptionsCalculator", () => {
  test("returns an OptionsCalculator instance", () => {
    const calculator = createOptionsCalculator();
    expect(calculator).toBeInstanceOf(OptionsCalculatorAdapter);
    expect(typeof calculator.calculate).toBe("function");
  });
});

// ============================================================
// Basic Calculation Tests
// ============================================================

describe("OptionsCalculatorAdapter", () => {
  describe("calculate", () => {
    test("returns empty indicators for empty chains", () => {
      const adapter = new OptionsCalculatorAdapter();
      const bars = generateBars(50);
      const result = adapter.calculate([], [], bars);

      expect(result.atm_iv).toBeNull();
      expect(result.iv_skew_25d).toBeNull();
      expect(result.put_call_ratio_volume).toBeNull();
      expect(result.vrp).toBeNull();
      expect(result.net_delta).toBeNull();
    });

    test("calculates all indicators with valid chains", () => {
      const adapter = new OptionsCalculatorAdapter();
      const chain1 = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.25);
      const chain2 = generateOptionsChain("AAPL", 175, getFutureExpiration(60), 0.27);
      const bars = generateBars(50, 175);

      const result = adapter.calculate([chain1, chain2], [], bars);

      // ATM IV
      expect(result.atm_iv).toBeTypeOf("number");
      expect(result.atm_iv).toBeGreaterThan(0);

      // IV Skew
      expect(result.iv_skew_25d).toBeTypeOf("number");
      expect(result.iv_put_25d).toBeTypeOf("number");
      expect(result.iv_call_25d).toBeTypeOf("number");

      // Put/Call Ratio
      expect(result.put_call_ratio_volume).toBeTypeOf("number");
      expect(result.put_call_ratio_oi).toBeTypeOf("number");

      // Term Structure
      expect(result.term_structure_slope).toBeTypeOf("number");
      expect(result.front_month_iv).toBeTypeOf("number");
      expect(result.back_month_iv).toBeTypeOf("number");

      // VRP
      expect(result.vrp).toBeTypeOf("number");
      expect(result.realized_vol_20d).toBeTypeOf("number");
    });

    test("calculates Greeks when positions provided", () => {
      const adapter = new OptionsCalculatorAdapter();
      const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
      const bars = generateBars(50, 175);

      const positions: OptionPosition[] = [
        generateOptionPosition("AAPL", 175, "call", 10, 175),
        generateOptionPosition("AAPL", 170, "put", -5, 175),
      ];

      const result = adapter.calculate([chain], positions, bars);

      expect(result.net_delta).toBeTypeOf("number");
      expect(result.net_gamma).toBeTypeOf("number");
      expect(result.net_theta).toBeTypeOf("number");
      expect(result.net_vega).toBeTypeOf("number");
    });

    test("returns null Greeks when no positions", () => {
      const adapter = new OptionsCalculatorAdapter();
      const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
      const bars = generateBars(50, 175);

      const result = adapter.calculate([chain], [], bars);

      expect(result.net_delta).toBeNull();
      expect(result.net_gamma).toBeNull();
      expect(result.net_theta).toBeNull();
      expect(result.net_vega).toBeNull();
    });
  });
});

// ============================================================
// ATM IV Tests
// ============================================================

describe("ATM IV Calculation", () => {
  test("extracts ATM IV from front-month chain", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.3);
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    expect(result.atm_iv).not.toBeNull();
    expect(result.atm_iv!).toBeGreaterThan(0.2);
    expect(result.atm_iv!).toBeLessThan(0.5);
  });

  test("uses closest expiration for ATM IV", () => {
    const adapter = new OptionsCalculatorAdapter();
    const nearChain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.35);
    const farChain = generateOptionsChain("AAPL", 175, getFutureExpiration(120), 0.28);
    const bars = generateBars(50);

    // Pass far chain first to test sorting
    const result = adapter.calculate([farChain, nearChain], [], bars);

    // Should use near chain's IV (higher)
    expect(result.atm_iv).not.toBeNull();
    expect(result.atm_iv!).toBeGreaterThan(0.3);
  });
});

// ============================================================
// IV Skew Tests
// ============================================================

describe("IV Skew Calculation", () => {
  test("calculates positive skew for equity options", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.25);
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    // Typical equity skew: puts have higher IV
    expect(result.iv_skew_25d).not.toBeNull();
    expect(result.iv_skew_25d!).toBeGreaterThan(0);
  });

  test("reports put and call IVs separately", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.25);
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    expect(result.iv_put_25d).not.toBeNull();
    expect(result.iv_call_25d).not.toBeNull();
    expect(result.iv_put_25d!).toBeGreaterThan(result.iv_call_25d!);
  });
});

// ============================================================
// Put/Call Ratio Tests
// ============================================================

describe("Put/Call Ratio Calculation", () => {
  test("calculates volume-based P/C ratio", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    expect(result.put_call_ratio_volume).not.toBeNull();
    expect(result.put_call_ratio_volume!).toBeGreaterThan(0);
  });

  test("calculates OI-based P/C ratio", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    expect(result.put_call_ratio_oi).not.toBeNull();
    expect(result.put_call_ratio_oi!).toBeGreaterThan(0);
  });
});

// ============================================================
// Term Structure Tests
// ============================================================

describe("Term Structure Calculation", () => {
  test("calculates slope with multiple expirations", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain1 = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.25);
    const chain2 = generateOptionsChain("AAPL", 175, getFutureExpiration(60), 0.27);
    const bars = generateBars(50);

    const result = adapter.calculate([chain1, chain2], [], bars);

    expect(result.term_structure_slope).not.toBeNull();
    expect(result.front_month_iv).not.toBeNull();
    expect(result.back_month_iv).not.toBeNull();
  });

  test("returns null slope with single expiration", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const result = adapter.calculate([chain], [], bars);

    // Need at least 2 expirations for slope
    expect(result.term_structure_slope).toBeNull();
  });

  test("contango produces positive slope", () => {
    const adapter = new OptionsCalculatorAdapter();
    // Contango: back month IV > front month IV
    const chain1 = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.22);
    const chain2 = generateOptionsChain("AAPL", 175, getFutureExpiration(60), 0.28);
    const bars = generateBars(50);

    const result = adapter.calculate([chain1, chain2], [], bars);

    expect(result.term_structure_slope).not.toBeNull();
    expect(result.term_structure_slope!).toBeGreaterThan(0);
  });
});

// ============================================================
// VRP Tests
// ============================================================

describe("VRP Calculation", () => {
  test("calculates VRP from IV and realized vol", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.3);
    const bars = generateBars(50, 175, 0.01); // Low realized vol

    const result = adapter.calculate([chain], [], bars);

    expect(result.vrp).not.toBeNull();
    expect(result.realized_vol_20d).not.toBeNull();
  });

  test("positive VRP when IV > realized vol", () => {
    const adapter = new OptionsCalculatorAdapter();
    // High IV
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30), 0.4);
    // Low realized vol (small price moves)
    const bars = generateBars(50, 175, 0.005);

    const result = adapter.calculate([chain], [], bars);

    expect(result.vrp).not.toBeNull();
    expect(result.vrp!).toBeGreaterThan(0);
  });

  test("handles insufficient bar data", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(10); // Not enough for 20-day realized vol

    const result = adapter.calculate([chain], [], bars);

    expect(result.vrp).toBeNull();
  });
});

// ============================================================
// Greeks Aggregation Tests
// ============================================================

describe("Greeks Aggregation", () => {
  test("aggregates delta across positions", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const positions: OptionPosition[] = [
      generateOptionPosition("AAPL", 175, "call", 10, 175), // Long calls
      generateOptionPosition("AAPL", 175, "put", -10, 175), // Short puts
    ];

    const result = adapter.calculate([chain], positions, bars);

    expect(result.net_delta).not.toBeNull();
    // Both positions should have positive delta contribution
    expect(result.net_delta!).toBeGreaterThan(0);
  });

  test("calculates theta decay", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const positions: OptionPosition[] = [generateOptionPosition("AAPL", 175, "call", 10, 175)];

    const result = adapter.calculate([chain], positions, bars);

    expect(result.net_theta).not.toBeNull();
    // Long options have negative theta
    expect(result.net_theta!).toBeLessThan(0);
  });

  test("handles mixed long/short positions", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);

    const positions: OptionPosition[] = [
      generateOptionPosition("AAPL", 175, "call", 10, 175), // Long
      generateOptionPosition("AAPL", 180, "call", -5, 175), // Short
    ];

    const result = adapter.calculate([chain], positions, bars);

    expect(result.net_delta).not.toBeNull();
    expect(result.net_gamma).not.toBeNull();
    expect(result.net_theta).not.toBeNull();
    expect(result.net_vega).not.toBeNull();
  });
});

// ============================================================
// Integration Tests
// ============================================================

describe("Integration", () => {
  test("output structure matches OptionsIndicators type", () => {
    const adapter = new OptionsCalculatorAdapter();
    const chain = generateOptionsChain("AAPL", 175, getFutureExpiration(30));
    const bars = generateBars(50);
    const positions = [generateOptionPosition("AAPL", 175, "call", 10, 175)];

    const result = adapter.calculate([chain], positions, bars);

    const expectedFields = [
      "atm_iv",
      "iv_skew_25d",
      "iv_put_25d",
      "iv_call_25d",
      "put_call_ratio_volume",
      "put_call_ratio_oi",
      "term_structure_slope",
      "front_month_iv",
      "back_month_iv",
      "vrp",
      "realized_vol_20d",
      "net_delta",
      "net_gamma",
      "net_theta",
      "net_vega",
    ];

    for (const field of expectedFields) {
      expect(field in result).toBe(true);
    }
  });

  test("handles real-world multi-expiration scenario", () => {
    const adapter = new OptionsCalculatorAdapter();

    // Multiple expirations with typical term structure
    const chains = [
      generateOptionsChain("SPY", 450, getFutureExpiration(14), 0.14), // 2 weeks
      generateOptionsChain("SPY", 450, getFutureExpiration(30), 0.16), // 1 month
      generateOptionsChain("SPY", 450, getFutureExpiration(60), 0.17), // 2 months
      generateOptionsChain("SPY", 450, getFutureExpiration(120), 0.18), // 4 months
    ];

    const bars = generateBars(100, 450, 0.008); // Low vol SPY-like

    const positions: OptionPosition[] = [
      generateOptionPosition("SPY", 450, "call", 5, 450),
      generateOptionPosition("SPY", 445, "put", -3, 450),
    ];

    const result = adapter.calculate(chains, positions, bars);

    // All main indicators should be present
    expect(result.atm_iv).not.toBeNull();
    expect(result.iv_skew_25d).not.toBeNull();
    expect(result.put_call_ratio_volume).not.toBeNull();
    expect(result.term_structure_slope).not.toBeNull();
    expect(result.vrp).not.toBeNull();
    expect(result.net_delta).not.toBeNull();

    // Contango should show positive slope
    expect(result.term_structure_slope!).toBeGreaterThan(0);

    // VRP likely positive for SPY
    expect(result.vrp!).toBeGreaterThan(-0.1);
  });
});
