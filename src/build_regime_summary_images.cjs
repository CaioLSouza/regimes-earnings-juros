const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { buildFinalPanel } = require('./final_regime_core.cjs');

const ROOT = 'C:/Users/Caio/Documents/Documentos/XP';
const OUT_DIR = `${ROOT}/outputs/01a06328-b1e5-7e72-a850-3d4674c9b127`;

fs.mkdirSync(OUT_DIR, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/arial.ttf', 'Arial');
GlobalFonts.registerFromPath('C:/Windows/Fonts/arialbd.ttf', 'Arial Bold');

const COLORS = {
  ED_JU: '#203149',
  EU_JU: '#f6b500',
  EU_JD: '#88add8',
  ED_JD: '#778078',
  text: '#151a20',
  muted: '#5f6973',
  grid: '#d8dce1',
  stripe: '#f0f0f0',
  white: '#ffffff',
};

const LABELS = {
  ED_JD: 'Earnings Down, Juros Down',
  ED_JU: 'Earnings Down, Juros Up',
  EU_JD: 'Earnings Up, Juros Down',
  EU_JU: 'Earnings Up, Juros Up',
};

const ORDER = ['ED_JD', 'ED_JU', 'EU_JD', 'EU_JU'];
const TABLE_ORDER = ['EU_JU', 'EU_JD', 'ED_JD', 'ED_JU'];

function font(ctx, size, bold = false) {
  ctx.font = `${size}px ${bold ? 'Arial Bold' : 'Arial'}`;
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function fmtDate(iso) {
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  return `${String(dd).padStart(2, '0')}-${months[mm - 1]}-${yyyy}`;
}

function fmtPct(x) {
  return `${(x * 100).toFixed(1).replace('.', ',')}%`;
}

function saveCanvas(canvas, fileName) {
  const target = path.join(OUT_DIR, fileName);
  fs.writeFileSync(target, canvas.toBuffer('image/png'));
  return target;
}

function drawFrequency(panel) {
  const width = 1500;
  const top = 92;
  const margin = 32;
  const gapX = 42;
  const gapY = 42;
  const panelW = (width - margin * 2 - gapX) / 2;
  const titleH = 36;
  const headerH = 34;
  const rowH = 27;
  const groups = TABLE_ORDER.map((key) => panel.events.filter((e) => e.regime === key));
  const row1H = titleH + headerH + Math.max(groups[0].length, groups[1].length) * rowH;
  const row2H = titleH + headerH + Math.max(groups[2].length, groups[3].length) * rowH;
  const height = top + row1H + gapY + row2H + 68;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.text;
  font(ctx, 31, true);
  ctx.fillText('Regimes de earnings e juros: frequência e janelas', margin, 47);
  line(ctx, margin, 66, width - margin, 66, COLORS.muted, 1);

  function table(key, events, x, y) {
    ctx.fillStyle = COLORS.text;
    font(ctx, 22, true);
    ctx.fillText(`${LABELS[key]} (${fmtPct(panel.shares[key])} do tempo)`, x, y + 25);
    line(ctx, x, y + 32, x + panelW, y + 32, COLORS.muted, 1);
    const hy = y + titleH;
    ctx.fillStyle = COLORS.ED_JU;
    ctx.fillRect(x, hy, panelW, headerH);
    ctx.fillStyle = COLORS.white;
    font(ctx, 18, false);
    const col1 = x + 24;
    const col2 = x + panelW * 0.47;
    const col3 = x + panelW - 24;
    ctx.fillText('Primeiro sinal', col1, hy + 23);
    ctx.fillText('Fim', col2, hy + 23);
    ctx.textAlign = 'right';
    ctx.fillText('Duração (dias)', col3, hy + 23);
    ctx.textAlign = 'left';
    events.forEach((event, i) => {
      const ry = hy + headerH + i * rowH;
      ctx.fillStyle = i % 2 === 0 ? COLORS.stripe : COLORS.white;
      ctx.fillRect(x, ry, panelW, rowH);
      ctx.fillStyle = event.current ? COLORS.EU_JU : COLORS.text;
      font(ctx, 17, event.current);
      ctx.fillText(fmtDate(event.start), col1, ry + 20);
      ctx.fillText(event.current ? 'Atual*' : fmtDate(event.end), col2, ry + 20);
      ctx.textAlign = 'right';
      ctx.fillText(String(event.duration), col3, ry + 20);
      ctx.textAlign = 'left';
    });
  }

  table(TABLE_ORDER[0], groups[0], margin, top);
  table(TABLE_ORDER[1], groups[1], margin + panelW + gapX, top);
  const y2 = top + row1H + gapY;
  table(TABLE_ORDER[2], groups[2], margin, y2);
  table(TABLE_ORDER[3], groups[3], margin + panelW + gapX, y2);

  ctx.fillStyle = COLORS.muted;
  font(ctx, 17, false);
  ctx.fillText(`* Regime vigente na última observação (${fmtDate(panel.sample.last)}). Frequência calculada por dias corridos entre sinais.`, margin, height - 26);
  return saveCanvas(canvas, 'earnings_rates_regime_frequency.png');
}

function drawLegend(ctx, items, x, y, gap) {
  let cx = x;
  font(ctx, 18, false);
  for (const key of items) {
    line(ctx, cx, y, cx + 42, y, COLORS[key], 4);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(LABELS[key].replace(', ', '/'), cx + 52, y + 6);
    cx += gap;
  }
}

function drawLevel(panel) {
  const width = 1500;
  const height = 650;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.text;
  font(ctx, 31, true);
  ctx.fillText('Ibovespa ao longo dos regimes de earnings e juros', 32, 47);
  line(ctx, 32, 66, width - 32, 66, COLORS.muted, 1);
  drawLegend(ctx, ['ED_JU', 'EU_JU'], 360, 93, 380);
  drawLegend(ctx, ['EU_JD', 'ED_JD'], 360, 128, 380);

  const m = { left: 105, right: 42, top: 160, bottom: 78 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const t0 = new Date(`${panel.valid[0].date}T00:00:00Z`).getTime();
  const t1 = new Date(`${panel.valid.at(-1).date}T00:00:00Z`).getTime();
  const maxPrice = Math.max(...panel.valid.map((r) => r.price));
  const yMax = Math.ceil(maxPrice / 20000) * 20000;
  const x = (date) => m.left + ((new Date(`${date}T00:00:00Z`).getTime() - t0) / (t1 - t0)) * plotW;
  const y = (value) => m.top + (1 - value / yMax) * plotH;

  ctx.fillStyle = COLORS.muted;
  font(ctx, 17, false);
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i += 1) {
    const value = yMax * i / 4;
    const py = y(value);
    line(ctx, m.left, py, width - m.right, py, COLORS.grid, 1);
    ctx.fillText(Math.round(value).toLocaleString('pt-BR'), m.left - 15, py + 6);
  }
  ctx.textAlign = 'center';
  const firstYear = Number(panel.sample.first.slice(0, 4));
  const lastYear = Number(panel.sample.last.slice(0, 4));
  for (let year = firstYear % 2 === 0 ? firstYear : firstYear + 1; year <= lastYear; year += 2) {
    const px = x(`${year}-01-01`);
    line(ctx, px, height - m.bottom, px, height - m.bottom + 9, COLORS.grid, 1);
    ctx.fillText(String(year), px, height - m.bottom + 32);
  }
  ctx.textAlign = 'left';
  line(ctx, m.left, height - m.bottom, width - m.right, height - m.bottom, COLORS.grid, 2);
  line(ctx, m.left, m.top, m.left, height - m.bottom, COLORS.grid, 1);

  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (let i = 0; i < panel.valid.length - 1; i += 1) {
    const a = panel.valid[i];
    const b = panel.valid[i + 1];
    ctx.beginPath();
    ctx.moveTo(x(a.date), y(a.price));
    ctx.lineTo(x(b.date), y(b.price));
    ctx.strokeStyle = COLORS[a.regime];
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.muted;
  font(ctx, 17, false);
  ctx.fillText(`Amostra efetiva: ${fmtDate(panel.sample.first)} a ${fmtDate(panel.sample.last)}.`, 32, height - 22);
  return saveCanvas(canvas, 'ibovespa_across_earnings_rates_regimes.png');
}

function wrapCentered(ctx, lines, x, y, lineHeight) {
  ctx.textAlign = 'center';
  lines.forEach((text, i) => ctx.fillText(text, x, y + i * lineHeight));
  ctx.textAlign = 'left';
}

function drawBars(panel) {
  const width = 1050;
  const height = 700;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.white;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = COLORS.text;
  font(ctx, 29, true);
  ctx.fillText('Retorno real anualizado do Ibovespa por regime', 30, 47);
  line(ctx, 30, 67, width - 30, 67, COLORS.muted, 1);

  const values = ORDER.map((key) => panel.returns[key].realAnnualized);
  const minV = Math.min(-0.16, ...values) - 0.02;
  const maxV = Math.max(0.24, ...values) + 0.02;
  const m = { left: 65, right: 35, top: 118, bottom: 165 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const y = (v) => m.top + ((maxV - v) / (maxV - minV)) * plotH;
  const baseline = y(0);
  line(ctx, m.left, baseline, width - m.right, baseline, COLORS.grid, 1.5);

  const slot = plotW / ORDER.length;
  const barW = 112;
  ORDER.forEach((key, i) => {
    const value = panel.returns[key].realAnnualized;
    const cx = m.left + slot * (i + 0.5);
    const py = y(value);
    ctx.fillStyle = COLORS[key];
    ctx.fillRect(cx - barW / 2, Math.min(py, baseline), barW, Math.abs(baseline - py));
    font(ctx, 23, true);
    ctx.textAlign = 'center';
    ctx.fillText(fmtPct(value), cx, value >= 0 ? py - 13 : py + 32);
    ctx.fillStyle = COLORS.text;
    font(ctx, 18, false);
    const [earnings, rates] = LABELS[key].split(', ');
    wrapCentered(ctx, [earnings, rates], cx, height - 106, 24);
  });
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.muted;
  font(ctx, 16, false);
  ctx.fillText('Retorno geométrico anualizado; deflação pelo IPCA mensal, distribuído entre os pregões do mês. IPCA realizado até jul/2026.', 30, height - 24);
  return saveCanvas(canvas, 'ibovespa_annualized_real_returns_earnings_rates.png');
}

const panel = buildFinalPanel();
const outputs = {
  frequency: drawFrequency(panel),
  level: drawLevel(panel),
  realReturns: drawBars(panel),
};
const audit = {
  methodology: {
    earnings: 'Positive OLS slope of log 12m-forward EPS over 63 trading days, observed at month-end; switches require two consecutive opposite month-end signals and take effect on the next trading day',
    rates: 'XP report-aligned rates regimes; Rates Down from 2025-05-07 through the sample end',
    frequency: 'Calendar-day duration between successive regime signals',
    returnAttribution: 'The close-to-close Ibovespa return from t to t+1 is attributed to the regime active on t',
    realReturn: 'Geometric daily annualized Ibovespa return minus monthly IPCA log inflation allocated equally across trading intervals in each month',
  },
  sample: panel.sample,
  parameters: panel.parameters,
  shares: panel.shares,
  calendarDays: panel.calendarDays,
  earningsShares: panel.earningsShares,
  eventCounts: Object.fromEntries(ORDER.map((key) => [key, panel.events.filter((e) => e.regime === key).length])),
  returns: panel.returns,
  diagnostics: {
    earningsEvents: panel.earningsEvents.length,
    combinedEvents: panel.events.length,
    combinedEventsLe30d: panel.events.filter((event) => event.duration <= 30).length,
    medianCombinedDurationDays: panel.events.map((event) => event.duration).sort((a, b) => a - b)[Math.floor(panel.events.length / 2)],
    currentEarningsRegime: panel.earningsEvents.at(-1),
    currentRatesRegime: panel.rateEvents.at(-1),
    currentCombinedRegime: panel.events.at(-1),
  },
  earningsEvents: panel.earningsEvents,
  rateEvents: panel.rateEvents,
  earningsEffectiveChanges: panel.earningsEffectiveChanges,
  events: panel.events,
  outputs,
};
const auditPath = path.join(OUT_DIR, 'earnings_rates_regime_summary.json');
fs.writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...outputs, audit: auditPath, shares: panel.shares, returns: panel.returns }, null, 2));
