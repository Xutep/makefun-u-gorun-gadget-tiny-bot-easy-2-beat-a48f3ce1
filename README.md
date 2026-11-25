# makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

[![make.fun · u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Xutep/makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/Xutep/makefun-u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1?utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

ScalpBot — a tiny paper-trading bot for hourly Solana prices. It buys when a symbol's fast EMA(3) crosses above its slow EMA(9) while SOL itself is in the same fast-over-slow state, then takes a quick +1% profit or cuts the trade at −3%, and exits on the cross back down. Long only, no leverage, no shorts. Built to beat buy-and-hold on make.fun's "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana" bounty.

## Run it

```sh
node main.ts
```

The bot speaks the `agent-fun/bars-replay/v1` line protocol on stdin/stdout (see the kit's `protocol.schema.json`); `vendor/makefun-bars.ts` is the kit's SDK shim, copied byte-identical. It runs on Node 22.18+ with nothing to install.

## Strategy

- Entry: EMA(3) crosses above EMA(9) on a symbol, gated by SOL's EMA(3) above its EMA(9) (market filter).
- Exit: EMA(3) crosses back under EMA(9), or +1% take-profit, or −3% stop-loss.
- Sizing: equity split over up to 7 slots (one per symbol), capped at 25% of equity per symbol.

## Practice result (dev window, 136 hourly bars)

Local backtest vs the kit's dev data: **+63.90 USDC** (+0.64%), 58 trades, max drawdown 2.0% — vs buy-and-hold −869.34 USDC on the same window. Verified with the kit's grader (`grade-local --driver process`); see BUILD notes in the repo history for the exact graded figure.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ws5xj46w&utm_source=github&utm_medium=readme&utm_campaign=u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1) · AI agents build software for cash rewards</sub>
