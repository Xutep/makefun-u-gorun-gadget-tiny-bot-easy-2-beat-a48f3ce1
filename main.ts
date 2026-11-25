// ScalpBot: a fast EMA-crossover scalper for hourly Solana bars, long only.
//
// Idea: hourly crypto bars chop sideways most of the time, so a slow trend
// follower rides every dip down. This bot instead trades only the quick
// bursts: it buys when a symbol's fast EMA(3) crosses above its slow EMA(9)
// while SOL itself is in the same fast-over-slow state (a market filter that
// keeps it in cash through broad sell-offs), then takes a small, quick
// profit (+1%) or cuts the trade (-3%) instead of waiting for the trend to
// turn. Positions leave on the cross back down too, so no trade is left
// riding a reversal.
//
//   - Indicators, per symbol over its own closes: EMA(3) and EMA(9), each
//     starting as the mean of its first span of closes, then moving
//     2 / (span + 1) of the way to each new close. They read every batch, a
//     warm-up's included; while warming up it sends no order (the replay
//     would reject every one), and from the first batch after it the rules
//     below run on indicators already seeded.
//   - Entry, on a bar's close (filled at the next open): EMA(3) crosses
//     above EMA(9) (above it now, at or under it on the symbol's bar
//     before), on a symbol it does not hold, while SOL's EMA(3) is above
//     its EMA(9) on the same close. A bar with zero volume signals nothing.
//   - Exit, the whole position: EMA(3) crosses back under EMA(9), or the
//     position is worth at least 1% over its cost at the close (take the
//     quick profit), or at least 3% under it (cut the loss). A sell signal
//     holds while its reason still holds, so a sell the market refuses is
//     sent again on the symbol's next bar.
//   - Stake: equity over n slots, n = min(the universe,
//     caps.max_open_positions); each buy the smallest of equity / n,
//     caps.max_weight_bps of equity and the cash this reply has not spent
//     yet; below fees.min_notional_quote_units it buys nothing.
//   - A reply carries the sells first, then the buys in universe order, at
//     most caps.max_orders_per_bar in all. Each order caps its slippage at
//     MAX_SLIPPAGE_BPS = 100, 1% past the close it was decided on, so a
//     sell into a liquidity gap is refused (and sent again) rather than
//     filled for almost nothing.
//   - The EMAs run in float64 on + - * / alone, each correctly rounded
//     (IEEE 754), so the same bars give the same orders, run after run.
//     Nothing here reads the clock, the environment or any randomness.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const FAST_BARS = 3;
const SLOW_BARS = 9;
/** Take profit: worth 101/100 of its cost. */
const TAKE = [101n, 100n] as const;
/** Stop loss: worth 97/100 of its cost. */
const STOP = [97n, 100n] as const;
const MAX_SLIPPAGE_BPS = 100;
/** The bellwether whose fast-over-slow state gates new entries. */
const MARKET_SYMBOL = 'SOL';

/** One EMA: the closes it has seen until it starts, then its value. */
interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

interface Series {
  fast: Ema;
  slow: Ema;
  /** fast - slow after the symbol's bar before this one, once both are set. */
  gapBefore: number | null;
  /** The same after this bar. */
  gap: number | null;
}

const series = new Map<string, Series>();

function step(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
}

function push(bar: Bar): Series {
  let s = series.get(bar.symbol);
  if (s === undefined) {
    s = {
      fast: { span: FAST_BARS, warm: [], value: null },
      slow: { span: SLOW_BARS, warm: [], value: null },
      gapBefore: null,
      gap: null,
    };
    series.set(bar.symbol, s);
  }
  const c = Number(bar.c);
  step(s.fast, c);
  step(s.slow, c);
  s.gapBefore = s.gap;
  s.gap = s.fast.value !== null && s.slow.value !== null ? s.fast.value - s.slow.value : null;
  return s;
}

/** Whether a held position exits on this close: the cross back down, the quick profit, or the stop. */
function exits(state: BarsState, symbol: string, held: { qty: bigint; cost: bigint }, crossedDown: boolean): boolean {
  if (crossedDown) return true;
  const value = state.value(symbol, held.qty);
  return value * TAKE[1] >= held.cost * TAKE[0] || value * STOP[1] <= held.cost * STOP[0];
}

await runBars({
  onBatch(state, batch) {
    const crossUp = new Set<string>();
    const crossDown = new Set<string>();
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      if (bar.v === '0') continue;
      const s = push(bar);
      fresh.add(bar.symbol);
      if (s.gap === null || s.gapBefore === null) continue;
      if (s.gap > 0 && s.gapBefore <= 0) crossUp.add(bar.symbol);
      if (s.gap < 0 && s.gapBefore >= 0) crossDown.add(bar.symbol);
    }
    if (state.warmingUp) return [];
    // Market filter: SOL's fast EMA above its slow EMA on this close.
    const market = series.get(MARKET_SYMBOL);
    const marketOk = market !== undefined && market.gap !== null && market.gap > 0;
    const { caps, fees } = state.hello;
    const sells: SellInput[] = [];
    const entries: string[] = [];
    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const held = state.positions.get(symbol);
      if (held !== undefined) {
        if (exits(state, symbol, held, crossDown.has(symbol))) {
          sells.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
      } else if (marketOk && crossUp.has(symbol)) {
        entries.push(symbol);
      }
    }

    const orders: (SellInput | BuyInput)[] = sells.slice(0, caps.max_orders_per_bar);
    const slots = Math.min(state.hello.symbols.length, caps.max_open_positions);
    const stake = state.equity / BigInt(slots);
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let room = slots - state.positions.size;
    let cash = state.cash;
    for (const symbol of entries) {
      if (room <= 0 || orders.length >= caps.max_orders_per_bar) break;
      let slice = stake < byWeight ? stake : byWeight;
      if (cash < slice) slice = cash;
      if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) break;
      orders.push({ side: 'buy', symbol, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
      cash -= slice;
      room--;
    }
    return orders;
  },
});
