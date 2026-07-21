// Builds dashboard.html from the cached FRED data.
// Usage: node build-dashboard.mjs
//
// Educational tool: displays conditions and documented historical tendencies.
// It does not recommend trades and is not investment advice.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { SERIES } from './series.mjs';

const DATA_DIR = new URL('./data/', import.meta.url);
const load = (id) => {
    const f = new URL(`./${id}.json`, DATA_DIR);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).obs : null;
};

// ── transforms ──────────────────────────────────────────────────────────────
const ym = (d) => d.slice(0, 7);
function toMonthly(obs) {
    // last observation per calendar month → [ [ 'YYYY-MM', value ], ... ]
    const out = [];
    for (const o of obs) {
        const m = ym(o.d);
        if (out.length && out[out.length - 1][0] === m) out[out.length - 1][1] = o.v;
        else out.push([m, o.v]);
    }
    return out;
}
function yoy(monthly) {
    const idx = new Map(monthly.map(([m, v]) => [m, v]));
    const out = [];
    for (const [m, v] of monthly) {
        const prev = idx.get(`${+m.slice(0, 4) - 1}${m.slice(4)}`);
        if (prev != null && prev !== 0) out.push([m, (v / prev - 1) * 100]);
    }
    return out;
}
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

// ── assemble series ─────────────────────────────────────────────────────────
const NOW_YM = new Date().toISOString().slice(0, 7);
const STALE_DROP_MONTHS = 30, STALE_FLAG_MONTHS = 6;

const built = {}; const dropped = [];
for (const s of SERIES) {
    if (s.group === 'meta') continue;
    const obs = load(s.id);
    if (!obs || obs.length < 13) { dropped.push(`${s.label} (no data)`); continue; }
    let pts = toMonthly(obs);
    if (s.kind === 'yoy') pts = yoy(pts);
    if (s.scale) pts = pts.map(([m, v]) => [m, v * s.scale]);
    if (pts.length < 2) { dropped.push(`${s.label} (too short)`); continue; }
    const lastYm = pts[pts.length - 1][0];
    const staleMonths = monthsBetween(lastYm, NOW_YM);
    if (staleMonths > STALE_DROP_MONTHS) { dropped.push(`${s.label} (stale: ends ${lastYm})`); continue; }
    if (s.fallbackFor && built[s.fallbackFor]) continue;
    built[s.id] = {
        id: s.id, label: s.label, unit: s.unit, dec: s.dec, group: s.group,
        pts, latest: pts[pts.length - 1][1], asOf: lastYm,
        stale: staleMonths > STALE_FLAG_MONTHS,
        d3: delta(pts, 3), d12: delta(pts, 12),
        p: pctile(pts), since: pts[0][0].slice(0, 4),
    };
}
// Percentile of the latest value within the series' own full history
function pctile(pts) {
    const vals = pts.map(p => p[1]);
    const last = vals[vals.length - 1];
    const below = vals.filter(v => v <= last).length;
    return Math.round(100 * below / vals.length);
}

// Directionality: is a HIGH value good, bad, or not a moral question?
const DIR = {
    GDPNOW: 'good', A191RL1Q225SBEA: 'good', PAYEMS: 'good', INDPRO: 'good', UMCSENT: 'good', HOUST: 'good',
    CPIAUCSL: 'bad', CPILFESL: 'bad', UNRATE: 'bad', ICSA: 'bad', BAMLH0A0HYM2: 'bad', VIXCLS: 'bad', MORTGAGE30US: 'bad',
    NFCI: 'bad', DRCCLACBS: 'bad', DRSFRMACBS: 'bad', BREADTH: 'good',
    WFRBST01134: 'bad', WFRBSB50215: 'good', PRS85006173: 'good', MEHOINUSA672N: 'good',
    SIPOVGINIUSA: 'bad', WEALTHGAP: 'bad', GFDEGDQ188S: 'bad', FYOIGDA188S: 'bad',
};

// Historical tendencies at extremes — study prompts with base rates, not signals.
// playHigh/playLow: how the long/short textbooks historically framed the spot.
// Hypothetical educational framing, NOT recommendations.
const EXTREME_NOTES = {
    T10Y2Y: { low: 'Deep inversion has preceded every recession since the late 70s (6-24mo lead) — and the recession usually arrived around UN-inversion, not inversion.', high: 'A steep curve is early-cycle: historically among the better environments for risk assets and banks.',
        playLow: 'Textbook: not an equity sell signal by itself (markets often rallied post-inversion); duration longs start accumulating; the de-risk trigger is UN-inversion + claims turning up.', playHigh: 'Textbook: early-cycle longs — banks, small caps, cyclicals — historically did best from steep-curve starts.' },
    VIXCLS: { high: 'VIX spikes above the 90th percentile historically clustered near panic LOWS in stocks, not tops — fear peaks late.', low: 'Multi-year VIX lows = complacency; forward returns from here were historically mediocre.',
        playHigh: 'Textbook: contrarian longs scale into equities during VIX spikes (never all at once — spikes can double); vol sellers wait for the backwardation to break.', playLow: 'Textbook: cheap-vol regimes are where hedges/protective puts are bought, not sold; momentum longs ride but tighten stops.' },
    BAMLH0A0HYM2: { high: 'Credit spreads at crisis extremes (2008, 2020) historically preceded strong multi-year bond AND stock returns — max pessimism gets priced.', low: 'Spreads this tight leave no cushion; historically preceded below-average returns.',
        playHigh: 'Textbook: crisis spreads were the generational long in credit — buying quality junk at 8-10% spreads paid for years.', playLow: 'Textbook: up-in-quality rotation — swap junk for investment grade/treasuries; the asymmetric short is credit protection, but carry bleeds while you wait.' },
    UNRATE: { high: 'Unemployment peaks historically came at or after recession END — extreme highs were early-cycle buy zones in hindsight.', low: 'Multi-decade unemployment lows are late-cycle by definition; little labor slack left to fuel growth.',
        playHigh: 'Textbook: maximum-pain unemployment prints were historically when early-cycle equity longs began.', playLow: 'Textbook: late-cycle posture — trim leverage, favor quality, keep the shopping list ready.' },
    UMCSENT: { low: 'Consumer-sentiment troughs are a famous contrarian marker: forward 12m equity returns from sentiment lows were historically well above average.', high: 'Euphoric sentiment historically preceded modest forward returns.',
        playLow: 'Textbook: one of the better-documented contrarian LONG prompts — misery troughs historically beat euphoria for forward returns. Shorting despair has been the losing side.', playHigh: 'Textbook: euphoria = trim, rebalance, raise cash slowly.' },
    ICSA: { low: 'Claims at generational lows = tightest labor market; watch for the upturn — a sustained +15-20% rise off the low historically led recessions.', high: 'Claims spikes mark recessions in progress; the PEAK historically came near the stock market bottom.',
        playLow: 'Textbook: stay long but define the exit NOW — the tradable signal is the sustained upturn off the low, not the low itself.', playHigh: 'Textbook: claims peaking = historically near the equity bottom; contrarian longs watched for the rollover.' },
    CPIAUCSL: { high: 'Inflation extremes forced Fed tightening cycles (1974, 1980, 2022) — the playbook regime where cash/short bonds beat risk until the break.', low: 'Deflation-adjacent readings historically meant easy money ahead.',
        playHigh: 'Textbook: inflation regimes favored real assets/energy longs and SHORT long-duration bonds until the Fed wins; the turn (CPI rolling over) flips it to duration longs.', playLow: 'Textbook: disinflation = duration longs and growth-equity tailwinds.' },
    HOUST: { low: 'Housing-start collapses historically marked the depth of recessions — and the rebound led the recovery.', high: 'Construction booms at extremes preceded the 2006-type overhangs.',
        playLow: 'Textbook: homebuilder longs from start-collapse extremes were among the great early-cycle trades (2011-12).', playHigh: 'Textbook: supply overhang building — the eventual short thesis writes itself, but timing needed rate pressure too.' },
    DCOILWTICO: { high: 'Oil price extremes acted as a consumer tax — 1974/1980/2008 spikes preceded recessions and their own demand-destruction crash.', low: 'Oil collapses (1986, 2015, 2020) squeezed producers but acted as a consumer stimulus with a lag.',
        playHigh: 'Textbook: ride energy longs with stops, rotate OUT of transports/consumers; the spike eventually kills its own demand — fade only after the trend breaks.', playLow: 'Textbook: consumer/transport longs benefit; energy-producer longs waited for capex cuts to bite supply.' },
    FEDFUNDS: { high: 'Peak policy rates historically marked the best long-bond entry points of each cycle.', low: 'Rates at generational lows = cheap-money era; historically inflated valuations and preceded hiking cycles.',
        playHigh: 'Textbook: when rates peak, long-term bonds bought at those yields have historically been the standout trade, because their prices rise as rates come back down.', playLow: 'Textbook: lock in cheap fixed borrowing while it lasts; bonds have little left to gain from here, and protection against rates rising is cheap.' },
    PCOPPUSDM: { high: 'Copper at record extremes historically reflected demand booms or supply crunches — "Dr. Copper" ran hot before overheating episodes.', low: 'Copper collapses tracked global recessions (2008, 2015, 2020).',
        playHigh: 'Textbook: momentum longs respect all-time highs (shorting records = squeeze bait); miners as the levered expression; the exit cue is growth data rolling over.', playLow: 'Textbook: copper capitulation lows were early-cycle entry markers for industrial/EM longs.' },
    YH_GOLD: { high: 'Gold at the 90th+ percentile historically meant falling real rates, policy distrust, or crisis hedging (1979-80, 2011, 2020).', low: 'Gold at multi-year lows accompanied strong-dollar, high-real-rate regimes.',
        playHigh: 'Textbook: a high price is not by itself a reason to bet against gold — that has bankrupted people for years at a stretch. Those who stayed with the trend used a rule to exit rather than a price target, and waited for inflation-adjusted rates to turn up before betting the other way.', playLow: 'Textbook: gold lows during rate-cutting cycles were where long-term holders accumulated.' },
    YH_SILVER: { high: 'Silver extremes ride gold + industrial demand — historically spikier and faster to reverse than gold (1980, 2011).', low: 'Silver washouts tracked industrial recessions.',
        playHigh: 'Textbook: same as gold but with tighter risk control — silver retraces harder; parabolic moves historically gave back 30-50% within two years.', playLow: 'Textbook: high-beta metal recovery long once gold trend confirms.' },
    CP0000EZ19M086NEST: { high: 'Eurozone inflation extremes force ECB hawkishness.', low: 'EZ disinflation historically brought ECB easing.',
        playHigh: 'Textbook: European duration shorts / EUR rate-hike positioning until the print rolls over.', playLow: 'Textbook: European duration longs.' },
    YH_CL: { high: 'Front-month crude at extremes — same consumer-tax mechanics as spot WTI, but this is the live traded price.', low: 'Crude futures collapsed — producer pain, consumer stimulus with a lag.',
        playHigh: 'Textbook: energy longs ride with stops; transports/consumer shorts are the pair; fade only after trend break — demand destruction is the eventual assassin.', playLow: 'Textbook: consumer/transport longs; energy-producer longs wait for supply capitulation (capex cuts, rig counts falling).' },
    YH_HG: { high: 'Copper futures at extremes — "Dr. Copper" pricing either a demand boom or a supply crunch.', low: 'Copper futures washouts tracked global recessions.',
        playHigh: 'Textbook: momentum respects records (shorting them = squeeze bait); miners (XME) as the levered vehicle; exit cue = growth data rolling over.', playLow: 'Textbook: capitulation lows were early-cycle industrial entry points.' },
    YH_ZW: { high: 'Wheat at real-term extremes = food inflation pressure — historically fed headline CPI and EM instability.', low: 'Cheap grain eased food inflation.',
        playHigh: 'Textbook: agricultural exposure follows the trend, while packaged-food companies get squeezed, because grain is their raw material and they cannot always raise prices fast enough.', playLow: 'Textbook: cheap grain is a cost tailwind for food processors and consumer staples.' },
    YH_ZC: { high: 'Corn at real-term extremes — same food-inflation channel as wheat, plus ethanol/fuel linkage.', low: 'Cheap corn = feed/food cost relief.',
        playHigh: 'Textbook: as wheat — ag trend longs, processor margin caution.', playLow: 'Textbook: protein producers (feed costs) and staples benefit.' },
    NFCI: { high: 'Financial conditions at tight extremes — credit crunches (2008, 2020) live here.', low: 'Conditions at historic ease — cheap money everywhere, historically fuel for bubbles.',
        playHigh: 'Textbook: tight-conditions extremes were scale-in points for quality risk assets — max tightness clusters near bottoms.', playLow: 'Textbook: ride the liquidity but tighten stops; conditions this easy eventually invite the tightening that ends the party.' },
    YH_USDJPY: { high: 'Yen at extreme weakness — the global carry trade (borrow cheap yen, buy everything else) at maximum stretch. The Aug 2024 unwind started exactly here.', low: 'Yen extremely strong — carry trades unwinding, global risk assets typically under pressure.',
        playHigh: 'Textbook: enjoy risk assets but know the tripwire — a fast 5%+ yen RALLY from extremes historically forced global deleveraging (carry unwind).', playLow: 'Textbook: yen-strength spikes accompany the panic phase — a scale-in signal for risk, not a sell signal.' },
    BREADTH: { high: 'Broad participation — the average stock keeping up with the index. Historically the healthy configuration.', low: 'Narrow market — a few giants carrying a sagging average stock. The fragile configuration.',
        playHigh: 'Textbook: broad rallies forgave mistakes; cyclical and small-cap longs historically worked.', playLow: 'Textbook: narrow leadership late in cycles favored quality/index positions over stock-picking; breadth troughs that TURN UP marked durable bottoms.' },
    DRCCLACBS: { high: 'Card delinquencies at extremes = household stress no sentiment survey can spin.', low: 'Cleanest consumer credit in decades.',
        playHigh: 'Textbook: consumer-lender and subprime shorts were the asymmetric side; discounters outperform.', playLow: 'Textbook: consumer credit this clean supported lenders and consumer cyclicals — until claims turn.' },
    WFRBST01134: { high: 'Wealth concentration at record extremes — the economy runs on asset prices: the wealth effect does the spending, and policy risk (taxes, tariffs, transfers) stops being a tail scenario.', low: 'Wealth growth broadly shared — consumption tracks wages more than markets.',
        playHigh: 'Textbook: consumption follows the S&P more than paychecks — equity drawdowns transmit to spending with a short lag; the luxury+discount barbell beats the middle; populist policy shifts get priced as base case.', playLow: 'Textbook: wage-driven cycle — broad consumer cyclicals work evenly.' },
    WFRBSB50215: { low: 'Bottom-half wealth share at record lows — the paycheck economy has no buffer: small shocks (gas, rates, layoffs) transmit to delinquencies fast.', high: 'Bottom-half balance sheets unusually healthy (the 2020-21 stimulus era was the modern peak).',
        playLow: 'Textbook: discount retail over mid-tier; subprime credit is the early-warning short when claims turn; transfer-heavy fiscal responses become the base case in any downturn.', playHigh: 'Textbook: broad consumer resilience — the median-consumer basket works.' },
    PRS85006173: { low: 'Labor share of output near historic lows — capital is taking a record slice: corporate margins are fat but politically exposed (minimum-wage pushes, unionization, tax shifts).', high: 'Labor share elevated — wages eating into margins; historically a late-cycle profit-squeeze marker.',
        playLow: 'Textbook: fat-margin regimes support equities until labor or policy claws it back — the turn signals are wage prints accelerating and unionization waves.', playHigh: 'Textbook: margin-compression era — favor pricing power over labor-heavy business models.' },
    WEALTHGAP: { high: 'The gap at record width — a two-track economy: aggregate consumer stats are top-decile spending in disguise, and the bottom half lives in a different economy than the index.', low: 'Gap narrowing — wage gains outrunning asset gains (rare: late 1990s, 2020-21).',
        playHigh: 'Textbook: K-shape positioning — luxury + discounters over the middle; equities become the LEADING consumer indicator (drawdowns hit spending within a quarter); political-risk premium on every policy calendar.', playLow: 'Textbook: broad-based cycles favor small caps and the median consumer.' },
    GFDEGDQ188S: { high: 'Debt/GDP at war-era extremes. The post-WW2 exit from 106% was growth (biggest), financial repression (inflation above capped rates quietly taxing bondholders), and primary surpluses held up by 91%-top-rate-era taxation — a package deal that also drove the Great Compression in the wealth charts above.', low: 'Fiscal headroom — countercyclical capacity intact.',
        playHigh: 'Textbook: repression-era assets — gold and real assets carry a structural bid; long NOMINAL bonds are the structurally handicapped asset (T-bills reprice with inflation, 30-year bonds eat it). The historical loser of high-debt eras was the long-bond holder, not the stockholder.', playLow: 'Textbook: duration is safe; fiscal expansions from low debt fund early-cycle booms.' },
    FYOIGDA188S: { high: 'Interest is eating the budget — the 1980s-90s bond-vigilante era lived here; crowding-out becomes the political story and deficits become self-feeding (borrowing to pay interest).', low: 'Debt service trivially cheap — the 2010s free-money configuration.',
        playHigh: 'Textbook: term-premium regimes — short duration + inflation-protected (TIPS) over long nominals; ends when primary deficits actually shrink, not when politicians promise they will.', playLow: 'Textbook: cheap service costs let duration and equities both work.' },
    FORSHARE: { high: 'Foreigners fund an outsized slice of the debt — the "kindness of strangers" regime: the dollar and Treasury market are load-bearing walls of the same building.', low: 'Foreign share at generational lows — the debt is being absorbed domestically (Fed, banks, funds, households): the Japan path.',
        playHigh: 'Textbook: sensitive to dollar shocks — foreign selling shows up as simultaneous bond+dollar weakness (the 2022 UK gilt lesson at scale).', playLow: 'Textbook: domestic-absorption eras rhyme with financial repression — institutions get nudged into holding government paper, and gold historically caught the quiet bid.' },
};

function delta(pts, months) {
    const [lm, lv] = pts[pts.length - 1];
    for (let i = pts.length - 2; i >= 0; i--) {
        if (monthsBetween(pts[i][0], lm) >= months) return lv - pts[i][1];
    }
    return null;
}
// Percent change over a real calendar span. Never count array entries: several
// series (gold, the FX pairs) are missing scattered months, so "13 entries back"
// can be 16 months back and quietly mislabel the column.
function pctDelta(pts, months) {
    if (!pts || pts.length < 2) return null;
    const [lm, lv] = pts[pts.length - 1];
    for (let i = pts.length - 2; i >= 0; i--) {
        if (monthsBetween(pts[i][0], lm) >= months) {
            return pts[i][1] ? (lv / pts[i][1] - 1) * 100 : null;
        }
    }
    return null;
}
const g = (id) => built[id] || null;

// ── real (inflation-adjusted) prices: deflate by CPI to today's dollars ─────
// realPrice(m) = price(m) × CPI_latest / CPI(m). Makes 1980 oil comparable to
// today's, exposes when a "record high" is only mid-range in real terms.
const cpiRawObs = load('CPIAUCSL');
const cpiIdx = cpiRawObs ? new Map(toMonthly(cpiRawObs)) : new Map();
const cpiLatest = cpiRawObs ? toMonthly(cpiRawObs).slice(-1)[0][1] : null;
const REAL_IDS = ['DCOILWTICO', 'YH_GOLD', 'YH_SILVER', 'PCOPPUSDM', 'YH_ZW', 'YH_ZC', 'YH_SPX'];
if (cpiLatest) {
    for (const id of REAL_IDS) {
        const src = built[id];
        if (!src) continue;
        const rpts = src.pts
            .map(([m, v]) => { const c = cpiIdx.get(m); return c ? [m, v * cpiLatest / c] : null; })
            .filter(Boolean);
        if (rpts.length < 24) continue;
        built[id + '_R'] = {
            id: id + '_R', label: `${src.label} (real, today's $)`, unit: src.unit, dec: src.dec,
            group: 'real', pts: rpts, latest: rpts[rpts.length - 1][1], asOf: src.asOf,
            stale: src.stale, d3: delta(rpts, 3), d12: delta(rpts, 12),
            p: pctile(rpts), since: rpts[0][0].slice(0, 4),
        };
    }
}
const pReal = (id) => built[id + '_R']?.p ?? null;

// ── breadth: equal-weight ÷ cap-weight S&P, indexed to 100 ──────────────────
{
    const rspObs = load('YH_RSP');
    const spx = built['YH_SPX'];
    if (rspObs && spx) {
        const rsp = new Map(toMonthly(rspObs));
        const ratio = spx.pts.map(([m, v]) => rsp.get(m) ? [m, rsp.get(m) / v] : null).filter(Boolean);
        if (ratio.length > 24) {
            const base = ratio[0][1];
            const pts = ratio.map(([m, v]) => [m, v / base * 100]);
            built['BREADTH'] = {
                id: 'BREADTH', label: 'Breadth: Equal÷Cap-weight S&P (idx)', unit: '', dec: 1, group: 'idx',
                derived: true, pts, latest: pts[pts.length - 1][1], asOf: spx.asOf, stale: false,
                d3: delta(pts, 3), d12: delta(pts, 12), p: pctile(pts), since: pts[0][0].slice(0, 4),
            };
        }
    }
}

// ── gold priced in other currencies ─────────────────────────────────────────
// The "is it the thing, or is it the ruler?" test. If gold rises only in dollars
// it is a currency story; if it rises in every currency it is real gold demand.
{
    const gold = built['YH_GOLD'];
    const fx = [
        ['YH_EURUSD', 'EUR', 'div'],  // EURUSD = dollars per euro
        ['YH_USDJPY', 'JPY', 'mul'],  // JPY=X   = yen per dollar
        ['YH_GBPUSD', 'GBP', 'div'],
    ];
    if (gold) {
        for (const [fxId, code, op] of fx) {
            const f = built[fxId];
            if (!f) continue;
            const fmap = new Map(f.pts);
            const pts = gold.pts.map(([m, v]) => {
                const r = fmap.get(m);
                if (!r) return null;
                return [m, op === 'div' ? v / r : v * r];
            }).filter(Boolean);
            if (pts.length < 24) continue;
            built['GOLD_' + code] = {
                id: 'GOLD_' + code, label: `Gold priced in ${code}`, unit: '', dec: 0, group: 'mkt',
                derived: true, pts, latest: pts[pts.length - 1][1], asOf: gold.asOf, stale: false,
                d3: delta(pts, 3), d12: delta(pts, 12), p: pctile(pts), since: pts[0][0].slice(0, 4),
            };
        }
    }
}

// ── wealth gap: top 1% share ÷ bottom 50% share of net worth ────────────────
// One number for the two-track economy. ~6.5x in 1989; the climb since is the
// structural story behind the K-SHAPED ECONOMY theme.
{
    const t1 = built['WFRBST01134'], b50 = built['WFRBSB50215'];
    if (t1 && b50) {
        const b50Map = new Map(b50.pts);
        const pts = t1.pts.map(([m, v]) => { const b = b50Map.get(m); return b ? [m, v / b] : null; }).filter(Boolean);
        if (pts.length > 12) {
            built['WEALTHGAP'] = {
                id: 'WEALTHGAP', label: 'Wealth Gap: Top 1% ÷ Bottom 50%', unit: 'x', dec: 1, group: 'ineq',
                derived: true, pts, latest: pts[pts.length - 1][1], asOf: t1.asOf, stale: t1.stale,
                d3: delta(pts, 3), d12: delta(pts, 12), p: pctile(pts), since: pts[0][0].slice(0, 4),
            };
        }
    }
}

// ── who holds US federal debt: foreign & Fed shares of the total ────────────
// GFDEBTN is $millions; FDHB* are $billions — hence the ×1000.
{
    const tot = load('GFDEBTN');
    if (tot) {
        const t = new Map(toMonthly(tot));
        const shareOf = (id, key, label) => {
            const obs = load(id);
            if (!obs) return;
            const pts = toMonthly(obs).map(([m, v]) => t.get(m) ? [m, v * 1000 / t.get(m) * 100] : null).filter(Boolean);
            if (pts.length < 24) return;
            built[key] = {
                id: key, label, unit: '%', dec: 1, group: 'debt', derived: true,
                pts, latest: pts[pts.length - 1][1], asOf: pts[pts.length - 1][0], stale: false,
                d3: delta(pts, 3), d12: delta(pts, 12), p: pctile(pts), since: pts[0][0].slice(0, 4),
            };
        };
        shareOf('FDHBFIN', 'FORSHARE', 'Foreign-Held Share of US Debt');
        shareOf('FDHBFRBN', 'FEDSHARE', 'Fed-Held Share of US Debt');
    }
}

// recession bands from USREC
const recObs = load('USREC') || [];
const recBands = [];
{
    let start = null;
    for (const o of recObs) {
        if (o.v === 1 && start === null) start = ym(o.d);
        if (o.v === 0 && start !== null) { recBands.push([start, ym(o.d)]); start = null; }
    }
    if (start !== null) recBands.push([start, NOW_YM]);
}

// ── regime + risk chips ─────────────────────────────────────────────────────
const growth = g('GDPNOW')?.latest ?? g('A191RL1Q225SBEA')?.latest ?? null;
const infl = g('CPILFESL')?.latest ?? g('CPIAUCSL')?.latest ?? null;
const curve = g('T10Y2Y')?.latest ?? null;
const ff = g('FEDFUNDS');
const fedDelta6 = ff ? delta(ff.pts, 6) : null;

function regime() {
    if (growth == null || infl == null) return ['AWAITING DATA', 'muted'];
    if (growth < 0.5 && infl > 3) return ['STAGFLATION WATCH', 'bad'];
    if (growth < 0.5) return ['RECESSION WATCH', 'bad'];
    if (growth >= 2.5 && infl <= 3) return ['GOLDILOCKS EXPANSION', 'good'];
    if (growth >= 2.5) return ['RUNNING HOT', 'warn'];
    if (infl > 3) return ['STICKY-INFLATION SLOWDOWN', 'warn'];
    return ['MODERATE EXPANSION', 'good'];
}
const [regimeLabel, regimeTone] = regime();

const oil = g('DCOILWTICO'); const oilYoY = oil ? delta(oil.pts, 12) : null;
const chips = [
    ['Curve inverted', curve != null && curve < 0,
     'The 10Y-2Y spread below zero has preceded every US recession since the late 1970s by roughly 6-24 months, with one debated false alarm (1998). It is an early warning, not a timer.'],
    ['Credit stress', (g('BAMLH0A0HYM2')?.latest ?? 0) > 5,
     'High-yield spreads above ~5% mean bond investors are pricing meaningful default risk. Spikes above 8-10% marked 2008 and March 2020.'],
    ['Vol elevated', (g('VIXCLS')?.latest ?? 0) > 25,
     'VIX above 25 = options markets bracing for large swings. Above 40 has historically marked panic lows more often than tops.'],
    [`Fed: ${fedDelta6 == null ? '?' : fedDelta6 > 0.4 ? 'TIGHTENING' : fedDelta6 < -0.4 ? 'EASING' : 'ON HOLD'}${fedDelta6 != null ? ` (${fedDelta6 > 0 ? '+' : ''}${fedDelta6.toFixed(2)}/6m)` : ''}`,
     fedDelta6 != null && fedDelta6 > 0.4,
     'Fed stance from the 6-month change in Fed funds. Hiking cycles preceded most postwar recessions (12-24 month lag) — that is the red-flag case. Rapid cuts historically accompany trouble already arriving; slow cuts accompany soft landings.'],
    ['Oil shock', oilYoY != null && oil && oilYoY / (oil.latest - oilYoY) > 0.5,
     'Oil up >50% year-over-year. Preceded or accompanied the recessions of 1974, 1980, 1990 and 2008 - an effective tax on transport and consumers.'],
];

// ── rule cards (tendencies, with base rates — not laws, not advice) ────────
const RULES = [
    ['Rates and valuations', 'When interest rates rise, investors will pay less for each dollar a company earns, because safe bonds now compete for their money. Falling rates do the reverse. The exception is when growth surprises to the upside strongly enough to overwhelm it, as in the late 1990s.'],
    ['The curve leads, slowly', 'When the 10-year Treasury yields less than the 2-year, a recession has followed nearly every time since the 1970s. It is also famously early. Markets often rallied for months afterward, and the recession usually arrived one to two years later, around the time the curve went back to normal.'],
    ['Oil is a tax', 'Sustained oil spikes squeeze transport, autos and household budgets, and then overall growth. Oil collapses (1986, 2014) put money back in consumers pockets but crushed energy producers.'],
    ['Gold follows real rates and fear', 'Gold has tended to rise when inflation-adjusted interest rates fall and when confidence in government policy drops, as in the 1970s, 2008-11 and 2019-20. It reverts on no schedule, and betting against it because it looks too high has been a losing position for years at a time.'],
    ['Housing turns first', 'Homebuilding is a small part of the economy but an outsized part of its turning points. Housing starts rolled over before most postwar recessions, because mortgage rates bite there before anywhere else.'],
    ['Breadth and credit confirm', 'Lasting stock market advances usually come with most stocks participating and with lenders relaxed. Rallies carried by a handful of giant companies while lenders grow nervous have historically been fragile.'],
    ['These are tendencies, not rules', 'Everything here describes what usually happened, with real exceptions every time. Nobody gets to read the source code of the economy. Sizing positions carefully and waiting does the work that certainty cannot.'],
];

// ── historical analogs ──────────────────────────────────────────────────────
// Score every month since the mid-70s against today across ~11 normalized
// features (levels AND directions). Educational pattern-study, not prediction.
const ymAdd = (m, k) => {
    const t = (+m.slice(0, 4)) * 12 + (+m.slice(5, 7)) - 1 + k;
    return `${String(Math.floor(t / 12)).padStart(4, '0')}-${String(t % 12 + 1).padStart(2, '0')}`;
};
const pmap = (id) => built[id] ? new Map(built[id].pts) : new Map();
const FM = {
    cpi: pmap('CPIAUCSL'), core: pmap('CPILFESL'), ff: pmap('FEDFUNDS'), un: pmap('UNRATE'),
    curve: pmap('T10Y2Y'), ind: pmap('INDPRO'), pay: pmap('PAYEMS'), m2: pmap('M2SL'), mort: pmap('MORTGAGE30US'),
};
const featVec = (m) => {
    const ff6 = FM.ff.get(m) != null && FM.ff.get(ymAdd(m, -6)) != null ? FM.ff.get(m) - FM.ff.get(ymAdd(m, -6)) : null;
    const un12 = FM.un.get(m) != null && FM.un.get(ymAdd(m, -12)) != null ? FM.un.get(m) - FM.un.get(ymAdd(m, -12)) : null;
    const v = [FM.cpi.get(m), FM.core.get(m), FM.ff.get(m), ff6, FM.un.get(m), un12,
               FM.curve.get(m), FM.ind.get(m), FM.pay.get(m), FM.m2.get(m), FM.mort.get(m)];
    return v.every(x => x != null && isFinite(x)) ? v : null;
};
const allMonths = (built['FEDFUNDS']?.pts || []).map(p => p[0]);
const vecs = new Map(allMonths.map(m => [m, featVec(m)]).filter(([, v]) => v));
const months = [...vecs.keys()];
const analog = { pts: [], top: [] };
if (months.length > 120) {
    const todayM = months[months.length - 1];
    const dim = 11;
    const mean = Array(dim).fill(0), sd = Array(dim).fill(0);
    for (const m of months) vecs.get(m).forEach((x, i) => mean[i] += x / months.length);
    for (const m of months) vecs.get(m).forEach((x, i) => sd[i] += (x - mean[i]) ** 2 / months.length);
    sd.forEach((x, i) => sd[i] = Math.sqrt(x) || 1);
    const tv = vecs.get(todayM);
    const dists = months.map(m => {
        const v = vecs.get(m);
        let d = 0;
        for (let i = 0; i < dim; i++) d += ((v[i] - tv[i]) / sd[i]) ** 2;
        return [m, Math.sqrt(d / dim)];
    });
    const med = [...dists.map(x => x[1])].sort((a, b) => a - b)[Math.floor(dists.length / 2)] || 1;
    analog.pts = dists.map(([m, d]) => [m, Math.max(0, 100 * Math.exp(-0.693 * d / med))]); // median month scores 50
    // top analogs: exclude the last 24 months, keep picks >=18 months apart
    const cand = dists.filter(([m]) => monthsBetween(m, todayM) > 24).sort((a, b) => a[1] - b[1]);
    for (const [m, d] of cand) {
        if (analog.top.length >= 5) break;
        if (analog.top.some(t => Math.abs(monthsBetween(m, t.m)) < 18)) continue;
        const sim = Math.max(0, 100 * Math.exp(-0.693 * d / med));
        const within = recObs.some(o => o.v === 1 && (() => { const k = monthsBetween(m, ym(o.d)); return k > 0 && k <= 18; })());
        const fwd = (map, k) => { const a = map.get(m), b = map.get(ymAdd(m, k)); return (a != null && b != null) ? b - a : null; };
        analog.top.push({
            m, sim,
            then: { ff: FM.ff.get(m), cpi: FM.cpi.get(m), un: FM.un.get(m), curve: FM.curve.get(m) },
            next: { ff: fwd(FM.ff, 12), cpi: fwd(FM.cpi, 12), un: fwd(FM.un, 12) },
            rec: within,
        });
    }
}
const ERAS = [
    ['1976-01', '1979-09', 'Post-OPEC recovery; inflation quietly rebuilding'],
    ['1979-10', '1982-12', 'Volcker shock — rates to 20% to kill inflation; double-dip recessions'],
    ['1983-01', '1989-12', 'Long 80s expansion (1987 crash was a blip in the data)'],
    ['1990-01', '1991-12', 'S&L crisis + Gulf War oil spike recession'],
    ['1992-01', '1994-12', 'Jobless recovery, then the 1994 bond-market massacre'],
    ['1995-01', '1996-12', 'The famous soft landing'],
    ['1997-01', '2000-03', 'Dot-com boom; Asia crisis and LTCM scares along the way'],
    ['2000-04', '2002-12', 'Dot-com bust'],
    ['2003-01', '2007-06', 'Housing boom, cheap money'],
    ['2007-07', '2009-06', 'Global Financial Crisis'],
    ['2009-07', '2015-12', 'QE era — zero rates, slow healing'],
    ['2016-01', '2019-12', 'Late-cycle expansion, trade wars'],
    ['2020-01', '2020-12', 'COVID crash and reopening whiplash'],
    ['2021-01', '2022-02', 'Post-COVID inflation surge'],
    ['2022-03', '2023-12', 'Fastest hiking cycle since Volcker'],
    ['2024-01', '2026-12', 'Normalization and easing'],
];
const eraOf = (m) => (ERAS.find(([a, b]) => m >= a && m <= b) || [null, null, 'era unlabeled'])[2];
const realOilMap = new Map(built['DCOILWTICO_R']?.pts || []);
const realGoldMap = new Map(built['YH_GOLD_R']?.pts || []);
const realThen = (m) => {
    const parts = [];
    const ro = realOilMap.get(m), rg = realGoldMap.get(m);
    if (ro != null) parts.push(`real oil $${ro.toFixed(0)}`);
    if (rg != null) parts.push(`real gold $${rg.toFixed(0)}`);
    return parts.length ? ' · ' + parts.join(' · ') : '';
};

// ── payload for client-side charts ──────────────────────────────────────────
const payload = {
    rec: recBands,
    series: [
        ...SERIES.filter(s => built[s.id]).map(s => built[s.id]),
        ...Object.values(built).filter(s => s.derived), // BREADTH, WEALTHGAP
        ...Object.values(built).filter(s => s.group === 'real'),
    ],
};
if (analog.pts.length) {
    payload.series.unshift({
        id: 'ANALOG', label: 'Similarity to today (100 = identical conditions)', unit: '', dec: 0, group: 'analogx',
        pts: analog.pts, latest: analog.pts[analog.pts.length - 1][1], asOf: analog.pts[analog.pts.length - 1][0],
        d3: null, d12: null,
    });
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escA = (t) => esc(t).replace(/"/g, '&quot;'); // for attribute values

// ── auto desk note: rule-based synthesis ────────────────────────────────────
// Frozen reasoning: detects named macro "themes" from combinations of signals,
// flags the contradictions between them, and emits textbook play templates
// with tripwires. Blind to news and novelty by construction.
const S = (id) => built[id] || null;
const sectorChg = {};
for (const s of Object.values(built)) {
    if (s.group !== 'sector') continue;
    sectorChg[s.label] = { m1: pctDelta(s.pts, 1), m3: pctDelta(s.pts, 3) };
}
const sec1mRank = Object.entries(sectorChg).sort((a, b) => (b[1].m1 ?? -99) - (a[1].m1 ?? -99)).map(([k]) => k);
const inTop3_1m = (name) => sec1mRank.slice(0, 3).includes(name);
// Percent change over k months for any built series — lets the desk note check
// DIRECTION, not just how extreme a level is. A price can be historically high
// and falling at the same time; those need different words.
const chgOf = (id, k) => built[id] ? pctDelta(built[id].pts, k) : null;
const trendWord = (c) => c == null ? 'flat' : c > 3 ? 'rising' : c < -3 ? 'falling' : 'flat';
const rankOf = (name) => { const i = sec1mRank.indexOf(name); return i < 0 ? '—' : `${i + 1} of ${sec1mRank.length}`; };
// 1st/2nd/3rd/4th — percentiles appear in prose constantly.
const ord = (n) => {
    if (n == null) return '—';
    const v = Math.round(n), t = v % 100;
    if (t >= 11 && t <= 13) return `${v}th`;
    return `${v}${['th', 'st', 'nd', 'rd'][v % 10] || 'th'}`;
};

function theme(name, conds) {
    const met = conds.filter(c => c[1]);
    return { name, conds, met, score: conds.length ? met.length / conds.length : 0, active: met.length >= 2 && met.length / conds.length >= 0.5 };
}
const pOf = (id) => S(id)?.p ?? null;
// Live value for use inside signal labels — every line names its own number.
const V = (id, dec = 1, pre = '', post = '') => { const v = S(id)?.latest; return v == null ? '—' : pre + v.toFixed(dec) + post; };
const arrow = (d) => d == null ? '' : Math.abs(d) < 1e-9 ? '→' : d > 0 ? '▲' : '▼';
const fmtD = (d, dec) => d == null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(dec)}`;
const themes = [
    // Labels state the TEST plus the current reading, so they read correctly
    // whether they appear under the met list or the NOT YET list.
    theme('INFLATION IMPULSE', [
        [`gold in the top 10% of its own history after inflation — now ${ord(pReal('YH_GOLD') ?? pOf('YH_GOLD'))} percentile at ${V('YH_GOLD', 0, '$')}, ${fmtD(chgOf('YH_GOLD', 3), 0)}% over 3 months`, (pReal('YH_GOLD') ?? pOf('YH_GOLD')) >= 90],
        [`silver in the top 10% — now ${ord(pReal('YH_SILVER') ?? pOf('YH_SILVER'))} percentile at ${V('YH_SILVER', 1, '$')}, ${fmtD(chgOf('YH_SILVER', 3), 0)}% over 3 months`, (pReal('YH_SILVER') ?? pOf('YH_SILVER')) >= 90],
        [`copper in the top 10% — now ${ord(pReal('PCOPPUSDM') ?? pOf('PCOPPUSDM'))} percentile at ${V('PCOPPUSDM', 0, '$')}/tonne, ${fmtD(chgOf('PCOPPUSDM', 3), 0)}% over 3 months`, (pReal('PCOPPUSDM') ?? pOf('PCOPPUSDM')) >= 90],
        [`oil in the top 20% of its history — now only ${ord(pReal('DCOILWTICO') ?? pOf('DCOILWTICO'))} percentile at ${V('DCOILWTICO', 0, '$')}`, (pReal('DCOILWTICO') ?? pOf('DCOILWTICO')) >= 80],
        [`wheat or corn in the top 15% after inflation (food-price pressure) — now wheat ${ord(pReal('YH_ZW'))}, corn ${ord(pReal('YH_ZC'))}`, Math.max(pReal('YH_ZW') ?? -1, pReal('YH_ZC') ?? -1) >= 85],
        [`long-run inflation expectations in the top 20% — now ${V('T5YIFR', 2)}%, the ${ord(pOf('T5YIFR'))} percentile`, pOf('T5YIFR') >= 80],
        [`Eurozone inflation in the top 15% — now ${V('CP0000EZ19M086NEST')}%`, pOf('CP0000EZ19M086NEST') >= 85],
        [`energy among the 3 best sectors this month — now ranked ${rankOf('Energy')}`, inTop3_1m('Energy')],
        [`CPI inflation accelerating over the past year — now ${V('CPIAUCSL')}%, ${fmtD(S('CPIAUCSL')?.d12, 1)} points versus a year ago`, (S('CPIAUCSL')?.d12 ?? 0) > 0.3],
    ]),
    theme('TIGHT ECONOMY', [
        [`jobless claims among the lowest 15% on record — now ${V('ICSA', 0, '', 'k')} a week`, pOf('ICSA') != null && pOf('ICSA') <= 15],
        [`unemployment among the lowest 25% — now ${V('UNRATE')}%`, pOf('UNRATE') != null && pOf('UNRATE') <= 25],
        [`economy growing at least 3% — now ${V('GDPNOW')}% (Atlanta Fed estimate)`, (S('GDPNOW')?.latest ?? 0) >= 3],
        [`payrolls growing faster than 1.5% a year — now ${V('PAYEMS')}%`, (S('PAYEMS')?.latest ?? 0) > 1.5],
    ]),
    theme('COMPLACENT PRICING', [
        [`junk borrowing gap among the lowest 15% since 1996 — now ${V('BAMLH0A0HYM2', 2)}% over Treasuries, the ${ord(pOf('BAMLH0A0HYM2'))} percentile`, pOf('BAMLH0A0HYM2') != null && pOf('BAMLH0A0HYM2') <= 15],
        [`VIX among the calmest 30% of its history — now ${V('VIXCLS')}, the ${ord(pOf('VIXCLS'))} percentile, so not especially calm`, pOf('VIXCLS') != null && pOf('VIXCLS') <= 30],
        [`10-year minus 2-year Treasury yield not inverted — now ${V('T10Y2Y', 2)}%`, (S('T10Y2Y')?.latest ?? 0) >= 0],
    ]),
    theme('CONSUMER SQUEEZE', [
        [`sentiment among the lowest 10% since 1978 — now ${V('UMCSENT')}, the ${ord(pOf('UMCSENT'))} percentile`, pOf('UMCSENT') != null && pOf('UMCSENT') <= 10],
        [`...while unemployment stays among the lowest 35% — now ${V('UNRATE')}%`, pOf('UNRATE') != null && pOf('UNRATE') <= 35],
        [`30-year mortgage in the top 40% of its history — now ${V('MORTGAGE30US', 2)}%`, pOf('MORTGAGE30US') >= 60],
    ]),
    theme('CREDIT / VOL STRESS', [
        [`junk borrowing gap in the top 20% (lenders demanding much more) — now ${V('BAMLH0A0HYM2', 2)}%, the ${ord(pOf('BAMLH0A0HYM2'))} percentile`, pOf('BAMLH0A0HYM2') >= 80],
        [`VIX in the top 15% (fear spiking) — now ${V('VIXCLS')}, the ${ord(pOf('VIXCLS'))} percentile`, pOf('VIXCLS') >= 85],
        [`utilities or consumer staples among the 3 best sectors this month — now ranked ${rankOf('Utilities')} and ${rankOf('Consumer Staples')}`, inTop3_1m('Consumer Staples') || inTop3_1m('Utilities')],
    ]),
    theme('EASY MONEY', [
        [`Fed has cut more than 0.4 points over six months — actual change ${fmtD(fedDelta6, 2)} points, to ${V('FEDFUNDS', 2)}%`, (ff && fedDelta6 != null) ? fedDelta6 < -0.4 : false],
        [`Fed funds below its historical middle — now ${V('FEDFUNDS', 2)}%, the ${ord(pOf('FEDFUNDS'))} percentile`, pOf('FEDFUNDS') != null && pOf('FEDFUNDS') <= 50],
        [`money supply growth accelerating — now ${V('M2SL')}% a year, ${fmtD(S('M2SL')?.d12, 1)} points versus a year ago`, (S('M2SL')?.d12 ?? 0) > 1],
    ]),
    theme('LATE-CYCLE ROTATION', [
        [`tech down over the past month — actual ${fmtD(sectorChg['Technology']?.m1, 1)}%`, (sectorChg['Technology']?.m1 ?? 0) < 0],
        [`energy or banks among the 3 best sectors — now ranked ${rankOf('Energy')} and ${rankOf('Financials')}`, inTop3_1m('Energy') || inTop3_1m('Financials')],
        [`tech still up more than 5% across three months (so the shift is recent) — actual ${fmtD(sectorChg['Technology']?.m3, 1)}%`, (sectorChg['Technology']?.m3 ?? -99) > 5],
    ]),
    theme('FISCAL DOMINANCE', [
        [`federal debt in the top 10% of its own history — now ${V('GFDEGDQ188S')}% of GDP`, pOf('GFDEGDQ188S') >= 90],
        [`interest costs in the top 25% since 1940 — now ${V('FYOIGDA188S', 2)}% of GDP, the ${ord(pOf('FYOIGDA188S'))} percentile`, pOf('FYOIGDA188S') >= 75],
        [`Fed cutting rates while debt sits at extremes — Fed funds ${V('FEDFUNDS', 2)}%, six-month change ${fmtD(fedDelta6, 2)}`, pOf('GFDEGDQ188S') >= 90 && (ff && fedDelta6 != null ? fedDelta6 < 0 : false)],
        [`gold in the top 10% (distrust of currencies) — now ${ord(pReal('YH_GOLD') ?? pOf('YH_GOLD'))} percentile at ${V('YH_GOLD', 0, '$')}`, (pReal('YH_GOLD') ?? pOf('YH_GOLD')) >= 90],
        [`foreign-held share of US debt falling over the past year — actual change ${fmtD(S('FORSHARE')?.d12, 1)} points, now ${V('FORSHARE')}%`, (S('FORSHARE')?.d12 ?? 0) < -0.5],
    ]),
    theme('K-SHAPED ECONOMY', [
        [`top 1% wealth share in the top 10% of its history — now ${V('WFRBST01134')}%, the ${ord(pOf('WFRBST01134'))} percentile`, pOf('WFRBST01134') >= 90],
        [`bottom 50% share among its lowest 10% — now ${V('WFRBSB50215')}%, the ${ord(pOf('WFRBSB50215'))} percentile`, pOf('WFRBSB50215') != null && pOf('WFRBSB50215') <= 10],
        [`the gap between them in the top 10% of its history — now the top 1% hold ${V('WEALTHGAP')} times the entire bottom half, the ${ord(pOf('WEALTHGAP'))} percentile`, pOf('WEALTHGAP') >= 90],
        [`workers' share of output among its lowest 15% since 1947 — now ${V('PRS85006173')} (2017 = 100)`, pOf('PRS85006173') != null && pOf('PRS85006173') <= 15],
        [`stocks near highs while sentiment near lows — S&P at ${V('YH_SPX', 0)} (${ord(pOf('YH_SPX'))} percentile), sentiment ${V('UMCSENT')} (${ord(pOf('UMCSENT'))})`, pOf('YH_SPX') >= 85 && pOf('UMCSENT') != null && pOf('UMCSENT') <= 15],
        [`card delinquencies high while lenders stay relaxed — now ${V('DRCCLACBS', 2)}% delinquent (${ord(pOf('DRCCLACBS'))} percentile) against a ${V('BAMLH0A0HYM2', 2)}% lending gap`, pOf('DRCCLACBS') >= 60 && pOf('BAMLH0A0HYM2') != null && pOf('BAMLH0A0HYM2') <= 15],
    ]),
];
const active = themes.filter(t => t.active).sort((a, b) => b.score - a.score);
const has = (n) => active.some(t => t.name === n);

// Each entry writes its own sentence using today's actual numbers — name the
// indicator and its value, then the history, including the political events
// that mattered as much as the monetary ones.
const N = (id, dec = 1) => { const v = S(id)?.latest; return v == null ? '—' : v.toFixed(dec); };
const P = (id) => pOf(id) ?? '—';
const TENSIONS = [
    ['INFLATION IMPULSE', 'COMPLACENT PRICING', () =>
        `The high-yield credit spread is ${N('BAMLH0A0HYM2', 2)}% — that is the extra interest junk-rated companies pay over Treasuries, and it sits at the ${P('BAMLH0A0HYM2')}th percentile of its history since 1996, meaning lenders see almost no risk. At the same time gold is at $${N('YH_GOLD', 0)} (${P('YH_GOLD')}th percentile) and copper at the ${P('PCOPPUSDM')}th. Commodity buyers are paying up for protection against inflation; bond lenders are pricing calm. Spreads this tight in 1998, 2007 and 2019 all preceded blowouts where the spread went from under 4% to over 10% within months.`],
    ['CONSUMER SQUEEZE', 'TIGHT ECONOMY', () =>
        `Unemployment is ${N('UNRATE')}% and weekly jobless claims are ${N('ICSA', 0)}k, both near historic lows — yet consumer sentiment is ${N('UMCSENT')}, the ${P('UMCSENT')}th percentile since 1978. CPI inflation is running ${N('CPIAUCSL')}% and the 30-year mortgage is ${N('MORTGAGE30US', 2)}%. That combination usually means the problem is the cost of living, not unemployment: people have jobs but rent, groceries and borrowing cost more than their raises. It happened in 2022, and more severely in 1979-80, when unemployment was under 6% and sentiment hit its all-time low because CPI was 14%.`],
    ['EASY MONEY', 'INFLATION IMPULSE', () =>
        `The Fed has cut to ${N('FEDFUNDS', 2)}% while CPI runs ${N('CPIAUCSL')}% and gold sits at the ${P('YH_GOLD')}th percentile. The 1970s went the same way and it is worth being precise about what followed, because the monetary part is only half the story. Nixon ended the dollar's link to gold in 1971 and imposed wage-price controls; oil embargoes hit in 1973 and 1979; Arthur Burns's Fed cut from 13% to under 5% by 1976 with inflation near 5%, and inflation then ran to 14.8% by 1980. Volcker took rates to 20% and unemployment to 10.8% to break it. Then came the part that shaped the next forty years: the top income tax rate went from 70% to 50% in 1981 and to 28% by 1986, the air traffic controllers' strike was broken in 1981 and private-sector union membership fell from about 24% to 6%, and median wages stopped tracking productivity — which is where the wealth concentration in the charts above starts climbing. Gold went from $35 to $850 across that decade, but the durable change was who ended up owning the economy.`],
    ['LATE-CYCLE ROTATION', 'COMPLACENT PRICING', () =>
        `Technology stocks are down over the past month while energy and banks lead, but the high-yield spread is still ${N('BAMLH0A0HYM2', 2)}% and the VIX is ${N('VIXCLS')}. Stock investors are rotating toward safety; bond lenders have not moved. In 2000 and 2007 the sector rotation showed up months before credit spreads widened, so the stock market noticed first both times.`],
    ['FISCAL DOMINANCE', 'COMPLACENT PRICING', () =>
        `Federal debt is ${N('GFDEGDQ188S')}% of GDP and interest payments are ${N('FYOIGDA188S', 2)}% of GDP, the ${P('FYOIGDA188S')}th percentile since 1940 — yet the high-yield spread is ${N('BAMLH0A0HYM2', 2)}% and long-term Treasury yields carry little extra compensation for that risk. Bond markets ignore debt for years and then move all at once. In 1994 the Fed doubled rates from 3% to 6% and the bond market had its worst year on record, bankrupting Orange County. In September 2022 the UK announced unfunded tax cuts, gilt yields spiked so fast that pension funds faced collapse, and the Bank of England had to intervene within days.`],
    ['FISCAL DOMINANCE', 'INFLATION IMPULSE', () =>
        `Debt is ${N('GFDEGDQ188S')}% of GDP with CPI at ${N('CPIAUCSL')}%. Inflation is historically how debts this size actually shrink, because it reduces what the debt is worth in real terms while wages and tax receipts rise with prices. After 1946 the US owed 106% of GDP and never defaulted: the economy grew, inflation ran above the interest rates bondholders were being paid, and the top income tax rate stayed at 91% until 1964. All three did the work together. Worth doubting anyone who says the Fed will simply bring inflation back to 2% and keep it there while the debt math looks like this.`],
    ['K-SHAPED ECONOMY', 'TIGHT ECONOMY', () =>
        `Unemployment is ${N('UNRATE')}%, but the richest 1% hold ${N('WFRBST01134')}% of all wealth while the bottom half hold ${N('WFRBSB50215')}%, and credit card delinquencies are ${N('DRCCLACBS', 2)}%. A low unemployment rate says people have jobs; it says nothing about whether those jobs cover their costs. When national spending data looks healthy in this configuration, it is mostly measuring households that own assets.`],
    ['K-SHAPED ECONOMY', 'CONSUMER SQUEEZE', () =>
        `Sentiment is ${N('UMCSENT')} while the top 1% hold ${N('WFRBST01134')}% of wealth and stocks sit near record highs. Roughly the top tenth of earners account for close to half of all consumer spending, so total spending can hold up on their strength alone while everyone else cuts back. The thing that has historically ended that split is layoffs, because it takes away the income of the people already stretched. Watch jobless claims, currently ${N('ICSA', 0)}k.`],
];
const tensions = TENSIONS.filter(([a, b]) => has(a) && has(b)).map(([a, b, fn]) => [a, b, fn()]);

// Live tripwire levels computed from current values
const claimsNow = S('ICSA')?.latest;                          // thousands
const claimsTrig = claimsNow ? Math.round(claimsNow * 1.18) : null;
const hyNow = S('BAMLH0A0HYM2')?.latest;
const hyTrig = hyNow != null ? (hyNow + 1).toFixed(1) : null;
const sentNow = S('UMCSENT')?.latest;
const sentTrig = sentNow != null ? Math.round(sentNow + 10) : null;
const ffNow = S('FEDFUNDS')?.latest;

const PLAYS = [];
if (has('INFLATION IMPULSE')) {
    // A commodity only "confirms" if it is BOTH historically expensive AND still
    // rising. Vehicles are only named if the ETF itself is holding up — miners
    // falling while the metal is high is a warning, not an entry.
    const conf = (id) => (pReal(id) ?? pOf(id) ?? 0) >= 85 && (chgOf(id, 3) ?? -99) > -3;
    const metalsOn = conf('YH_GOLD') || conf('YH_SILVER') || conf('PCOPPUSDM');
    const oilOn = (pReal('DCOILWTICO') ?? pOf('DCOILWTICO') ?? 0) >= 70 && (chgOf('DCOILWTICO', 3) ?? -99) > -3;
    const grainsOn = conf('YH_ZW') || conf('YH_ZC');
    const vehicleOk = (id) => (chgOf(id, 3) ?? -99) > -3;
    const vehicles = [
        metalsOn && (vehicleOk('YH_XME') || vehicleOk('YH_GDX') || vehicleOk('YH_XLB'))
            ? 'mining and materials shares: ' + [['YH_XME', 'XME'], ['YH_GDX', 'GDX'], ['YH_XLB', 'XLB']].filter(([id]) => vehicleOk(id)).map(([, t]) => t).join(', ') : null,
        oilOn && (vehicleOk('YH_XLE') || vehicleOk('YH_XOP')) ? 'energy shares: XLE, XOP' : null,
        grainsOn ? 'agriculture exposure' : null,
    ].filter(Boolean).join('; ');
    // Where the shares disagree with the commodity, say so plainly.
    const divergences = [
        (pReal('YH_GOLD') ?? 0) >= 85 && (chgOf('YH_GDX', 3) ?? 0) < -5
            ? `gold is historically expensive but gold-mining shares (GDX) are down ${Math.abs(chgOf('YH_GDX', 3)).toFixed(0)}% over three months and ${Math.abs(chgOf('YH_GDX', 6) ?? 0).toFixed(0)}% over six, so equity investors are betting the metal price does not hold` : null,
        (pReal('PCOPPUSDM') ?? 0) >= 85 && (chgOf('YH_XME', 3) ?? 0) < -5
            ? `copper is still climbing while mining shares (XME) are down ${Math.abs(chgOf('YH_XME', 3)).toFixed(0)}% over three months, which usually means rising costs or doubt about the price lasting` : null,
    ].filter(Boolean).join('; ');
    // Same yardstick for every commodity: inflation-adjusted level percentile
    // and inflation-adjusted 12-month change, so the comparison is visibly fair.
    const realChg12 = (id) => built[id + '_R'] ? pctDelta(built[id + '_R'].pts, 12) : null;
    // Both windows, because a 3-month reading can call something "falling" when
    // it bottomed weeks ago and has already turned.
    const turns = [];
    const scoreboard = [['YH_GOLD', 'gold'], ['YH_SILVER', 'silver'], ['PCOPPUSDM', 'copper'], ['DCOILWTICO', 'oil'], ['YH_ZW', 'wheat'], ['YH_ZC', 'corn']]
        .map(([id, name]) => {
            const p = pReal(id), c3 = chgOf(id, 3), c1 = chgOf(id, 1);
            if (p == null) return null;
            if (c3 != null && c1 != null && c3 < -3 && c1 > 3) turns.push(`${name} has turned back up (${fmtD(c1, 0)}% in the past month after ${fmtD(c3, 0)}% over three)`);
            return `${name}: ${ord(p)} percentile on price, ${fmtD(c3, 0)}% over 3 months, ${fmtD(c1, 0)}% over the past month`;
        }).filter(Boolean).join('; ');
    const anyConfirmed = metalsOn || oilOn || grainsOn;
    PLAYS.push([anyConfirmed ? 'Own only the commodities that are expensive AND still climbing' : 'Commodities are expensive but no longer climbing — that is not the same thing',
        `When money is losing value, physical things have historically held value better than cash. But "historically expensive" and "going up right now" are two different measurements, and mixing them up is how people buy the top. Both are shown below: how the price compares with its own full history after adjusting for inflation, and which way it has actually moved, over three months and over the past month. ${scoreboard}. ${turns.length ? 'RECENTLY TURNED: ' + turns.join('; ') + '. A three-month number can call something falling when it bottomed weeks ago, so treat the shorter window as the newer information. ' : ''}${divergences ? 'WORTH NOTICING: ' + divergences + '. When mining shares fall while the metal stays high, the shares have historically been the better predictor of where the metal goes next, because miners live or die on the price they will get next year rather than today. ' : ''}Ways to own the ones still working: ${vehicles || 'none right now, because the shares tied to these commodities are all falling'}. Ordinary stock ETFs avoid the borrowed-money risk of futures contracts. ONE LIMITATION: this uses monthly averages, so a sharp move in the last week or two shows up late. Check the live prices in Commodities above if something is happening in the news. SIGNS THIS IS OVER: technology and consumer stocks lead the market two weeks running, or the metals drop below the top 10% of their own inflation-adjusted history.`]);
}
if (has('COMPLACENT PRICING')) PLAYS.push(['Get paid to wait, and buy protection while it is cheap',
    `Junk-rated companies currently pay only ${hyNow != null ? hyNow.toFixed(2) + '%' : '—'} more than the government to borrow. When that gap has been this small, the following few years delivered below-average returns, because investors were being paid almost nothing for taking risk. The textbook response is to keep most money in short-term Treasuries or a money-market fund${ffNow != null ? `, currently paying about ${ffNow.toFixed(1)}%` : ''}, and put a small amount in longer-term government bonds, which tend to rise when stocks fall. To be precise about who is calm here: it is lenders, not stock traders. That ${hyNow != null ? hyNow.toFixed(2) + '%' : ''} lending gap is at the ${ord(pOf('BAMLH0A0HYM2'))} percentile since 1996, meaning bond investors see almost no chance of companies defaulting, while the VIX at ${S('VIXCLS') ? S('VIXCLS').latest.toFixed(1) : '—'} sits around the middle of its own range, so the stock market is not unusually relaxed. Protection against a credit event is priced cheaply precisely because lenders have stopped worrying. WHAT WOULD SAY MOVE MORE MONEY TO THE SAFE SIDE: weekly jobless claims above ${claimsTrig ?? '—'}k, versus ${claimsNow != null ? Math.round(claimsNow) + 'k' : '—'} now (that is the level where past labor markets had genuinely turned)${hyTrig ? `, or the lending gap widening past ${hyTrig}%, because that means lenders have started pricing real default risk` : ''}. SEPARATELY, WHAT WOULD SAY TAKE MORE RISK: consumer sentiment climbing above ${sentTrig ?? '—'} from ${sentNow != null ? sentNow.toFixed(1) : '—'}, since gloom lifting while people still have jobs has historically been a good time to own stocks.`]);
if (has('CREDIT / VOL STRESS')) PLAYS.push(['Buy into the panic gradually, never all at once',
    'Fear spikes and credit blowups have historically happened near market bottoms, not tops. The textbook approach is a written schedule (set dates, set amounts) buying broad, high-quality investments such as S&P 500 index funds and investment-grade bond funds. The reason to spread purchases out is simple: panics often get worse before they end, and nobody calls the bottom.']);
if (has('CONSUMER SQUEEZE') && !has('CREDIT / VOL STRESS')) PLAYS.push(['A terrible mood alone has not been a reason to hide',
    `When people felt this bad but the job market was still intact, buying a fixed amount of a broad index every month historically worked better than sitting out, because the gloom was already reflected in prices. A reason to move faster would be sentiment turning up${sentTrig ? ` (above roughly ${sentTrig})` : ''} while jobless claims stay low.`]);
if (has('FISCAL DOMINANCE')) PLAYS.push(['How governments have actually worked off debts this large',
    `Debt is ${S('GFDEGDQ188S') ? S('GFDEGDQ188S').latest.toFixed(0) + '% of GDP' : 'at extremes'} and interest costs ${S('FYOIGDA188S') ? S('FYOIGDA188S').latest.toFixed(2) + '% of GDP' : 'are high'}. After World War 2 the US owed 106% of GDP and never defaulted or cut spending sharply. Three things did the work: the economy grew fast, inflation ran above the interest rates bondholders were paid (which quietly transferred money from lenders to the government), and the top income tax rate stayed at 91% until 1964 while corporate taxes funded roughly a third of federal revenue. Debt fell to 23% by 1974. If something similar plays out now, the lessons are: gold and real assets tend to do well, short-term Treasuries handle inflation far better than long-term bonds because they reprice every few months while a 30-year bond eats the loss, inflation-protected Treasuries beat regular ones, and confident claims that the Fed will return inflation to 2% and hold it there deserve doubt. Note what is different this time: the top tax rate is 37%, not 91%, so either the tax side eventually changes or inflation and growth carry more of the load. SIGNS THIS IS OVER: the deficit genuinely shrinking, or interest costs falling for two years or more.`]);
if (has('K-SHAPED ECONOMY')) PLAYS.push(['Watch the stock market to predict consumer spending',
    `The richest 1% hold ${S('WFRBST01134') ? S('WFRBST01134').latest.toFixed(1) + '%' : 'a record share'} of US wealth and roughly the top tenth of earners account for close to half of all consumer spending. That flips the usual logic: the stock market becomes an early warning for consumer spending, because when portfolios fall those households cut back within a few months. It also means headlines about a resilient consumer, built on national averages, mostly describe people who own assets. Worth watching: expensive brands and deep-discount chains hold up better than mid-market retailers, and credit card delinquencies (${S('DRCCLACBS') ? S('DRCCLACBS').latest.toFixed(2) + '%' : 'tracked above'}) give the earliest sign that lower-income households are breaking. History says concentration this extreme eventually produces a political response rather than continuing indefinitely: the last comparable peak was 1929, and what followed was the New Deal, top tax rates above 90%, and mass unionization. The reversal after 1980 came the same way, through policy — the top rate falling from 70% to 28% and union membership collapsing. So tariffs, transfers and tax changes belong in the base case, not the tail. SIGNS THIS IS OVER: workers' share of output rising and the wealth gap narrowing for two quarters or more.`]);
if (has('EASY MONEY') && !has('INFLATION IMPULSE')) PLAYS.push(['The friendly setup: rate cuts without inflation',
    'Rate cuts when inflation is not a problem is historically the easiest environment for investors. What has typically led from here: longer-term government bonds, and the stocks most helped by cheaper borrowing, such as banks, regional banks, and homebuilders. All of those are tracked in the Industries table below.']);
if (!PLAYS.length) PLAYS.push(['Nothing worth doing right now',
    'No strong pattern in the data at the moment. The textbook answer for that is boring on purpose: stay broadly invested, keep cash earning interest, and wait until the numbers actually say something.']);
const deskPlays = PLAYS.slice(0, 2);

// Value color: judged against the series' OWN history (percentile), with
// direction from DIR. Neutral series stay amber. Extremes get a ◆ marker.
const valColor = (s) => {
    const d = DIR[s.id];
    if (!d || s.p == null) return 'var(--accent)';
    const highSide = s.p >= 70, lowSide = s.p <= 30;
    if (!highSide && !lowSide) return 'var(--accent)';
    const isBad = (d === 'bad') === highSide;
    return isBad ? 'var(--bad)' : 'var(--good)';
};
const extreme = (s) => s.p != null && (s.p >= 90 || s.p <= 10);

const cells = (group) => payload.series.filter(s => s.group === group).map(s => `
    <div class="cell" style="${extreme(s) ? 'box-shadow:inset 0 0 0 1px var(--warn);' : ''}" title="${esc(s.label)} — latest ${s.latest.toFixed(s.dec)}${s.unit}, 3-month change ${fmtD(s.d3, s.dec)}, 12-month change ${fmtD(s.d12, s.dec)}. ${s.p != null ? `At the ${ord(s.p)} percentile of its own history since ${s.since}.` : ''} As of ${s.asOf}.">
        <div class="cell-label">${esc(s.label)}${s.stale ? ' <span class="stale">as of ' + s.asOf + '</span>' : ''}</div>
        <div class="cell-value" style="color:${valColor(s)};">${s.unit === '$' ? '$' : ''}${s.latest.toFixed(s.dec)}${s.unit !== '$' ? s.unit : ''}${extreme(s) ? ' <span style="color:var(--warn);">◆' + s.p + '</span>' : ''}
            <span class="trend">${arrow(s.d3)}3m ${arrow(s.d12)}12m</span></div>
    </div>`).join('');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="1800"><title>Macro Monitor — Real World</title>
<style>
:root { --bg:#16150f; --panel:#1e1c14; --panel2:#232013; --line:#37331f; --ink:#e6e1d3;
  --muted:#9d9683; --accent:#e8b23c; --good:#4aa869; --bad:#d65344; --warn:#bd8a1e; --chart:#4489c8; }
* { box-sizing:border-box; }
body { background:var(--bg); color:var(--ink); font-family:Consolas,'Cascadia Mono',monospace; margin:0; padding:18px; font-size:13px; }
.wrap { max-width:1200px; margin:0 auto; }
h1 { font-size:18px; letter-spacing:1px; margin:0; }
.hdr { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.regime { border:1px solid; padding:2px 12px; border-radius:10px; font-weight:700; }
.regime.good{color:var(--good);border-color:var(--good);} .regime.warn{color:var(--warn);border-color:var(--warn);}
.regime.bad{color:var(--bad);border-color:var(--bad);} .regime.muted{color:var(--muted);border-color:var(--muted);}
h2 { font-size:12px; letter-spacing:2px; color:var(--accent); text-transform:uppercase; border-bottom:1px solid var(--line); padding-bottom:4px; margin:22px 0 8px; }
.cells { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:1px; background:var(--line); border-radius:6px; overflow:hidden; }
.cell { background:var(--panel); padding:7px 10px; cursor:help; }
.cell-label { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
.cell-value { color:var(--accent); font-weight:700; font-size:15px; }
.trend { color:var(--muted); font-weight:400; font-size:11px; margin-left:6px; }
.stale { color:var(--bad); text-transform:none; }
.chips { display:flex; flex-wrap:wrap; gap:8px; }
.chip { border:1px solid var(--line); color:var(--muted); border-radius:6px; padding:4px 10px; cursor:help; }
.chip.on { border-color:var(--bad); color:var(--bad); font-weight:700; }
.range { margin-left:auto; display:flex; gap:4px; }
.range button { background:var(--panel2); color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:2px 10px; font:inherit; cursor:pointer; }
.range button.on { color:var(--accent); border-color:var(--accent); }
.charts { display:grid; grid-template-columns:repeat(auto-fill,minmax(360px,1fr)); gap:10px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:8px 10px 4px; }
.card h3 { margin:0 0 2px; font-size:12px; color:var(--ink); font-weight:600; }
.card .sub { color:var(--muted); font-size:11px; }
.rules { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:10px; }
.rule { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:8px 12px; }
.rule b { color:var(--accent); display:block; margin-bottom:3px; }
.rule p { margin:0; color:var(--ink); line-height:1.5; font-size:12px; }
svg { display:block; width:100%; }
.tip { position:fixed; pointer-events:none; background:#000; border:1px solid var(--accent); color:var(--ink);
  padding:3px 8px; border-radius:4px; font-size:12px; display:none; z-index:9; }
table { border-collapse:collapse; width:100%; font-size:12px; }
th,td { border-bottom:1px solid var(--line); padding:4px 8px; text-align:right; }
th { color:var(--muted); text-transform:uppercase; font-size:10px; letter-spacing:.5px; }
td:first-child,th:first-child { text-align:left; }
footer { color:var(--muted); margin-top:24px; font-size:11px; line-height:1.6; border-top:1px solid var(--line); padding-top:10px; }
details summary { cursor:pointer; color:var(--muted); margin:14px 0 6px; }
</style></head><body><div class="wrap">
<div class="hdr">
  <h1>MACRO MONITOR <span style="color:var(--muted)">— real world · <a href="screener.html" style="color:var(--accent)">value screener →</a></span></h1>
  <span style="display:flex;gap:10px;align-items:center;">
    <span id="built" style="font-size:11px;color:var(--muted);" title="When this page was last rebuilt. Green = fresh (hourly task healthy). Red = the task may have stopped — run run.ps1 or: schtasks /run /tn MacroMonitor"></span>
    <span class="regime ${regimeTone}">${esc(regimeLabel)}</span>
  </span>
</div>
<div class="chips">
  ${chips.map(([label, on, tip]) => `<span class="chip ${on ? 'on' : ''}" title="${esc(tip)}">${on ? '● ' : '○ '}${esc(label)}</span>`).join('')}
</div>
${(() => {
    const ex = payload.series.filter(s => ['us', 'mkt', 'world'].includes(s.group) && extreme(s))
        .sort((a, b) => Math.min(a.p, 100 - a.p) - Math.min(b.p, 100 - b.p));
    const note = (s) => {
        const n = EXTREME_NOTES[s.id];
        if (!n) return 'No canned note for this one — that itself is a research prompt.';
        return s.p >= 90 ? (n.high || 'Historically rare highs.') : (n.low || 'Historically rare lows.');
    };
    const play = (s) => {
        const n = EXTREME_NOTES[s.id];
        if (!n) return null;
        return s.p >= 90 ? (n.playHigh || null) : (n.playLow || null);
    };
    return `<h2>Extremes Watch <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— indicators in the top/bottom 10% of their own history. "Textbook" lines are how long/short playbooks historically framed the spot — educational framing, not recommendations.</span></h2>
<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;">
${ex.length === 0 ? '<div style="padding:8px 12px;color:var(--muted);">Nothing at historical extremes today — a mid-range macro month. The unusual will announce itself here.</div>'
    : ex.map(s => `<div style="padding:6px 12px;border-bottom:1px solid var(--line);">
        <div style="display:flex;gap:10px;align-items:baseline;">
            <span style="color:var(--warn);font-weight:700;white-space:nowrap;">◆ ${ord(s.p)} pctile</span>
            <span style="color:var(--ink);white-space:nowrap;font-weight:600;">${esc(s.label)} = ${s.latest.toFixed(s.dec)}${esc(s.unit)}</span>
            <span style="color:var(--muted);">${s.p >= 90 ? 'higher' : 'lower'} than ${s.p >= 90 ? s.p : 100 - s.p}% of every month since ${s.since}. ${esc(note(s))}${built[s.id + '_R'] ? ` INFLATION-ADJUSTED: ${ord(built[s.id + '_R'].p)} percentile of real history — ${built[s.id + '_R'].p >= 85 ? 'extreme even in today\'s dollars.' : built[s.id + '_R'].p >= 60 ? 'elevated but not unprecedented in real terms.' : 'ordinary in real terms — the nominal record is mostly inflation.'}` : ''}</span>
        </div>
        ${play(s) ? `<div style="margin:3px 0 1px 24px;color:var(--good);font-size:12px;">${esc(play(s))}</div>` : ''}
    </div>`).join('')}
</div>`;
})()}
<h2>Auto Desk Note <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— what everything on this page adds up to, worked out by fixed rules. It only sees the numbers above: no news, no headlines, nothing that happened today. Educational, not advice.</span></h2>
<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:4px 0;">
${active.length === 0 ? '<div style="padding:8px 12px;color:var(--muted);">No strong macro theme detected — a mid-regime board.</div>' : ''}
${active.map(t => {
    const missing = t.conds.filter(c => !c[1]);
    return `<div style="padding:5px 12px;border-bottom:1px solid var(--line);">
    <span style="color:var(--accent);font-weight:700;">${esc(t.name)}</span>
    <span style="color:var(--muted);"> (${t.met.length}/${t.conds.length} signals)</span>
    <span style="color:var(--ink);"> — ${t.met.map(c => esc(c[0])).join('; ')}</span>
    ${missing.length ? `<div style="color:#6f6a5a;margin-top:2px;">NOT YET: ${missing.map(c => esc(c[0])).join('; ')}</div>` : ''}
</div>`; }).join('')}
${(() => {
    const dormant = themes.filter(t => !t.active);
    if (!dormant.length) return '';
    return `<div style="padding:5px 12px;border-bottom:1px solid var(--line);color:#6f6a5a;">
    <span style="font-weight:700;">NOT FIRING</span> — ${dormant.map(t => `${esc(t.name)} (${t.met.length}/${t.conds.length})`).join(', ')}. These need at least half their signals to appear above.</div>`;
})()}
${tensions.map(([a, b, txt]) => `<div style="padding:5px 12px;border-bottom:1px solid var(--line);">
    <div><span style="color:var(--bad);font-weight:700;">DOESN'T ADD UP</span>
    <span style="color:var(--muted);"> ${esc(a)} vs ${esc(b)}</span></div>
    <div style="color:var(--ink);">${esc(txt)}</div>
</div>`).join('')}
${deskPlays.map(([title, body], i) => `<div style="padding:6px 12px;${i < deskPlays.length - 1 ? 'border-bottom:1px solid var(--line);' : ''}">
    <span style="color:var(--good);font-weight:700;">WHAT THE TEXTBOOKS SAY ${i + 1}: ${esc(title)}</span>
    <div style="color:var(--ink);margin-top:2px;">${esc(body)}</div>
</div>`).join('')}
</div>
${(() => {
    let db = null;
    try { db = JSON.parse(readFileSync(new URL('./forecasts.json', import.meta.url), 'utf8')); } catch (_) {}
    if (!db?.forecasts?.length) return `<h2>Forecast Journal</h2>
<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px;color:var(--muted);">
The board writes its own questions — they appear before FOMC decisions and jobs reports, and whenever an indicator hits a historic extreme. Nothing pending right now.</div>`;
    const questions = db.forecasts.filter(f => f.outcome == null && f.p == null);
    const open = db.forecasts.filter(f => f.outcome == null && f.p != null);
    const done = db.forecasts.filter(f => f.outcome != null);
    const brier = done.length ? done.reduce((s, f) => s + (f.p - f.outcome) ** 2, 0) / done.length : null;
    const hit = done.length ? done.filter(f => (f.p >= 0.5) === (f.outcome === 1)).length : 0;
    // Claude answers the same questions (claudeP) — head-to-head scoreboard.
    const cdone = done.filter(f => f.claudeP != null);
    const cBrier = cdone.length ? cdone.reduce((s, f) => s + (f.claudeP - f.outcome) ** 2, 0) / cdone.length : null;
    const cHit = cdone.length ? cdone.filter(f => (f.claudeP >= 0.5) === (f.outcome === 1)).length : 0;
    const brierColor = (b) => b == null ? 'var(--muted)' : b < 0.2 ? 'var(--good)' : b < 0.28 ? 'var(--warn)' : 'var(--bad)';
    const liveVal = (f) => {
        if (!f.resolve) return '';
        const s = built[f.resolve.series];
        return s ? ` · now: ${s.latest.toFixed(s.dec)}${s.unit} vs ${f.resolve.op} ${f.resolve.value}` : '';
    };
    const daysLeft = (d) => Math.max(0, Math.round((Date.parse(d) - Date.now()) / 86400e3));
    return `<h2>Forecast Journal <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— the board asks, you answer, the machine scores. Brier: 0 = prophet, 0.25 = coin flips at 50%.</span></h2>
<div id="fc-filehint" style="background:var(--panel);border:1px solid var(--warn);border-radius:6px;padding:8px 12px;margin-bottom:8px;color:var(--warn);">
You've opened the dashboard as a plain file, so the answer buttons are hidden.
<a href="http://localhost:8787/" style="color:var(--accent);font-weight:700;">Click here to open it properly</a> — same page, but your picks can be saved.</div>
<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;">
<div style="display:flex;gap:18px;padding:6px 12px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;align-items:center;">
    ${questions.length ? `<span style="color:var(--accent);font-weight:700;">Awaiting your answer: ${questions.length}</span>` : ''}
    <span>Resolved: <b style="color:var(--accent);">${done.length}</b></span>
    <span>You: <b style="color:${brierColor(brier)};">${brier != null ? 'Brier ' + brier.toFixed(3) : '—'}</b>${done.length ? ` <span style="color:var(--muted);">(hit ${Math.round(hit / done.length * 100)}%)</span>` : ''}</span>
    ${cdone.length || open.some(f => f.claudeP != null) || questions.some(f => f.claudeP != null) ? `<span>Claude: <b style="color:${brierColor(cBrier)};">${cBrier != null ? 'Brier ' + cBrier.toFixed(3) : '—'}</b>${cdone.length ? ` <span style="color:var(--muted);">(hit ${Math.round(cHit / cdone.length * 100)}%)</span>` : ''}</span>` : ''}
    <span style="color:var(--muted);">Open: ${open.length}</span>
    <a id="fc-toggle" href="#" style="display:none;color:var(--muted);margin-left:auto;font-size:11px;">+ custom call</a>
</div>
${questions.map(f => `<div style="padding:8px 12px;border-bottom:1px solid var(--line);background:rgba(232,178,60,0.05);">
    <div><span style="color:var(--accent);font-weight:700;">ASK</span>
    <span style="color:var(--ink);"> ${esc(f.question)}?</span>
    <span style="color:var(--muted);"> — ${esc(f.why || '')} Answer by ${f.askBy || f.deadline}.</span></div>
    <div class="fc-q" data-id="${f.id}" style="display:none;align-items:center;gap:10px;margin-top:6px;">
        <span style="color:var(--bad);font-size:11px;">NO</span>
        <input type="range" min="1" max="99" value="50" style="flex:1;max-width:260px;accent-color:var(--accent);">
        <span style="color:var(--good);font-size:11px;">YES</span>
        <b class="fc-qp" style="color:var(--accent);min-width:40px;font-variant-numeric:tabular-nums;">50%</b>
        <button class="fc-lock" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:2px 12px;font:inherit;font-size:12px;cursor:pointer;">Lock it in</button>
        <button class="fc-pass" style="background:none;border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer;">Pass</button>
    </div>
</div>`).join('')}
${open.map(f => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const editable = (f.askBy || f.deadline) >= todayISO;
    return `<div style="padding:5px 12px;border-bottom:1px solid var(--line);">
    <span style="color:var(--accent);font-weight:700;">${Math.round(f.p * 100)}%</span>${f.claudeP != null ? `<span style="color:var(--muted);font-size:11px;${f.claudeWhy ? 'cursor:help;border-bottom:1px dotted var(--muted);' : ''}"${f.claudeWhy ? ` title="${escA(f.claudeWhy)}"` : ''}> vs Claude ${Math.round(f.claudeP * 100)}%</span>` : ''}
    <span style="color:var(--ink);"> ${esc(f.question)}</span>
    <span style="color:var(--muted);"> — by ${f.deadline} (${daysLeft(f.deadline)}d left)${esc(liveVal(f))}${f.resolve ? '' : ' · manual'}</span>
    <span class="fc-ctl" data-id="${f.id}" data-manual="${f.resolve ? 0 : 1}" style="float:right;display:none;gap:6px;"></span>
    ${editable ? `<div class="fc-edit" data-id="${f.id}" style="display:none;align-items:center;gap:10px;margin-top:6px;">
        <span style="color:var(--bad);font-size:11px;">NO</span>
        <input type="range" min="1" max="99" value="${Math.round(f.p * 100)}" style="flex:1;max-width:260px;accent-color:var(--accent);">
        <span style="color:var(--good);font-size:11px;">YES</span>
        <b class="fc-qp" style="color:var(--accent);min-width:40px;font-variant-numeric:tabular-nums;">${Math.round(f.p * 100)}%</b>
        <button class="fc-save" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:2px 12px;font:inherit;font-size:12px;cursor:pointer;">Save</button>
        <button class="fc-cancel" style="background:none;border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer;">Cancel</button>
        <span style="color:var(--muted);font-size:11px;">editable until ${f.askBy || f.deadline}</span>
    </div>` : ''}
</div>`; }).join('')}
<div id="fc-form" style="display:none;padding:8px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:6px;align-items:center;">
    <input id="fq" placeholder="Falsifiable question…" style="flex:1;min-width:220px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px 8px;font:inherit;">
    <input id="fp" type="number" min="1" max="99" placeholder="%" style="width:56px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px;font:inherit;">
    <input id="fd" type="date" style="background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:3px;font:inherit;">
    <select id="fs" style="background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px;font:inherit;">
        <option value="">manual resolve</option>
        ${payload.series.filter(s => !s.id.endsWith('_R') && s.id !== 'ANALOG').map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}
    </select>
    <select id="fo" style="background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px;font:inherit;"><option>&gt;</option><option>&lt;</option></select>
    <input id="fv" type="number" step="any" placeholder="value" style="width:80px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px;font:inherit;">
    <select id="fm" style="background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px;font:inherit;"><option value="any">any print</option><option value="final">at deadline</option></select>
    <button id="fadd" style="background:var(--panel2,#232013);color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:4px 12px;font:inherit;cursor:pointer;">Log it</button>
</div>
${done.slice(-8).reverse().map(f => `<div style="padding:5px 12px;border-bottom:1px solid var(--line);">
    <span style="color:${f.outcome ? 'var(--good)' : 'var(--bad)'};font-weight:700;">${f.outcome ? 'YES' : 'NO'}</span>
    <span style="color:var(--muted);"${f.claudeWhy ? ` title="${escA(f.claudeWhy)}"` : ''}> (you ${Math.round(f.p * 100)}%${f.claudeP != null ? ` · Claude ${Math.round(f.claudeP * 100)}%` : ''})</span>
    <span style="color:var(--ink);"> ${esc(f.question)}</span>
    <span style="color:var(--muted);"> — Brier you ${((f.p - f.outcome) ** 2).toFixed(3)}${f.claudeP != null ? ` · Claude ${((f.claudeP - f.outcome) ** 2).toFixed(3)}` : ''}, resolved ${f.resolvedOn}</span>
</div>`).join('')}
</div>`;
})()}
<h2>US Economy</h2><div class="cells">${cells('us')}</div>
${payload.series.some(s => s.group === 'ineq') ? `<h2>Wealth &amp; Inequality <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— the slow structural dials: who holds the wealth shapes how every fast indicator behaves</span></h2>
<div class="cells">${cells('ineq')}</div>` : ''}
${(() => {
    let debt = null;
    try { debt = JSON.parse(readFileSync(new URL('./debt.json', import.meta.url), 'utf8')); } catch (_) {}
    const hasCells = payload.series.some(s => s.group === 'debt');
    if (!debt && !hasCells) return '';
    const forS = built['FORSHARE']?.latest, fedS = built['FEDSHARE']?.latest;
    const split = (forS != null && fedS != null)
        ? `<div style="background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 12px;margin-bottom:10px;">
           <span style="color:var(--muted);">Who holds the $${(built['FORSHARE'] ? (load('GFDEBTN') ? (toMonthly(load('GFDEBTN')).slice(-1)[0][1] / 1e6).toFixed(1) : '?') : '?')}T of US federal debt:</span>
           <b style="color:var(--accent);"> Federal Reserve ${fedS.toFixed(1)}%</b> ·
           <b style="color:var(--accent);">foreign investors ${forS.toFixed(1)}%</b> ·
           <b style="color:var(--accent);">domestic (incl. gov trust funds) ${(100 - forS - fedS).toFixed(1)}%</b></div>` : '';
    // World table: G20-ish majors plus the global extremes, sorted by burden
    const MAJORS = new Set(['USA', 'JPN', 'CHN', 'DEU', 'GBR', 'FRA', 'ITA', 'CAN', 'IND', 'BRA', 'RUS', 'KOR', 'AUS', 'MEX', 'IDN', 'TUR', 'SAU', 'ARG', 'ZAF', 'ESP', 'NLD', 'CHE', 'SGP', 'GRC', 'EGY', 'PAK']);
    const rows = debt?.imf ? [...debt.imf.filter(c => MAJORS.has(c.code)), ...debt.imf.filter(c => !MAJORS.has(c.code)).slice(0, 3)].sort((a, b) => b.latest - a.latest) : [];
    const lvlColor = (v) => v >= 100 ? 'var(--bad)' : v >= 60 ? 'var(--warn)' : 'var(--good)';
    const world = rows.length ? `<div class="tablewrap" style="border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow-x:auto;margin-bottom:10px;">
<table><thead><tr><th>Country</th><th>Gov Debt / GDP</th><th>10y change</th><th>IMF path</th></tr></thead><tbody>
${rows.map(c => `<tr${c.code === 'USA' ? ' style="background:rgba(232,178,60,0.07);"' : ''}>
  <td style="text-align:left;color:${c.code === 'USA' ? 'var(--accent)' : 'var(--ink)'};">${esc(c.name)}</td>
  <td style="color:${lvlColor(c.latest)};font-variant-numeric:tabular-nums;">${c.latest.toFixed(0)}% <span style="color:var(--muted);">(${c.year})</span></td>
  <td style="color:${c.chg10 == null ? 'var(--muted)' : c.chg10 > 0 ? 'var(--bad)' : 'var(--good)'};font-variant-numeric:tabular-nums;">${c.chg10 == null ? '—' : (c.chg10 > 0 ? '+' : '') + c.chg10.toFixed(0) + ' pts'}</td>
  <td style="color:${c.proj ? (c.proj.v > c.latest ? 'var(--bad)' : 'var(--good)') : 'var(--muted)'};font-variant-numeric:tabular-nums;">${c.proj ? `${c.proj.v.toFixed(0)}% by ${c.proj.year}` : '—'}</td>
</tr>`).join('')}
</tbody></table>
<div style="padding:5px 10px;font-size:11px;color:var(--muted);">IMF WEO, general government gross debt — ${debt.imf.length} countries tracked (majors + global extremes shown). Rule of thumb from the literature: above ~90-100% the fiscal-dominance dynamics in the desk note start to bind; Japan (200%+) shows how long domestic absorption can defer the bill.</div>
</div>` : '';
    const mfh = debt?.mfh;
    const tic = mfh?.holders?.length ? `<div class="tablewrap" style="border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow-x:auto;">
<table><thead><tr><th>Foreign holder of US Treasuries</th><th>Holdings</th><th>% of foreign-held</th><th>12m change</th></tr></thead><tbody>
${mfh.holders.slice(0, 12).map(h => `<tr>
  <td style="text-align:left;color:var(--ink);">${esc(h.name)}</td>
  <td style="font-variant-numeric:tabular-nums;">$${h.bil.toFixed(0)}B</td>
  <td style="font-variant-numeric:tabular-nums;">${mfh.totalBil ? (h.bil / mfh.totalBil * 100).toFixed(1) + '%' : '—'}</td>
  <td style="color:${h.chg12 == null ? 'var(--muted)' : h.chg12 < 0 ? 'var(--bad)' : 'var(--good)'};font-variant-numeric:tabular-nums;">${h.chg12 == null ? '—' : (h.chg12 > 0 ? '+' : '') + '$' + h.chg12.toFixed(0) + 'B'}</td>
</tr>`).join('')}
</tbody></table>
<div style="padding:5px 10px;font-size:11px;color:var(--muted);">Treasury TIC data as of ${esc(mfh.asOf)} — total foreign-held $${(mfh.totalBil / 1000).toFixed(2)}T. Official holders (central banks) vs custodial centers (Belgium, Luxembourg, Cayman) blur the true country split — China's real exposure is widely believed larger than its line. Watch the DIRECTION more than the level.</div>
</div>` : '';
    return `<h2>Sovereign Debt <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— who owes, how much, and who's holding the paper</span></h2>
${hasCells ? `<div class="cells">${cells('debt')}</div>` : ''}
${split}${world}${tic}`;
})()}
${(() => {
    let cal = null;
    try { cal = JSON.parse(readFileSync(new URL('./calendar.json', import.meta.url), 'utf8')); } catch (_) {}
    if (!cal || !cal.events?.length) return '';
    const todayStr = new Date().toISOString().slice(0, 10);
    const dow = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T12:00').getDay()];
    return `<h2>Upcoming Releases <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— scheduled collisions between expectations and reality. Big moves cluster on these days.</span></h2>
<div style="display:flex;flex-wrap:wrap;gap:8px;">
${cal.events.map(e => `<span style="border:1px solid ${e.date === todayStr ? 'var(--bad)' : e.name.startsWith('FOMC') ? 'var(--accent)' : 'var(--line)'};color:${e.date === todayStr ? 'var(--bad)' : e.name.startsWith('FOMC') ? 'var(--accent)' : 'var(--ink)'};border-radius:6px;padding:4px 10px;${e.date === todayStr ? 'font-weight:700;' : ''}">
${e.date === todayStr ? 'TODAY' : `${dow(e.date)} ${e.date.slice(5)}`} · ${esc(e.name)}</span>`).join('')}
</div>`;
})()}
<h2>Commodities &amp; Dollar</h2><div class="cells">${cells('mkt')}</div>
${(() => {
    const g = built['YH_GOLD'], e = built['GOLD_EUR'], j = built['GOLD_JPY'], b = built['GOLD_GBP'];
    if (!g || !e) return '';
    const c12 = (s) => s ? pctDelta(s.pts, 12) : null;
    const c36 = (s) => s ? pctDelta(s.pts, 36) : null;
    const dxy = built['DTWEXBGS'];
    const cell = (v) => v == null ? '<td>—</td>' : `<td style="color:${v >= 0 ? 'var(--good)' : 'var(--bad)'};font-variant-numeric:tabular-nums;">${fmtD(v, 1)}%</td>`;
    return `<div class="tablewrap" style="border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow-x:auto;margin-top:8px;">
<table><thead><tr><th>Is gold rising, or is the dollar falling?</th><th>12 months</th><th>3 years</th></tr></thead><tbody>
${[['Gold in US dollars', g], ['Gold in euros', e], ['Gold in yen', j], ['Gold in pounds', b], ['Broad dollar index', dxy]]
    .filter(([, s]) => s).map(([n, s]) => `<tr><td style="text-align:left;color:var(--ink);">${esc(n)}</td>${cell(c12(s))}${cell(c36(s))}</tr>`).join('')}
</tbody></table>
<div style="padding:5px 10px;font-size:11px;color:var(--muted);">If gold rises only in dollars, it is a currency story. If it rises in every currency, it is real demand for gold. The same test applies to any price: check whether the thing moved or the measuring stick did.</div>
</div>`;
})()}
<h2>Currencies</h2><div class="cells">${cells('fx')}</div>
<h2>Stock Indices</h2><div class="cells">${cells('idx')}</div>
${(() => {
    // Heat tables: % change over 1m/3m/6m/12m for a group of ETF series
    const heatTable = (group, title, sub, note) => {
        const secs = payload.series.filter(s => s.group === group);
        if (!secs.length) return '';
        const chg = (s, k) => pctDelta(s.pts, k);
        const rows = secs.map(s => ({ label: s.label, m1: chg(s, 1), m3: chg(s, 3), m6: chg(s, 6), m12: chg(s, 12) }))
            .sort((a, b) => (b.m3 ?? -99) - (a.m3 ?? -99));
        const cell = (v) => v == null ? '<td>—</td>' :
            `<td style="color:${v >= 0 ? 'var(--good)' : 'var(--bad)'};background:${v >= 0 ? 'rgba(74,168,105,' : 'rgba(214,83,68,'}${Math.min(Math.abs(v) / 60, 0.30).toFixed(2)});font-variant-numeric:tabular-nums;">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</td>`;
        return `<h2>${title} <span style="color:var(--muted);text-transform:none;letter-spacing:0;">${sub}</span></h2>
<div class="tablewrap" style="border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow-x:auto;">
<table><thead><tr><th>${title === 'Sectors' ? 'Sector' : 'Industry'}</th><th>1m</th><th>3m</th><th>6m</th><th>12m</th></tr></thead><tbody>
${rows.map(r => `<tr><td style="text-align:left;color:var(--ink);">${esc(r.label)}</td>${cell(r.m1)}${cell(r.m3)}${cell(r.m6)}${cell(r.m12)}</tr>`).join('')}
</tbody></table>
<div style="padding:5px 10px;font-size:11px;color:var(--muted);">${note}</div>
</div>`;
    };
    return heatTable('sector', 'Sectors', '— S&P sector performance (SPDR ETFs), sorted by 3-month',
        'Leaders/laggards tell the regime story: energy+staples+utilities leading = inflation/defense; tech+discretionary leading = risk-on easing. Full-history charts for each sector are in the History section below.')
        + heatTable('industry', 'Industries', '— sub-industry ETFs, sorted by 3-month',
        'Finer resolution on the same rotation: e.g. regional banks vs big banks (credit stress shows up in KRE first), oil services vs producers, homebuilders as the rate-sensitivity canary, gold miners as the fear trade.');
})()}
<h2>World</h2><div class="cells">${cells('world')}</div>
${analog.top.length ? `
<h2>Historical Analogs <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— which past months look most like today (pattern study, not prediction)</span></h2>
<div class="tablewrap" style="border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow-x:auto;">
<table><thead><tr><th>When</th><th>Match</th><th>The era</th><th>Back then</th><th>12 months later</th><th>Recession ≤18mo?</th></tr></thead><tbody>
${analog.top.map(t => `<tr>
  <td style="text-align:left;color:var(--accent);font-weight:700;">${t.m}</td>
  <td>${t.sim.toFixed(0)}%</td>
  <td style="text-align:left;">${esc(eraOf(t.m))}</td>
  <td style="text-align:left;color:var(--muted);">Fed ${t.then.ff?.toFixed(2)}% · CPI ${t.then.cpi?.toFixed(1)}% · Unemp ${t.then.un?.toFixed(1)}% · Curve ${t.then.curve?.toFixed(2)}${realThen(t.m)}</td>
  <td style="text-align:left;color:var(--muted);">Fed ${fmtD(t.next.ff, 2)} · CPI ${fmtD(t.next.cpi, 1)} · Unemp ${fmtD(t.next.un, 1)}</td>
  <td style="color:${t.rec ? 'var(--bad)' : 'var(--good)'};font-weight:700;">${t.rec ? 'YES' : 'no'}</td>
</tr>`).join('')}
</tbody></table>
<div style="padding:5px 10px;font-size:11px;color:var(--muted);">Match = similarity across 11 normalized indicators (inflation, Fed level+direction, unemployment level+trend, curve, industrial production, payrolls, M2, mortgage rates). The first chart below plots this score across all of history — peaks are the eras that rhyme with now. Five analogs is a tiny sample: read them as "what kind of thing has happened from here," never "what will happen."</div>
</div>` : ''}
<h2 style="display:flex;align-items:center;">History <span style="color:var(--muted);text-transform:none;letter-spacing:0;margin-left:8px;">gray bands = US recessions</span>
  <span class="range"><button data-r="120">10y</button><button data-r="300">25y</button><button data-r="0" class="on">Max</button></span></h2>
<div class="charts" id="charts"></div>
<details><summary>Data table (latest values)</summary>
<table><thead><tr><th>Series</th><th>Latest</th><th>3m Δ</th><th>12m Δ</th><th>As of</th><th>FRED id</th></tr></thead><tbody>
${payload.series.map(s => `<tr><td>${esc(s.label)}</td><td>${s.latest.toFixed(s.dec)}${esc(s.unit)}</td><td>${fmtD(s.d3, s.dec)}</td><td>${fmtD(s.d12, s.dec)}</td><td>${s.asOf}</td><td>${s.id}</td></tr>`).join('')}
</tbody></table></details>
<h2>Historical Tendencies <span style="color:var(--muted);text-transform:none;letter-spacing:0;">— base rates, not laws, not advice</span></h2>
<div class="rules">${RULES.map(([t, b]) => `<div class="rule"><b>${esc(t)}</b><p>${esc(b)}</p></div>`).join('')}</div>
<footer>
Educational dashboard for personal use. Data: FRED&reg; (Federal Reserve Bank of St. Louis) — series ids shown in the table.
${dropped.length ? 'Skipped: ' + esc(dropped.join('; ')) + '.' : ''}
Built ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.
This page describes conditions and historical tendencies; it does not recommend securities or trades and is not investment advice.
</footer>
</div>
<div class="tip" id="tip"></div>
<script>
const BUILT_AT = ${JSON.stringify(new Date().toISOString())};
function paintBuilt() {
    const el = document.getElementById('built');
    if (!el) return;
    const t = new Date(BUILT_AT);
    const mins = Math.round((Date.now() - t.getTime()) / 60000);
    const age = mins < 1 ? 'just now' : mins < 60 ? mins + 'm ago' : (mins / 60).toFixed(1) + 'h ago';
    const color = mins <= 75 ? 'var(--good)' : mins <= 180 ? 'var(--warn)' : 'var(--bad)';
    el.innerHTML = 'build: ' + t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
        ' <span style="color:' + color + ';font-weight:700;">(' + age + ')</span>';
}
paintBuilt();
setInterval(paintBuilt, 60000);

// Forecast Journal controls — active only when served by server.mjs (http),
// hidden when the page is opened as a plain file.
if (location.protocol.startsWith('http')) {
    const hint = document.getElementById('fc-filehint');
    if (hint) hint.style.display = 'none';
    const api = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json()).then(j => { if (j.error) alert(j.error); else location.reload(); });
    // Question rows: slider + lock in / pass
    document.querySelectorAll('.fc-q').forEach(el => {
        el.style.display = 'flex';
        const id = el.dataset.id;
        const slider = el.querySelector('input[type=range]');
        const lab = el.querySelector('.fc-qp');
        slider.addEventListener('input', () => lab.textContent = slider.value + '%');
        el.querySelector('.fc-lock').addEventListener('click', () => api('/api/forecast/answer', { id, p: +slider.value }));
        el.querySelector('.fc-pass').addEventListener('click', () => api('/api/forecast/delete', { id }));
    });
    // Custom-call form stays tucked behind a toggle
    const form = document.getElementById('fc-form');
    const toggle = document.getElementById('fc-toggle');
    if (toggle && form) {
        toggle.style.display = 'inline';
        toggle.addEventListener('click', (ev) => {
            ev.preventDefault();
            form.style.display = form.style.display === 'flex' ? 'none' : 'flex';
        });
    }
    document.getElementById('fadd')?.addEventListener('click', () => {
        const q = document.getElementById('fq').value.trim();
        const p = +document.getElementById('fp').value;
        const d = document.getElementById('fd').value;
        if (!q || !p || !d) { alert('Need a question, a probability, and a deadline.'); return; }
        const series = document.getElementById('fs').value;
        api('/api/forecast', { question: q, p, deadline: d,
            series: series || undefined, op: document.getElementById('fo').value,
            value: +document.getElementById('fv').value || undefined, mode: document.getElementById('fm').value });
    });
    // Revise-your-pick rows (open, still inside the answer window)
    document.querySelectorAll('.fc-edit').forEach(el => {
        const id = el.dataset.id;
        const slider = el.querySelector('input[type=range]');
        const lab = el.querySelector('.fc-qp');
        slider.addEventListener('input', () => lab.textContent = slider.value + '%');
        el.querySelector('.fc-save').addEventListener('click', () => api('/api/forecast/answer', { id, p: +slider.value }));
        el.querySelector('.fc-cancel').addEventListener('click', () => el.style.display = 'none');
    });
    document.querySelectorAll('.fc-ctl').forEach(el => {
        el.style.display = 'inline-flex';
        const id = el.dataset.id;
        const btn = (label, fn, color) => {
            const b = document.createElement('button');
            b.textContent = label;
            b.style.cssText = 'background:none;border:1px solid ' + color + ';color:' + color + ';border-radius:4px;padding:0 8px;font:inherit;font-size:11px;cursor:pointer;';
            b.addEventListener('click', fn);
            el.appendChild(b);
        };
        if (el.dataset.manual === '1') {
            btn('YES', () => api('/api/forecast/resolve', { id, outcome: 1 }), 'var(--good)');
            btn('NO', () => api('/api/forecast/resolve', { id, outcome: 0 }), 'var(--bad)');
        }
        const editEl = el.parentElement.querySelector('.fc-edit');
        if (editEl) btn('Edit', () => { editEl.style.display = editEl.style.display === 'flex' ? 'none' : 'flex'; }, 'var(--accent)');
        btn('✕', () => { if (confirm('Delete this forecast? (Deleting misses defeats the whole point — only remove true mistakes.)')) api('/api/forecast/delete', { id }); }, 'var(--muted)');
    });
}
const DATA = ${JSON.stringify(payload)};
const CHART = '#4489c8', ACCENT = '#e8b23c', BAND = 'rgba(157,150,131,0.14)', GRID = '#2a2820', MUTED = '#9d9683';
let rangeMonths = 0;
const ymNum = (m) => (+m.slice(0, 4)) * 12 + (+m.slice(5, 7));
function render() {
    const host = document.getElementById('charts');
    host.innerHTML = '';
    for (const s of DATA.series) {
        const pts = rangeMonths ? s.pts.slice(-rangeMonths) : s.pts;
        if (pts.length < 2) continue;
        const W = 520, H = 130, L = 44, R = 10, T = 8, B = 18;
        const xs = pts.map(p => ymNum(p[0])), ys = pts.map(p => p[1]);
        const x0 = xs[0], x1 = xs[xs.length - 1];
        let yMin = Math.min(...ys), yMax = Math.max(...ys);
        if (yMin === yMax) { yMin -= 1; yMax += 1; }
        const pad = (yMax - yMin) * 0.08; yMin -= pad; yMax += pad;
        const X = (m) => L + (m - x0) / (x1 - x0) * (W - L - R);
        const Y = (v) => T + (yMax - v) / (yMax - yMin) * (H - T - B);
        let svg = '';
        for (const [a, b] of DATA.rec) {
            const ra = Math.max(ymNum(a), x0), rb = Math.min(ymNum(b), x1);
            if (rb > ra) svg += '<rect x="' + X(ra) + '" y="' + T + '" width="' + (X(rb) - X(ra)) + '" height="' + (H - T - B) + '" fill="' + BAND + '"/>';
        }
        const ticks = 3;
        for (let i = 0; i <= ticks; i++) {
            const v = yMin + (yMax - yMin) * i / ticks;
            svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="' + GRID + '" stroke-width="1"/>' +
                   '<text x="' + (L - 4) + '" y="' + (Y(v) + 3) + '" fill="' + MUTED + '" font-size="9" text-anchor="end">' + v.toFixed(Math.abs(yMax) < 10 ? 1 : 0) + '</text>';
        }
        const y0 = +(pts[0][0].slice(0, 4)), y1e = +(pts[pts.length - 1][0].slice(0, 4));
        const step = Math.max(1, Math.ceil((y1e - y0) / 6 / 5) * 5);
        for (let yr = Math.ceil(y0 / step) * step; yr <= y1e; yr += step) {
            svg += '<text x="' + X(yr * 12 + 1) + '" y="' + (H - 5) + '" fill="' + MUTED + '" font-size="9" text-anchor="middle">' + yr + '</text>';
        }
        svg += '<path d="M' + pts.map(p => X(ymNum(p[0])).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('L') + '" fill="none" stroke="' + CHART + '" stroke-width="2"/>';
        const lx = X(ymNum(pts[pts.length - 1][0])), ly = Y(pts[pts.length - 1][1]);
        svg += '<circle cx="' + lx + '" cy="' + ly + '" r="3" fill="' + ACCENT + '"/>';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = '<h3>' + s.label + ' <span class="sub">' + s.latest.toFixed(s.dec) + s.unit + ' · ' + s.asOf + '</span></h3>' +
            '<svg viewBox="0 0 ' + W + ' ' + H + '" data-id="' + s.id + '"></svg>';
        card.querySelector('svg').innerHTML = svg;
        hover(card.querySelector('svg'), pts, X, Y, ymNum, s);
        host.appendChild(card);
    }
}
function hover(svg, pts, X, Y, ymNum, s) {
    const tip = document.getElementById('tip');
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    cross.setAttribute('stroke', MUTED); cross.setAttribute('stroke-width', '1');
    cross.setAttribute('y1', 8); cross.setAttribute('y2', 112); cross.style.display = 'none';
    svg.appendChild(cross);
    svg.addEventListener('mousemove', (e) => {
        const r = svg.getBoundingClientRect();
        const mx = (e.clientX - r.left) / r.width * 520;
        let best = 0, bd = 1e9;
        for (let i = 0; i < pts.length; i++) { const d = Math.abs(X(ymNum(pts[i][0])) - mx); if (d < bd) { bd = d; best = i; } }
        const p = pts[best];
        cross.setAttribute('x1', X(ymNum(p[0]))); cross.setAttribute('x2', X(ymNum(p[0]))); cross.style.display = '';
        tip.style.display = 'block'; tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY - 10) + 'px';
        tip.textContent = p[0] + '  ' + p[1].toFixed(s.dec) + s.unit;
    });
    svg.addEventListener('mouseleave', () => { cross.style.display = 'none'; tip.style.display = 'none'; });
}
document.querySelectorAll('.range button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.range button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); rangeMonths = +b.dataset.r; render();
}));
render();
</script></body></html>`;

writeFileSync(new URL('./dashboard.html', import.meta.url), html);

// Snapshot for check-alerts.mjs: current regime + chip states + headline values.
writeFileSync(new URL('./snapshot.json', import.meta.url), JSON.stringify({
    at: new Date().toISOString(),
    regime: regimeLabel,
    chips: chips.map(([label, on]) => ({ label, on: !!on })),
    values: Object.fromEntries(payload.series.map(s => [s.id, { label: s.label, v: +s.latest.toFixed(s.dec), unit: s.unit }])),
}, null, 2));
console.log(`dashboard.html written — ${payload.series.length} series, ${recBands.length} recession bands${dropped.length ? ', skipped: ' + dropped.join('; ') : ''}`);
