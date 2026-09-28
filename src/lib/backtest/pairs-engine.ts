import type { Candle } from "../data/types";
import { pairsTrading, type PairsDirection, type PairsParams } from "../strategies/pairs-trading";
import { applySlippage, feeAmount } from "./execution";
import { computeMetrics, type BacktestMetrics, type EquityPoint, type Trade } from "./metrics";

export type PairsBacktestConfig = {
  params: Partial<PairsParams>;
  initialCapital: number;
  feeBps: number;
  slippageBps: number;
};

export type PairsBacktestResult = {
  equityCurve: EquityPoint[];
  trades: Trade[]; // one combined trade per round-trip (both legs netted together)
  metrics: BacktestMetrics;
  rejectionReasons: string[];
};

/**
 * Each leg gets half the allocated notional (a simple market-neutral
 * split — not leverage-optimized, but transparent and easy to audit).
 * "side" on the resulting Trade records the direction of leg A only;
 * leg B is always the mirror image by construction of pairs trading.
 */
export function runPairsBacktest(candlesA: Candle[], candlesB: Candle[], config: PairsBacktestConfig): PairsBacktestResult {
  const params: PairsParams = { ...pairsTrading.defaultParams, ...config.params };
  const n = Math.min(candlesA.length, candlesB.length);
  const state = pairsTrading.prepare(candlesA, candlesB, params);
  const warmup = pairsTrading.minWarmupBars(params);

  let equity = config.initialCapital;
  let direction: PairsDirection | null = null;
  let entryIndex = -1;
  let entryPriceA = 0;
  let entryPriceB = 0;
  let sizeA = 0;
  let sizeB = 0;
  let entryFees = 0;
  let equityAtEntry = 0;

  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  for (let i = warmup; i < n; i++) {
    const candleA = candlesA[i]!;
    const candleB = candlesB[i]!;
    const action = pairsTrading.decide(state, i, params, direction);

    if (action.type === "exit" && direction) {
      const exitA = applySlippage(candleA.close, direction === "long_a_short_b" ? "sell" : "buy", config.slippageBps);
      const exitB = applySlippage(candleB.close, direction === "long_a_short_b" ? "buy" : "sell", config.slippageBps);
      const pnlA = direction === "long_a_short_b" ? (exitA - entryPriceA) * sizeA : (entryPriceA - exitA) * sizeA;
      const pnlB = direction === "long_a_short_b" ? (entryPriceB - exitB) * sizeB : (exitB - entryPriceB) * sizeB;
      const exitFees = feeAmount(sizeA * exitA, config.feeBps) + feeAmount(sizeB * exitB, config.feeBps);
      const netPnl = pnlA + pnlB - exitFees - entryFees;
      equity += pnlA + pnlB - exitFees;

      trades.push({
        side: direction === "long_a_short_b" ? "long" : "short",
        entryIndex,
        entryTime: candlesA[entryIndex]!.closeTime,
        entryPrice: entryPriceA,
        exitIndex: i,
        exitTime: candleA.closeTime,
        exitPrice: exitA,
        size: sizeA,
        grossPnl: pnlA + pnlB,
        fees: exitFees + entryFees,
        netPnl,
        netPnlPct: equityAtEntry > 0 ? netPnl / equityAtEntry : 0,
        exitReason: action.reason,
        barsHeld: i - entryIndex,
      });
      direction = null;
    } else if (action.type === "enter" && !direction) {
      const notionalPerLeg = (equity * 0.5) / 2; // half of equity, split across the two legs
      const rawA = candleA.close;
      const rawB = candleB.close;
      entryPriceA = applySlippage(rawA, action.direction === "long_a_short_b" ? "buy" : "sell", config.slippageBps);
      entryPriceB = applySlippage(rawB, action.direction === "long_a_short_b" ? "sell" : "buy", config.slippageBps);
      sizeA = notionalPerLeg / entryPriceA;
      sizeB = notionalPerLeg / entryPriceB;
      entryFees = feeAmount(sizeA * entryPriceA, config.feeBps) + feeAmount(sizeB * entryPriceB, config.feeBps);
      equityAtEntry = equity; // account equity before entry fees
      equity -= entryFees;
      direction = action.direction;
      entryIndex = i;
    }

    const unrealized = direction
      ? direction === "long_a_short_b"
        ? (candleA.close - entryPriceA) * sizeA + (entryPriceB - candleB.close) * sizeB
        : (entryPriceA - candleA.close) * sizeA + (candleB.close - entryPriceB) * sizeB
      : 0;
    equityCurve.push({ t: candleA.closeTime, equity: equity + unrealized });
  }

  const barMs = n >= 2 ? candlesA[1]!.openTime - candlesA[0]!.openTime : 60_000;
  const metrics = computeMetrics(equityCurve, trades, n - warmup, barMs);
  const rejectionReasons: string[] = [];
  return { equityCurve, trades, metrics, rejectionReasons };
}
