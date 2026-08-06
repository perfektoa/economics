// Series registry — one entry per indicator.
// kind: 'level' = use values as-is; 'yoy' = 12-month percent change (monthly data)
// goodWhenUp intentionally omitted — arrows stay neutral; this tool describes, it doesn't advise.
export const SERIES = [
    // ── US core ──────────────────────────────────────────────
    { id: 'GDPNOW',           label: 'GDP Nowcast (Atlanta Fed)', unit: '%',    kind: 'level', dec: 1, group: 'us' },
    { id: 'A191RL1Q225SBEA',  label: 'Real GDP Growth (SAAR)',    unit: '%',    kind: 'level', dec: 1, group: 'us' },
    { id: 'CPIAUCSL',         label: 'Inflation — CPI YoY',       unit: '%',    kind: 'yoy',   dec: 1, group: 'us' },
    { id: 'CPILFESL',         label: 'Core CPI YoY',              unit: '%',    kind: 'yoy',   dec: 1, group: 'us' },
    { id: 'FEDFUNDS',         label: 'Fed Funds Rate',            unit: '%',    kind: 'level', dec: 2, group: 'us' },
    { id: 'T10Y2Y',           label: 'Yield Curve (10Y − 2Y)',    unit: '%',    kind: 'level', dec: 2, group: 'us' },
    { id: 'UNRATE',           label: 'Unemployment',              unit: '%',    kind: 'level', dec: 1, group: 'us' },
    { id: 'HOUST',            label: 'Housing Starts',            unit: 'k',    kind: 'level', dec: 0, group: 'us' },
    { id: 'BAMLH0A0HYM2',     label: 'High-Yield Credit Spread',  unit: '%',    kind: 'level', dec: 2, group: 'us' },
    { id: 'VIXCLS',           label: 'VIX',                       unit: '',     kind: 'level', dec: 1, group: 'us' },
    // ── US expansion pack ────────────────────────────────────
    { id: 'MORTGAGE30US',     label: '30y Mortgage Rate',         unit: '%',    kind: 'level', dec: 2, group: 'us' },
    { id: 'ICSA',             label: 'Initial Jobless Claims',    unit: 'k',    kind: 'level', dec: 0, group: 'us', scale: 0.001 },
    { id: 'PAYEMS',           label: 'Payrolls YoY',              unit: '%',    kind: 'yoy',   dec: 1, group: 'us' },
    { id: 'INDPRO',           label: 'Industrial Production YoY', unit: '%',    kind: 'yoy',   dec: 1, group: 'us' },
    { id: 'UMCSENT',          label: 'Consumer Sentiment',        unit: '',     kind: 'level', dec: 1, group: 'us' },
    { id: 'M2SL',             label: 'Money Supply (M2) YoY',     unit: '%',    kind: 'yoy',   dec: 1, group: 'us' },
    { id: 'T5YIFR',           label: 'Inflation Expectations (5y5y)', unit: '%', kind: 'level', dec: 2, group: 'us' },
    { id: 'NFCI',             label: 'Financial Conditions (NFCI)', unit: '',  kind: 'level', dec: 2, group: 'us', optional: true },
    { id: 'CSUSHPINSA',       label: 'Home Prices YoY (Case-Shiller)', unit: '%', kind: 'yoy', dec: 1, group: 'us', optional: true },
    { id: 'DRCCLACBS',        label: 'Credit Card Delinquency',   unit: '%',    kind: 'level', dec: 2, group: 'us', optional: true },
    { id: 'DRSFRMACBS',       label: 'Mortgage Delinquency',      unit: '%',    kind: 'level', dec: 2, group: 'us', optional: true },
    // ── Commodities / dollar ─────────────────────────────────
    { id: 'DCOILWTICO',       label: 'Crude Oil (WTI)',           unit: '$',    kind: 'level', dec: 0, group: 'mkt' },
    { id: 'DTWEXBGS',         label: 'Dollar Index (Broad)',      unit: '',     kind: 'level', dec: 1, group: 'mkt' },
    { id: 'PCOPPUSDM',        label: 'Copper ($/tonne)',          unit: '$',    kind: 'level', dec: 0, group: 'mkt', optional: true },
    { id: 'DHHNGSP',          label: 'Natural Gas (Henry Hub)',   unit: '$',    kind: 'level', dec: 2, group: 'mkt', optional: true },
    // Futures (front-month via Yahoo) — adds real-time copper/grains/crude
    { id: 'YH_CL',   sym: 'CL=F',  src: 'yahoo', label: 'Crude Futures',   unit: '$', kind: 'level', dec: 1, group: 'mkt', optional: true },
    { id: 'YH_HG',   sym: 'HG=F',  src: 'yahoo', label: 'Copper Futures',  unit: '$', kind: 'level', dec: 2, group: 'mkt', optional: true },
    { id: 'YH_ZW',   sym: 'ZW=F',  src: 'yahoo', label: 'Wheat Futures',   unit: '$', kind: 'level', dec: 0, group: 'mkt', optional: true },
    { id: 'YH_ZC',   sym: 'ZC=F',  src: 'yahoo', label: 'Corn Futures',    unit: '$', kind: 'level', dec: 0, group: 'mkt', optional: true },
    // Gold: FRED's LBMA series have been shuffled over the years — first candidate that returns data wins.
    { id: 'GOLDPMGBD228NLBM', label: 'Gold (LBMA PM)',            unit: '$',    kind: 'level', dec: 0, group: 'mkt', optional: true },
    { id: 'GOLDAMGBD228NLBM', label: 'Gold (LBMA AM)',            unit: '$',    kind: 'level', dec: 0, group: 'mkt', optional: true, fallbackFor: 'GOLDPMGBD228NLBM' },
    // ── Markets via Yahoo (no key; monthly bars) ─────────────
    { id: 'YH_GOLD',   sym: 'GC=F',      src: 'yahoo', label: 'Gold',            unit: '$', kind: 'level', dec: 0, group: 'mkt', optional: true },
    { id: 'YH_SILVER', sym: 'SI=F',      src: 'yahoo', label: 'Silver',          unit: '$', kind: 'level', dec: 1, group: 'mkt', optional: true },
    { id: 'YH_BTC',    sym: 'BTC-USD',   src: 'yahoo', label: 'Bitcoin',         unit: '$', kind: 'level', dec: 0, group: 'mkt', optional: true },
    // Same index as FRED's VIXCLS but published same-day rather than 3-4 days
    // late, so forecast questions on it resolve when the market does.
    { id: 'YH_VIX',    sym: '^VIX',      src: 'yahoo', label: 'VIX (live)',      unit: '',  kind: 'level', dec: 1, group: 'meta', optional: true },
    { id: 'YH_SPX',    sym: '^GSPC',     src: 'yahoo', label: 'S&P 500',         unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    { id: 'YH_NDX',    sym: '^IXIC',     src: 'yahoo', label: 'Nasdaq',          unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    { id: 'YH_N225',   sym: '^N225',     src: 'yahoo', label: 'Nikkei 225',      unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    { id: 'YH_DAX',    sym: '^GDAXI',    src: 'yahoo', label: 'DAX (Germany)',   unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    { id: 'YH_FTSE',   sym: '^FTSE',     src: 'yahoo', label: 'FTSE 100 (UK)',   unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    { id: 'YH_SSE',    sym: '000001.SS', src: 'yahoo', label: 'Shanghai Comp.',  unit: '',  kind: 'level', dec: 0, group: 'idx', optional: true },
    // ── S&P sectors via SPDR ETFs (real-world sector heat map) ──
    { id: 'YH_XLK',  sym: 'XLK',  src: 'yahoo', label: 'Technology',        unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLF',  sym: 'XLF',  src: 'yahoo', label: 'Financials',        unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLV',  sym: 'XLV',  src: 'yahoo', label: 'Health Care',       unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLE',  sym: 'XLE',  src: 'yahoo', label: 'Energy',            unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLI',  sym: 'XLI',  src: 'yahoo', label: 'Industrials',       unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLP',  sym: 'XLP',  src: 'yahoo', label: 'Consumer Staples',  unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLY',  sym: 'XLY',  src: 'yahoo', label: 'Consumer Discret.', unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLU',  sym: 'XLU',  src: 'yahoo', label: 'Utilities',         unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLB',  sym: 'XLB',  src: 'yahoo', label: 'Materials',         unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLRE', sym: 'XLRE', src: 'yahoo', label: 'Real Estate',       unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    { id: 'YH_XLC',  sym: 'XLC',  src: 'yahoo', label: 'Communications',    unit: '', kind: 'level', dec: 0, group: 'sector', optional: true },
    // ── Sub-industries via industry ETFs ─────────────────────
    { id: 'YH_SMH',  sym: 'SMH',  src: 'yahoo', label: 'Semiconductors',      unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XSW',  sym: 'XSW',  src: 'yahoo', label: 'Software',            unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XBI',  sym: 'XBI',  src: 'yahoo', label: 'Biotech',             unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XPH',  sym: 'XPH',  src: 'yahoo', label: 'Pharma',              unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_IHI',  sym: 'IHI',  src: 'yahoo', label: 'Medical Devices',     unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_KBE',  sym: 'KBE',  src: 'yahoo', label: 'Banks',               unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_KRE',  sym: 'KRE',  src: 'yahoo', label: 'Regional Banks',      unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_KIE',  sym: 'KIE',  src: 'yahoo', label: 'Insurance',           unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XOP',  sym: 'XOP',  src: 'yahoo', label: 'Oil E&P',             unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_OIH',  sym: 'OIH',  src: 'yahoo', label: 'Oil Services',        unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_GDX',  sym: 'GDX',  src: 'yahoo', label: 'Gold Miners',         unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XME',  sym: 'XME',  src: 'yahoo', label: 'Metals & Mining',     unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XHB',  sym: 'XHB',  src: 'yahoo', label: 'Homebuilders',        unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XRT',  sym: 'XRT',  src: 'yahoo', label: 'Retail',              unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_XTN',  sym: 'XTN',  src: 'yahoo', label: 'Transports',          unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_ITA',  sym: 'ITA',  src: 'yahoo', label: 'Aerospace & Defense', unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_PAVE', sym: 'PAVE', src: 'yahoo', label: 'Infrastructure',      unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    { id: 'YH_ITB',  sym: 'ITB',  src: 'yahoo', label: 'Home Construction',   unit: '', kind: 'level', dec: 0, group: 'industry', optional: true },
    // ── Wealth & inequality (Fed Distributional Financial Accounts + BLS/Census/World Bank) ──
    // Slow structural dials: quarterly or annual. Annual ones drift in and out of the
    // 30-month staleness window between releases — that's expected.
    { id: 'WFRBST01134',   label: 'Top 1% Share of Net Worth',        unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'WFRBSB50215',   label: 'Bottom 50% Share of Net Worth',    unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'PRS85006173',   label: 'Labor Share of Output (2017=100)', unit: '',  kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'MEHOINUSA672N', label: 'Real Median Household Income',     unit: '$', kind: 'level', dec: 0, group: 'ineq', optional: true },
    { id: 'SIPOVGINIUSA',  label: 'Gini Index (World Bank)',          unit: '',  kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'WFRBSTP1300',   label: 'Top 0.1% Share of Net Worth',      unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'WFRBST01122',   label: 'Top 1% Share of All Stocks',       unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    // Is capital being deployed or parked? Velocity = how often each dollar
    // changes hands; investment share = how much output goes into building things.
    { id: 'M2V',           label: 'Money Velocity (M2)',              unit: '',  kind: 'level', dec: 2, group: 'ineq', optional: true },
    { id: 'A006RE1Q156NBEA', label: 'Investment Share of GDP',        unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'RHORUSQ156N',   label: 'Homeownership Rate',               unit: '%', kind: 'level', dec: 1, group: 'ineq', optional: true },
    { id: 'BABATOTALSAUS', label: 'New Business Applications',        unit: '',  kind: 'level', dec: 0, group: 'ineq', optional: true },
    // Apartment supply: completions set rents ~now, starts set them ~2 years out
    { id: 'COMPU5MUSA',    label: 'Apartments Completed (5+ units)',  unit: 'k', kind: 'level', dec: 0, group: 'us', optional: true },
    { id: 'HOUST5F',       label: 'Apartments Started (5+ units)',    unit: 'k', kind: 'level', dec: 0, group: 'us', optional: true },
    // Rent vs wages: the cost-of-living squeeze where it actually bites
    { id: 'CUSR0000SEHA',  label: 'Rent (CPI)',                       unit: '',  kind: 'level', dec: 1, group: 'meta', optional: true },
    { id: 'CES0500000003', label: 'Average Hourly Earnings',          unit: '$', kind: 'level', dec: 2, group: 'meta', optional: true },
    // Inputs for the housing affordability panel (nominal, so the ratio is fair)
    { id: 'MSPUS',         label: 'Median Home Sale Price',           unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'MEHOINUSA646N', label: 'Median Household Income',          unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    // Inputs for wealth-to-output (the financialisation ratio)
    { id: 'TNWBSHNO',      label: 'Household Net Worth',              unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'GDP',           label: 'Nominal GDP',                      unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    // Piketty inputs: national income is his denominator, not GDP. Public net
    // worth is split federal / state-local because they point opposite ways.
    { id: 'NICUR',         label: 'National Income',                  unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'COE',           label: 'Compensation of Employees',        unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'FGNETWQ027S',   label: 'Federal Govt Net Worth',           unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'SLGTPAQ027S',   label: 'State & Local Govt Net Worth',     unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    // ── Euro-area distributional wealth (ECB DWA via fetch-intl.mjs) ──────────
    // Same measures as the Fed's WFRB* series above, from the euro area's own
    // central bank, quarterly since 2011. ECB publishes nothing finer than the
    // top 5%, so there is no top-1% mirror of the US chart.
    { id: 'DWA_EA_T10', label: 'Top 10% Wealth Share — Euro Area',   unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_EA_B50', label: 'Bottom 50% Wealth Share — Euro Area', unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_DE_T10', label: 'Top 10% Wealth Share — Germany',     unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_DE_B50', label: 'Bottom 50% Wealth Share — Germany',  unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_FR_T10', label: 'Top 10% Wealth Share — France',      unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_FR_B50', label: 'Bottom 50% Wealth Share — France',   unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_IT_T10', label: 'Top 10% Wealth Share — Italy',       unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_IT_B50', label: 'Bottom 50% Wealth Share — Italy',    unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_ES_T10', label: 'Top 10% Wealth Share — Spain',       unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_ES_B50', label: 'Bottom 50% Wealth Share — Spain',    unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_NL_T10', label: 'Top 10% Wealth Share — Netherlands', unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_NL_B50', label: 'Bottom 50% Wealth Share — Netherlands', unit: '%', kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_DE_MED', label: 'Median Household Wealth — Germany',  unit: 'k€', kind: 'level', dec: 0, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_FR_MED', label: 'Median Household Wealth — France',   unit: 'k€', kind: 'level', dec: 0, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_IT_MED', label: 'Median Household Wealth — Italy',    unit: 'k€', kind: 'level', dec: 0, group: 'ineqw', src: 'local', optional: true },
    { id: 'DWA_ES_MED', label: 'Median Household Wealth — Spain',    unit: 'k€', kind: 'level', dec: 0, group: 'ineqw', src: 'local', optional: true },
    // Canada (StatCan WDS): QUINTILES, so the top group is the top 20% — the
    // labels say so because 65% held by the top fifth and 75% held by the top
    // tenth are different claims and must not be read side by side as one.
    { id: 'CAN_T20',    label: 'Top 20% Wealth Share — Canada (quintile)',    unit: '%',  kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'CAN_B20',    label: 'Bottom 20% Wealth Share — Canada (quintile)', unit: '%',  kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'CAN_TINC20', label: 'Wealth Held by Top Income Quintile — Canada', unit: '%',  kind: 'level', dec: 1, group: 'ineqw', src: 'local', optional: true },
    { id: 'CAN_MEAN',   label: 'Mean Household Net Worth — Canada',           unit: 'k$', kind: 'level', dec: 0, group: 'ineqw', src: 'local', optional: true },
    // ── Margin debt (FINRA xlsx via fetch-margin.mjs, not FRED — src 'local') ──
    // MARGINGDP is the tracked form: raw margin debt hits a "record" almost every
    // year just because prices grow; dividing by GDP is what makes eras comparable.
    { id: 'MARGINGDP',  label: 'Margin Debt / GDP (FINRA)', unit: '%', kind: 'level', dec: 2, group: 'idx',  src: 'local', optional: true },
    { id: 'MARGINDEBT', label: 'Margin Debt (FINRA)',       unit: '$', kind: 'level', dec: 0, group: 'meta', src: 'local', optional: true },
    // ── Where the money actually goes (BEA by function, annual back to 1959) ──
    // These answer "what share of the budget is defense vs health vs prisons",
    // which no single headline series carries. Prisons and police are split
    // federal / state-local on purpose: over 90% of prison spending is state and
    // local, so the federal line alone makes it look like a rounding error.
    { id: 'AFEXPND',         label: 'Federal Spending (total)',      unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160461A027NBEA', label: 'Federal: Defense',              unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160661A027NBEA', label: 'Federal: Health',               unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160721A027NBEA', label: 'Federal: Income Security',      unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160681A027NBEA', label: 'Federal: Education',            unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160481A027NBEA', label: 'Federal: Police',               unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160511A027NBEA', label: 'Federal: Prisons',              unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160881A027NBEA', label: 'State & Local: Prisons',        unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'G160841A027NBEA', label: 'State & Local: Public Order',   unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'GDPA',            label: 'Nominal GDP (annual)',          unit: '$', kind: 'level', dec: 0, group: 'meta', optional: true },
    // ── Sovereign debt (US structure; world levels come from debt.json/IMF) ──
    { id: 'GFDEGDQ188S', label: 'US Federal Debt / GDP',        unit: '%', kind: 'level', dec: 1, group: 'debt', optional: true },
    { id: 'FYOIGDA188S', label: 'US Interest Cost / GDP',       unit: '%', kind: 'level', dec: 2, group: 'debt', optional: true },
    // ── Global (best-effort; some OECD-sourced series go stale — skipped gracefully) ──
    { id: 'ECBDFR',           label: 'ECB Deposit Rate',          unit: '%',    kind: 'level', dec: 2, group: 'world', optional: true },
    { id: 'CP0000EZ19M086NEST', label: 'Eurozone Inflation YoY',  unit: '%',    kind: 'yoy',   dec: 1, group: 'world', optional: true },
    { id: 'GBRCPIALLMINMEI',  label: 'UK Inflation YoY',          unit: '%',    kind: 'yoy',   dec: 1, group: 'world', optional: true },
    { id: 'JPNCPIALLMINMEI',  label: 'Japan Inflation YoY',       unit: '%',    kind: 'yoy',   dec: 1, group: 'world', optional: true },
    { id: 'IRSTCI01JPM156N',  label: 'Japan Policy Rate',         unit: '%',    kind: 'level', dec: 2, group: 'world', optional: true },
    // ── Currencies (Yahoo) ───────────────────────────────────
    { id: 'YH_EURUSD', sym: 'EURUSD=X', src: 'yahoo', label: 'EUR / USD', unit: '', kind: 'level', dec: 3, group: 'fx', optional: true },
    { id: 'YH_USDJPY', sym: 'JPY=X',    src: 'yahoo', label: 'USD / JPY', unit: '', kind: 'level', dec: 1, group: 'fx', optional: true },
    { id: 'YH_USDCNY', sym: 'CNY=X',    src: 'yahoo', label: 'USD / CNY', unit: '', kind: 'level', dec: 2, group: 'fx', optional: true },
    { id: 'YH_GBPUSD', sym: 'GBPUSD=X', src: 'yahoo', label: 'GBP / USD', unit: '', kind: 'level', dec: 3, group: 'fx', optional: true },
    // ── Meta (fetched for computations/alerts; not displayed directly) ──
    { id: 'USREC',            label: 'US Recession Indicator',    unit: '',     kind: 'level', dec: 0, group: 'meta' },
    { id: 'YH_RSP', sym: 'RSP', src: 'yahoo', label: 'Equal-weight S&P (RSP)', unit: '', kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'DFEDTARU',         label: 'Fed Target Rate (Upper)',   unit: '%',    kind: 'level', dec: 2, group: 'meta', optional: true },
    // Debt-holder computation inputs (GFDEBTN in $M; the FDHB* pair in $B)
    { id: 'GFDEBTN',          label: 'US Total Public Debt',      unit: '$',    kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'FDHBFRBN',         label: 'US Debt Held by Fed',       unit: '$',    kind: 'level', dec: 0, group: 'meta', optional: true },
    { id: 'FDHBFIN',          label: 'US Debt Held by Foreigners', unit: '$',   kind: 'level', dec: 0, group: 'meta', optional: true },
];
