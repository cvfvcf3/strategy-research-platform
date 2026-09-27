import type { Candle } from "../data/types";
import { rollingBeta, rollingCorrelation } from "../indicators/stats";
import { zscore as zscoreOf } from "../indicators/zscore";

export type PairsParams = {
  window: number; // rolling window for beta/correlation/z-score
  entryZ: number; // |z| above this opens a position
  exitZ: number; // |z| below this closes it (mean-reverted)
  stopZ: number; // |z| above this force-closes (divergence, not convergence)
  minCorrelation: number; // required to open a new position
};

export const DEFAULT_PAIRS_PARAMS: PairsParams = {
  window: 30,
  entryZ: 2,
  exitZ: 0.5,
  stopZ: 3,
  minCorrelation: 0.7,
};

export type PairsState = {
  spread: (number | null)[]; // log(A) - beta*log(B)
  zscore: (number | null)[];
  correlation: (number | null)[];
  beta: (number | null)[];
};

export type PairsDirection = "long_a_short_b" | "short_a_long_b";

export type PairsAction =
  | { type: "enter"; direction: PairsDirection; reason: string }
  | { type: "exit"; reason: string }
  | { type: "hold" };

export const pairsTrading = {
  key: "pairs_trading" as const,
  name: "Pairs Trading",
  description:
    "Market-neutral mean reversion on the price spread between two correlated assets: " +
    "spread = log(priceA) - beta*log(priceB), beta from a rolling OLS regression. Enters when the " +
    "z-score of that spread exceeds 2 (a bet the spread reverts), exits at |z|<0.5 (reverted) or " +
    "force-exits at |z|>3 (the relationship broke down, this is a stop-loss on divergence, not a " +
    "profit target). Requires rolling correlation > 0.7 to open a new position.",
  defaultParams: DEFAULT_PAIRS_PARAMS,

  prepare(candlesA: Candle[], candlesB: Candle[], params: PairsParams): PairsState {
    const n = Math.min(candlesA.length, candlesB.length);
    const logA = candlesA.slice(0, n).map((c) => Math.log(c.close));
    const logB = candlesB.slice(0, n).map((c) => Math.log(c.close));
    const beta = rollingBeta(logA, logB, params.window);
    const spread: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const b = beta[i];
      spread[i] = b === null ? null : logA[i]! - b * logB[i]!;
    }
    const spreadValid = spread.map((v) => v ?? 0);
    const z = zscoreOf(spreadValid, params.window).map((v, i) => (spread[i] === null ? null : v));
    const correlation = rollingCorrelation(logA, logB, params.window);
    return { spread, zscore: z, correlation, beta };
  },

  minWarmupBars(params: PairsParams): number {
    return params.window * 2; // beta needs `window`, then z-score needs another `window` of spread values
  },

  decide(
    state: PairsState,
    i: number,
    params: PairsParams,
    currentDirection: PairsDirection | null,
  ): PairsAction {
    const z = state.zscore[i];
    const corr = state.correlation[i];
    if (z === null) return { type: "hold" };

    if (currentDirection === null) {
      if (corr === null || corr < params.minCorrelation) return { type: "hold" };
      if (z > params.entryZ) {
        return { type: "enter", direction: "short_a_long_b", reason: `z-score ${z.toFixed(2)} > ${params.entryZ} (spread rich): short A / long B` };
      }
      if (z < -params.entryZ) {
        return { type: "enter", direction: "long_a_short_b", reason: `z-score ${z.toFixed(2)} < -${params.entryZ} (spread cheap): long A / short B` };
      }
      return { type: "hold" };
    }

    if (Math.abs(z) > params.stopZ) {
      return { type: "exit", reason: `|z-score| ${Math.abs(z).toFixed(2)} > stop ${params.stopZ} — relationship diverging, not converging` };
    }
    if (Math.abs(z) < params.exitZ) {
      return { type: "exit", reason: `|z-score| ${Math.abs(z).toFixed(2)} < ${params.exitZ} — spread reverted` };
    }
    return { type: "hold" };
  },
};
