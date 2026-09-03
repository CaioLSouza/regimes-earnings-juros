const fs = require('node:fs');
const path = require('node:path');

const ROOT = 'C:/Users/Caio/Documents/Documentos/XP';
const ANALYSIS = `${ROOT}/tmp/earnings_regimes_analysis/deep_audit_analysis.json`;
const RATES = `${ROOT}/swap_pre_di_regimes.csv`;
const IPCA_DIR = `${ROOT}/tmp/earnings_regimes_analysis/ipca`;
const REPORT_RATE_SWITCH = '2025-05-07';
const LAST_REALIZED_IPCA = '2026-07';
const EPS_WINDOW = 63;
const MONTH_END_CONFIRMATIONS = 2;
const DAY = 86400000;
const ORDER = ['ED_JD', 'ED_JU', 'EU_JD', 'EU_JU'];

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slope(values) {
  const yMean = mean(values);
  const xMean = (values.length - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i += 1) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  return numerator / denominator;
}

function parseRates() {
  const lines = fs.readFileSync(RATES, 'utf8').trim().split(/\r?\n/).slice(1);
  return new Map(lines.map((line) => {
    const fields = line.split(';');
    const state = fields[4] === 'Hike' ? 1 : fields[4] === 'Cut' ? 0 : null;
    return [fields[0], state];
  }));
}

function parseIpca() {
  const files = ['ipca_2006_2015.json', 'ipca_2016_2025.json', 'ipca_2026.json'];
  const rows = files.flatMap((file) => JSON.parse(fs.readFileSync(path.join(IPCA_DIR, file), 'utf8')));
  return new Map(rows.map((row) => {
    const [day, month, year] = row.data.split('/');
    void day;
    return [`${year}-${month}`, Number(row.valor) / 100];
  }));
}

function buildDailySlope(rows) {
  const result = new Array(rows.length).fill(null);
  for (let i = EPS_WINDOW - 1; i < rows.length; i += 1) {
    const window = rows.slice(i - EPS_WINDOW + 1, i + 1).map((row) => Math.log(row.eps));
    result[i] = slope(window);
  }
  return result;
}

function buildConfirmedMonthlyRegime(rows, dailySlope) {
  const monthEnds = [];
  for (let i = 0; i < rows.length; i += 1) {
    const month = rows[i].date.slice(0, 7);
    const nextMonth = rows[i + 1]?.date.slice(0, 7);
    if (month !== nextMonth && Number.isFinite(dailySlope[i])) {
      monthEnds.push({ index: i, date: rows[i].date, signal: dailySlope[i] > 0 ? 1 : 0, slope: dailySlope[i] });
    }
  }

  const effectiveChanges = [];
  let state = null;
  let pendingState = null;
  let pendingCount = 0;
  for (const observation of monthEnds) {
    if (state == null) {
      state = observation.signal;
      if (observation.index + 1 < rows.length) {
        effectiveChanges.push({
          signalDate: observation.date,
          effectiveIndex: observation.index + 1,
          effectiveDate: rows[observation.index + 1].date,
          regime: state,
          confirmations: 1,
          initialization: true,
        });
      }
      continue;
    }

    if (observation.signal === state) {
      pendingState = null;
      pendingCount = 0;
      continue;
    }

    if (pendingState === observation.signal) pendingCount += 1;
    else {
      pendingState = observation.signal;
      pendingCount = 1;
    }

    if (pendingCount >= MONTH_END_CONFIRMATIONS && observation.index + 1 < rows.length) {
      state = observation.signal;
      effectiveChanges.push({
        signalDate: observation.date,
        effectiveIndex: observation.index + 1,
        effectiveDate: rows[observation.index + 1].date,
        regime: state,
        confirmations: MONTH_END_CONFIRMATIONS,
        initialization: false,
      });
      pendingState = null;
      pendingCount = 0;
    }
  }

  const regime = new Array(rows.length).fill(null);
  let changePointer = 0;
  let activeState = null;
  for (let i = 0; i < rows.length; i += 1) {
    while (changePointer < effectiveChanges.length && effectiveChanges[changePointer].effectiveIndex === i) {
      activeState = effectiveChanges[changePointer].regime;
      changePointer += 1;
    }
    regime[i] = activeState;
  }
  return { regime, monthEnds, effectiveChanges };
}

function buildEvents(rows, field, label) {
  const events = [];
  if (!rows.length) return events;
  let start = 0;
  for (let i = 1; i <= rows.length; i += 1) {
    if (i === rows.length || rows[i][field] !== rows[start][field]) {
      const current = i === rows.length;
      const end = current ? rows[i - 1].date : rows[i].date;
      events.push({
        type: label,
        regime: rows[start][field],
        start: rows[start].date,
        end,
        duration: Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${rows[start].date}T00:00:00Z`)) / DAY),
        tradingDays: i - start,
        current,
      });
      start = i;
    }
  }
  return events;
}

function annualize(logReturn, observations) {
  return observations > 0 ? Math.expm1(logReturn * 252 / observations) : null;
}

function buildFinalPanel() {
  const raw = JSON.parse(fs.readFileSync(ANALYSIS, 'utf8'));
  const base = raw.dailyAudit.map((row) => ({
    date: row.date.slice(0, 10),
    price: Number(row.price),
    priceSource: row.priceSource,
    eps: Number(row.eps),
    epsDate: row.epsDate.slice(0, 10),
  }));
  const dailySlope = buildDailySlope(base);
  const monthly = buildConfirmedMonthlyRegime(base, dailySlope);
  const rateMap = parseRates();

  const valid = [];
  for (let i = 0; i < base.length; i += 1) {
    const earnings = monthly.regime[i];
    const rate = base[i].date >= REPORT_RATE_SWITCH ? 0 : rateMap.get(base[i].date);
    if (earnings == null || rate == null) continue;
    valid.push({
      ...base[i],
      slope63: dailySlope[i],
      earnings,
      earningsLabel: earnings ? 'Earnings Up' : 'Earnings Down',
      rate,
      rateLabel: rate ? 'Juros Up' : 'Juros Down',
      regime: `${earnings ? 'EU' : 'ED'}_${rate ? 'JU' : 'JD'}`,
    });
  }

  const events = buildEvents(valid, 'regime', 'combined');
  const earningsEvents = buildEvents(valid, 'earningsLabel', 'earnings');
  const rateEvents = buildEvents(valid, 'rateLabel', 'rates');
  const calendarDays = Object.fromEntries(ORDER.map((key) => [key, 0]));
  for (const event of events) calendarDays[event.regime] += event.duration;
  const totalCalendarDays = Object.values(calendarDays).reduce((sum, value) => sum + value, 0);
  const shares = Object.fromEntries(ORDER.map((key) => [key, calendarDays[key] / totalCalendarDays]));

  const ipca = parseIpca();
  const monthIntervals = {};
  for (let i = 0; i < valid.length - 1; i += 1) {
    const month = valid[i].date.slice(0, 7);
    if (month <= LAST_REALIZED_IPCA && ipca.has(month)) monthIntervals[month] = (monthIntervals[month] || 0) + 1;
  }

  const returns = Object.fromEntries(ORDER.map((key) => [key, { n: 0, nominalLog: 0, realLog: 0, positiveDays: 0 }]));
  for (let i = 0; i < valid.length - 1; i += 1) {
    const row = valid[i];
    const month = row.date.slice(0, 7);
    if (month > LAST_REALIZED_IPCA || !ipca.has(month)) continue;
    const nominalLog = Math.log(valid[i + 1].price / row.price);
    const dailyInflationLog = Math.log1p(ipca.get(month)) / monthIntervals[month];
    const bucket = returns[row.regime];
    bucket.n += 1;
    bucket.nominalLog += nominalLog;
    bucket.realLog += nominalLog - dailyInflationLog;
    if (nominalLog > 0) bucket.positiveDays += 1;
  }
  for (const key of ORDER) {
    const bucket = returns[key];
    bucket.nominalAnnualized = annualize(bucket.nominalLog, bucket.n);
    bucket.realAnnualized = annualize(bucket.realLog, bucket.n);
    bucket.positiveDayShare = bucket.n ? bucket.positiveDays / bucket.n : null;
  }

  const earningsCalendarDays = { 'Earnings Up': 0, 'Earnings Down': 0 };
  for (const event of earningsEvents) earningsCalendarDays[event.regime] += event.duration;
  const earningsTotalDays = earningsCalendarDays['Earnings Up'] + earningsCalendarDays['Earnings Down'];

  return {
    methodology: {
      earningsSignal: 'OLS slope of log 12m-forward EPS over the latest 63 trading observations',
      observationFrequency: 'Signal sign observed only at the final available trading day of each calendar month',
      confirmation: 'A switch requires two consecutive month-end observations on the opposite side of zero',
      executionLag: 'Confirmed switches become effective on the next available trading day; until then the prior regime is retained',
      rates: 'XP report-aligned rates regimes; Rates Down from 2025-05-07 through the sample end',
      frequency: 'Calendar-day duration between successive effective regime dates',
      returnAttribution: 'The close-to-close Ibovespa log return from t to t+1 is attributed to the regime active on t',
      realReturn: 'Monthly IPCA log inflation is allocated equally across the trading intervals of the month and subtracted from the nominal log return',
    },
    sample: {
      rawFirst: base[0].date,
      rawLast: base.at(-1).date,
      first: valid[0].date,
      last: valid.at(-1).date,
      lastRealizedIpca: `${LAST_REALIZED_IPCA}-31`,
      rawRows: base.length,
      classifiedRows: valid.length,
    },
    parameters: {
      epsWindowTradingDays: EPS_WINDOW,
      monthEndConfirmations: MONTH_END_CONFIRMATIONS,
      threshold: 0,
      epsSmoothing: 'none',
      winsorization: 'none',
      inflationAdjustmentToEps: 'none',
      annualizationTradingDays: 252,
    },
    valid,
    events,
    earningsEvents,
    rateEvents,
    monthEndSignals: monthly.monthEnds,
    earningsEffectiveChanges: monthly.effectiveChanges,
    calendarDays,
    shares,
    earningsCalendarDays,
    earningsShares: {
      up: earningsCalendarDays['Earnings Up'] / earningsTotalDays,
      down: earningsCalendarDays['Earnings Down'] / earningsTotalDays,
    },
    returns,
    diagnostics: {
      earningsEventCount: earningsEvents.length,
      combinedEventCount: events.length,
      combinedEventsUpTo30CalendarDays: events.filter((event) => event.duration <= 30).length,
      combinedMedianCalendarDays: [...events].sort((a, b) => a.duration - b.duration)[Math.floor(events.length / 2)].duration,
      currentEarningsRegime: earningsEvents.at(-1).regime,
      currentEarningsSince: earningsEvents.at(-1).start,
      currentRatesRegime: rateEvents.at(-1).regime,
      currentRatesSince: rateEvents.at(-1).start,
      currentCombinedRegime: events.at(-1).regime,
      currentCombinedSince: events.at(-1).start,
    },
  };
}

module.exports = {
  ROOT,
  ORDER,
  REPORT_RATE_SWITCH,
  LAST_REALIZED_IPCA,
  EPS_WINDOW,
  MONTH_END_CONFIRMATIONS,
  buildFinalPanel,
};
