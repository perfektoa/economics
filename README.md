# Macro Monitor — Real World

A local, watch-only macro dashboard inspired by the Wall Street Raider Macro
Monitor mod. Pulls ~18 series from FRED (free API), renders a single
self-contained `dashboard.html`: regime chip, risk chips, indicator cells with
3m/12m trends, and full-history charts (back to the 1940s-50s for most US
series) with US recession shading, hover crosshairs, and 10y/25y/Max ranges.

**Educational only.** It describes conditions and documented historical
tendencies (with base rates and famous exceptions). It does not recommend
securities or trades and is not investment advice.

## Run

```powershell
.\run.ps1          # fetch (cached <20h) + build + open
.\run.ps1 -Force   # refetch everything
```

Optional: schedule it each weekday morning —
`schtasks /create /tn MacroMonitor /tr "powershell -File C:\GameDev\macro-monitor\run.ps1" /sc weekly /d MON,TUE,WED,THU,FRI /st 08:00`

## Value Screener (screener.html)

`screener.ps1` (or the daily 8:10 task) scores every US-listed common stock
≥ $50M market cap (~4,600 names, mega → micro) on three factor scores:

- **Value 0-6** — earnings yield ≥6%, P/B<1.5, dividend, D/E<1×, ROE≥12%, FCF+
- **Quality 0-6** — ROA≥5%, gross margin≥30%, op margin≥10%, current ratio≥1.2,
  earnings growing, revenue growing (Piotroski-spirit)
- **Momentum 0-3** — 52w return >0 / >10% / within 10% of the 52-week high
- **Total 0-15** and **MF#** (Greenblatt-style cheap+good rank)

Combined value+quality+momentum is the factor-literature standard; single
factors underperform combos historically. Universe: NASDAQ screener feed
(NASDAQ+NYSE+AMEX, funds excluded); fundamentals: Yahoo, 20h cache per ticker.
Micro caps often miss fields — missing counts as a failed test.

## Files

- `config.json` — your FRED API key. **Private; don't share or commit.**
- `series.mjs` — the indicator registry (add/remove series here)
- `fetch-data.mjs` — FRED fetcher → `data/*.json` cache
- `build-dashboard.mjs` — builds `dashboard.html` (regime/chip logic lives here)
- `test-render.mjs` — headless chart smoke test (run after editing the builder)

## Known gaps

- **Gold**: FRED dropped the LBMA series (licensing). Add later via Alpaca or
  yfinance. Same for stock indices (FRED's S&P 500 is 10y-only).
- **Japan CPI** is stale on FRED (OECD feed ended 2021) — auto-dropped.
- HY credit spread history on FRED now starts 2023 (licensing) — level is
  current, chart is short.
- World coverage is best-effort FRED; DBnomics/World Bank (keyless) are the
  upgrade path for more countries.
