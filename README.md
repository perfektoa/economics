# Economics Monitor

An economics dashboard and stock screener that run entirely on your own
PC. Everything is free. Nothing leaves your machine.

**Educational only.** It describes conditions and documented historical
tendencies. It does not recommend securities or trades and is not investment
advice.

## Install (Windows)

1. **Install Node.js** from https://nodejs.org — click through the installer,
   defaults are fine.
2. **Download this repo**: green **Code** button above → **Download ZIP** →
   unzip it anywhere you like.
3. **Double-click `setup.bat`** in that folder.

Setup asks for one thing: a **free FRED API key** (it shows you the link —
signup takes a minute). It then offers to set up automatic updates
(dashboard refreshes hourly, screener rebuilds daily), builds everything, and
puts an **Economics Monitor** shortcut on your desktop.

That's it. Double-click the shortcut. The page refreshes itself.

The stock screener is **optional, asked separately during setup** — say no and
nothing screener-related ever runs or downloads. Say yes and its first build
(data for ~4,500 companies, 1–2 hours) runs in the background or overnight;
after the first time it's fast. Changed your mind either way? Just re-run
`setup.bat`.

## What you're looking at

**The dashboard**: ~130 economic and market series, each scored against its own
full history so every number answers "is this normal?" at a glance. Charts with
recession shading, sector heat tables, which past months most resembled today
(and what followed), sovereign debt for 194 countries, wealth concentration
across six countries' central-bank data, margin debt against its prior bubble
peaks, where federal spending actually goes (back to 1959), and a plain-English
summary of what it adds up to. Hover anything for an explanation.

**The screener**: ~4,500 US stocks scored on value, quality and momentum, with
the numbers in-row: P/E, forward P/E, EV/EBITDA, P/B, debt/equity, net margin
coloured against its own sector's median, ROE, insider buying, dilution, and
warnings for commodity peaks, forecast earnings cliffs and profits not backed
by cash. Everything wrong with a row is compressed into one hover chip.

## Phone alerts (optional)

If you give setup an [ntfy.sh](https://ntfy.sh) topic, your phone gets a push
notification when something actually changes — not on a schedule, only on
changes, so a quiet week is a quiet phone:

- **The Fed moves rates** — detected from the data itself (the target rate
  series changing by 0.125+), usually within the hour, high priority
- **The regime label changes** — the dashboard's one-line summary of conditions
  (e.g. easing-while-inflation-rises) flips to something else
- **A risk flag turns on or off** — inverted yield curve, credit spreads
  blowing out, claims trending up, and the rest of the dashboard's warning
  chips; you're told which flag and what else is currently active
- **A release day starts** — one morning ping on CPI / jobs-report / FOMC days
  so a big print doesn't catch you blind
- **A market-relevant Trump post** — his feed is polled hourly for
  market-moving keywords (tariffs, the Fed, taxes...); new matches get pushed,
  capped at 3 per run

Setup: install the free ntfy app (Android/iPhone), subscribe in the app to a
topic name you invent, and give setup the same name. No account needed. The
topic name is effectively a password — anyone who knows it can see your
alerts — so make it long and random. A test notification confirms the wiring
on first run; alerts only fire while the hourly update task is on (they ride
the same refresh).

## Notes

- **Your key stays yours.** `config.json` lives only on your PC and is
  gitignored.
- **Mac/Linux**: no one-click setup, but everything except the FINRA margin
  fetch is plain Node — `npm install`, copy `config.example.json` to
  `config.json` with your key, then run the `fetch-*.mjs` scripts and
  `node build-dashboard.mjs` / `node build-screener.mjs`.
- **Data sources**: FRED (the one key), plus Yahoo, FINRA, IMF, US Treasury,
  ECB, Statistics Canada, World Bank, Eurostat, OECD/DBnomics and Our World in
  Data — all keyless. Bad data is guarded against: impossible price bars are
  dropped with a logged warning, foreign bars are dated in exchange-local time,
  and stale series are removed from the page rather than shown as current.
- **Undo automatic updates**: delete the `MacroMonitor` and `MacroScreener`
  tasks in Windows Task Scheduler.
- An optional `notes.json` (explained on the screener page) records findings
  from actually reading about a company — a pending takeover, an expiring
  licence — and overrides the numeric columns. It's gitignored; your research
  stays yours.
