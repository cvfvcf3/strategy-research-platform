const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "ADA/USDT", "DOGE/USDT", "AVAX/USDT", "MATIC/USDT", "LINK/USDT"];

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    spot: SYMBOLS.map((s) => ({ symbol: s, market: "spot" })),
    perp: SYMBOLS.map((s) => ({ symbol: s, market: "perp" })),
    timeframes: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"],
  });
}
