# Macro Monitor

A local, watch-only macro dashboard and value screener. Everything runs on your
own machine, builds plain HTML files you open in a browser, and talks only to
free public data APIs. No accounts (beyond one free API key), no server, no
tracking, nothing leaves your PC.

**The dashboard** (`dashboard.html`) pulls ~130 economic and market series and
shows: current readings scored against their own full history (percentiles, so
"is this normal?" is answered on every cell), full-history charts grouped into
sections with recession shading, sector and industry heat tables, historical
analogs (which past months looked most like today, and what followed), sovereign
debt for 194 countries, wealth concentration for the US / euro area / Canada /
UK / Japan / Australia, FINRA margin debt against its prior cycle peaks, federal
spending by function back to 1959, cross-country "assumptions worth checking"
scatters, and a rule-generated plain-English summary of what it all adds up to.

**The screener** (`screener.html`) scores ~4,500 US stocks on value, quality and
momentum (16 tests), with the metrics that matter in-row: P/E, forward P/E,
EV/EBITDA, P/B, debt/equity, net margin coloured against the sector median,
ROE, insider buying, share dilution, short interest, and cycle warnings
(commodity peaks, forecast earnings cliffs, profits not backed by cash).
Everything flagged on a row is compressed into one hover chip.

**Educational only.** It describes conditions and documented historical
tendencies, with base rates and exceptions. It does not recommend securities or
trades and is not investment advice.

## What you need

- **Node.js 18 or newer** — https://nodejs.org (any recent LTS works)
- **Windows** for the one-command runners (`run.ps1`, `screener.ps1`) and the
  FINRA margin fetch (it uses PowerShell to unzip). Everything else is plain
  Node and runs anywhere; on Mac/Linux run the `node` commands listed below and
  skip `fetch-margin.mjs`.
- **A free FRED API key** — https://fred.stlouisfed.org/docs/api/api_key.html
  (instant signup). Every other source — Yahoo, IMF, Treasury, FINRA, World
  Bank, Eurostat, OECD/DBnomics, ECB, Statistics Canada, Our World in Data —
  needs no key at all.

## Setup

```bash
git clone https://github.com/perfektoa/economics.git
cd economics
npm install
```

Then create your config:

1. Copy `config.example.json` to `config.json`
2. Paste your FRED API key into it
3. *(Optional)* add an [ntfy.sh](https://ntfy.sh) topic for phone alerts on
   regime changes, Fed moves and data releases. Install the ntfy app, subscribe
   to a topic name, put the same name in the config. The topic name is
   effectively a password — pick something long and random.

`config.json` is gitignored. Your key never leaves your machine and never goes
into the repo.

## Run the dashboard

Windows, one command:

```powershell
.\run.ps1
```

That fetches everything (with sensible caching — re-runs are fast), rebuilds
`dashboard.html`, and opens it. Use `.\run.ps1 -Force` to ignore caches.

Or step by step on any OS:

```bash
node fetch-data.mjs        # FRED + Yahoo series (the core, ~2 min first run)
node fetch-calendar.mjs    # release calendar + FOMC dates
node fetch-debt.mjs        # IMF world debt + Treasury foreign holders
node fetch-margin.mjs      # FINRA margin debt (Windows only)
node fetch-intl.mjs        # ECB / StatCan / WID wealth distribution
node fetch-compare.mjs     # World Bank / Eurostat cross-country indicators
node build-dashboard.mjs   # writes dashboard.html
```

Open `dashboard.html` in a browser. Done.

## Run the screener

```powershell
.\screener.ps1
```

Or by hand:

```bash
node fetch-screener.mjs    # ~4,500 tickers from Yahoo — the slow one (~1-2h first run, cached 7 days)
node build-screener.mjs    # writes screener.html
node fetch-fts.mjs         # 4y of statements for top candidates (dilution + earnings quality)
node fetch-news.mjs        # headlines for top candidates
node build-screener.mjs    # rebuild with the extra columns filled
```

Open `screener.html`. Sort by clicking column headers; filter by sector, cap
bucket, style, or minimum score; hover anything for the explanation.

An optional `notes.json` (see the banner on the screener page) lets you record
findings from actually reading about a company — a pending takeover, an
expiring licence — which override the numeric columns. It's gitignored;
your research stays yours.

## Keeping it fresh automatically (optional, Windows)

Schedule `run.ps1` hourly and `screener.ps1` daily with Task Scheduler. The
repo includes `silent-server.vbs` / `silent-screener.vbs` launchers that run
them without flashing a console window. The dashboard page auto-reloads every
30 minutes, and `server.mjs` (`node server.mjs`, then http://localhost:8787)
serves it locally if you prefer a URL to a file path.

## Data sources

| Source | What | Key needed |
|---|---|---|
| FRED (St. Louis Fed) | US + world macro series | free key |
| Yahoo Finance | indices, commodities, FX, stocks | no |
| FINRA | margin debt (monthly xlsx) | no |
| IMF DataMapper | debt/GDP, 194 countries | no |
| US Treasury TIC | foreign holders of Treasuries | no |
| ECB Data Portal | euro-area distributional wealth | no |
| Statistics Canada WDS | Canadian wealth quintiles | no |
| Our World in Data | WID wealth shares (UK/JP/AU) | no |
| World Bank / Eurostat / DBnomics | cross-country indicators | no |

Data quality guards are built in: impossible bars from Yahoo (zero prices,
isolated 80% spikes) are dropped with a logged warning, foreign-exchange bars
are dated in exchange-local time, and stale series are dropped from the page
rather than shown as if current.
