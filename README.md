# Macro Monitor

A local, watch-only macro dashboard. It pulls about 90 economic and market
series from FRED and Yahoo, and builds a single self-contained `dashboard.html`
you open in a browser: current readings with each number scored against its own
full history, full-history charts with recession shading, sector and industry
heat tables, historical analogs, a sovereign debt section, wealth concentration
measures, and a rule-generated summary of what it all adds up to.

It also runs a **forecast journal**: the tool writes its own forecasting
questions (ahead of Fed meetings, jobs reports, CPI releases, and whenever an
indicator hits a historic extreme), you answer with a probability slider, and it
scores you automatically with a Brier score once the data resolves.

**Educational only.** It describes conditions and documented historical
tendencies, with base rates and exceptions. It does not recommend securities or
trades and is not investment advice.

## Setup

1. Get a free FRED API key: https://fred.stlouisfed.org/docs/api/api_key.html
2. Copy `config.example.json` to `config.json` and paste your key in.
3. Optionally add an [ntfy.sh](https://ntfy.sh) topic for phone alerts. The topic
   name is effectively a password, so pick something long and random.
4. `npm install`

## Run

```powershell
.\run.ps1          # fetch (cached), rebuild, and open the dashboard
.\run.ps1 -Force   # refetch everything
.\screener.ps1     # rebuild the value screener (slower, ~4,600 stocks)
```

Open the dashboard at **http://localhost:8787** rather than opening the HTML
file directly. The file works, but the forecast journal buttons need the local
server in order to save anything.

Scheduled tasks handle it hands-off: an hourly refresh, a daily screener run,
and a startup entry that keeps the server alive.

## What is in it

- **Percentile scoring** — every indicator is judged against its own history,
  so "high" means high for that series rather than high in the abstract.
- **Inflation-adjusted prices** — commodities and the S&P are also shown in
  today's dollars, which is the only fair way to compare a 1980 price to now.
- **Auto Desk Note** — fixed rules detect named conditions (inflation pressure,
  complacent lending, fiscal strain, a K-shaped economy, and others), flag where
  two of them contradict each other, and write out what the textbooks say about
  each setup. It reports what each theme is still missing, too.
- **Sovereign debt** — debt/GDP for 194 countries from the IMF, plus who holds
  US Treasuries (the Federal Reserve, foreign governments, domestic investors)
  and the Treasury's major foreign holders table.
- **Wealth and inequality** — Federal Reserve distributional accounts: top 1%
  and bottom 50% wealth shares, labor share of output, median income, Gini.
- **Forecast journal** — auto-generated questions, probability answers, Brier
  scoring, phone alerts on resolution. `lessons.md` holds the running rulebook
  and post-mortems.
- **Value screener** — every US-listed common stock over $50M market cap scored
  on value, quality and momentum, plus a Greenblatt-style combined rank.
- **Phone alerts** — regime changes, Fed moves, release days, and unusual
  readings, via ntfy.

## Files

- `config.json` — your API key and alert topic. **Private, never commit.**
- `series.mjs` — the indicator registry; add or remove series here
- `fetch-data.mjs` / `fetch-debt.mjs` / `fetch-calendar.mjs` / `fetch-news.mjs`
- `build-dashboard.mjs` — builds `dashboard.html`, including the desk-note rules
- `server.mjs` — localhost-only server so the journal buttons can save
- `test-render.mjs` — headless chart smoke test; run after editing the builder
- `lessons.md` — forecasting rulebook, graded results, and engine bugs caught

## Known gaps

- FRED dropped its LBMA gold series, so gold and stock indices come from Yahoo,
  which caps monthly history at roughly 500 bars.
- Japan CPI on FRED ended in 2021 and is auto-dropped as stale.
- FRED's high-yield spread history starts in 2023, so that chart is short even
  though the level is current.
- Annual series (median income, Gini) drift in and out of the staleness window
  between releases. That is expected.
- The tool reads no news at all. It sees prices and data only, and monthly
  averages lag sharp moves by a couple of weeks.
