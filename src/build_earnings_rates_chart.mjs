import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildFinalPanel } = require("./final_regime_core.cjs");
const OUT = "C:/Users/Caio/.codex/visualizations/2026/09/02/01a06328-b1e5-7e72-a850-3d4674c9b127/earnings-rates-regimes.html";
const panel = buildFinalPanel();
const rows = panel.valid.map(r => ({ date: new Date(`${r.date}T00:00:00Z`), price: r.price, regime: r.regime }));
const labels = [
  { key: "EU_JU", name: "Earnings Up / Juros Up", color: "series-1", e: 1, r: 1 },
  { key: "EU_JD", name: "Earnings Up / Juros Down", color: "series-2", e: 1, r: 0 },
  { key: "ED_JU", name: "Earnings Down / Juros Up", color: "series-3", e: 0, r: 1 },
  { key: "ED_JD", name: "Earnings Down / Juros Down", color: "series-4", e: 0, r: 0 },
];
const cum = Object.fromEntries(labels.map(l => [l.key, 0]));
const month = new Map();
for (let i = 0; i < rows.length - 1; i++) {
  cum[rows[i].regime] += Math.log(rows[i + 1].price / rows[i].price);
  const d = rows[i].date, ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  month.set(ym, { date: `${ym}-01`, values: Object.fromEntries(labels.map(l => [l.key, Math.exp(cum[l.key]) - 1])) });
}
const data = [...month.values()];
const html = `<div id="earnings-rates-regimes" class="earnings-regimes-visual">
  <h2>Ibovespa cumulative performance during each regime</h2>
  <p class="subtitle">BPA: inclinação do log em 3 meses, confirmada em 2 fechamentos mensais · Juros: datas alinhadas aos reports XP</p>
  <svg class="chart" role="img" aria-labelledby="chart-title chart-desc">
    <title id="chart-title">Desempenho acumulado do Ibovespa por regime de earnings e juros</title>
    <desc id="chart-desc">Quatro linhas mostram o retorno acumulado do Ibovespa nos quadrantes Earnings Up ou Down e juros em alta ou queda, de 2006 a 2026.</desc>
    <g class="plot"></g>
  </svg>
  <div class="legend" aria-label="Regimes">
    ${labels.map(l => `<button type="button" class="legend-item ${l.color}" aria-pressed="true" data-key="${l.key}"><span class="swatch" aria-hidden="true"></span><span>${l.name}</span></button>`).join("")}
  </div>
  <p class="note">Amostra efetiva: ${panel.sample.first}–${panel.sample.last}. A mudança de earnings vale no pregão seguinte à segunda confirmação mensal. Juros Down desde 07/05/2025, conforme o report XP de 18/03/2026; retorno acumulado apenas nos dias de cada quadrante.</p>
  <script>
  (() => {
    const root = document.getElementById('earnings-rates-regimes');
    const data = ${JSON.stringify(data)};
    const series = ${JSON.stringify(labels)};
    const svg = root.querySelector('svg');
    const plot = root.querySelector('.plot');
    const visible = new Set(series.map(s => s.key));
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag, attrs = {}) => { const e = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    const fmt = v => (v * 100).toFixed(1) + '%';
    function draw() {
      const w = Math.max(320, root.clientWidth || 900), h = w < 500 ? 390 : 500;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      plot.replaceChildren();
      const margin = { top: 22, right: 16, bottom: 52, left: w < 500 ? 48 : 60 };
      const iw = w - margin.left - margin.right, ih = h - margin.top - margin.bottom;
      const dates = data.map(d => new Date(d.date));
      const x = d => margin.left + ((new Date(d).getTime() - dates[0].getTime()) / (dates[dates.length - 1].getTime() - dates[0].getTime())) * iw;
      const all = data.flatMap(d => Object.values(d.values));
      let ymin = Math.min(0, ...all), ymax = Math.max(0, ...all), pad = (ymax - ymin) * 0.10 || 0.1; ymin -= pad; ymax += pad;
      const y = v => margin.top + (ymax - v) / (ymax - ymin) * ih;
      const axis = make('g', { class: 'axis' });
      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const v = ymin + (ymax - ymin) * i / yTicks, yy = y(v);
        axis.appendChild(make('line', { x1: margin.left, x2: w - margin.right, y1: yy, y2: yy, class: i === 0 ? 'zero' : 'grid' }));
        const t = make('text', { x: margin.left - 10, y: yy + 4, 'text-anchor': 'end', class: 'tick' }); t.textContent = fmt(v); axis.appendChild(t);
      }
      const years = [...new Set(dates.map(d => d.getUTCFullYear()))];
      const step = w < 500 ? Math.max(1, Math.ceil(years.length / 4)) : Math.max(1, Math.ceil(years.length / 8));
      years.filter((_, i) => i % step === 0).forEach(yr => {
        const d = yr + '-01-01', xx = x(d);
        axis.appendChild(make('line', { x1: xx, x2: xx, y1: margin.top, y2: h - margin.bottom, class: 'vgrid' }));
        const t = make('text', { x: xx, y: h - margin.bottom + 25, 'text-anchor': 'middle', class: 'tick' }); t.textContent = yr; axis.appendChild(t);
      });
      const xlabel = make('text', { x: margin.left + iw / 2, y: h - 7, 'text-anchor': 'middle', class: 'axis-title' }); xlabel.textContent = 'Ano'; axis.appendChild(xlabel);
      const ylabel = make('text', { x: 15, y: margin.top + ih / 2, transform: 'rotate(-90 15 ' + (margin.top + ih / 2) + ')', 'text-anchor': 'middle', class: 'axis-title' }); ylabel.textContent = 'Retorno acumulado'; axis.appendChild(ylabel);
      if (w < 500) ylabel.setAttribute('display', 'none');
      plot.appendChild(axis);
      for (const s of series) {
        const path = make('path', { class: 'line ' + s.color, 'data-key': s.key });
        path.setAttribute('d', data.map((d, i) => (i ? 'L' : 'M') + x(d.date).toFixed(2) + ',' + y(d.values[s.key]).toFixed(2)).join(' '));
        path.style.display = visible.has(s.key) ? '' : 'none'; plot.appendChild(path);
      }
    }
    root.querySelectorAll('.legend-item').forEach(btn => btn.addEventListener('click', () => { const k = btn.dataset.key; if (visible.has(k)) { visible.delete(k); btn.setAttribute('aria-pressed', 'false'); } else { visible.add(k); btn.setAttribute('aria-pressed', 'true'); } draw(); }));
    new ResizeObserver(draw).observe(root); draw();
  })();
  </script>
</div>
<style>
#earnings-rates-regimes { width: 100%; color: var(--foreground); font-family: inherit; }
#earnings-rates-regimes h2 { margin: 0 0 4px; font-size: 18px; line-height: 1.25; font-weight: 500; }
#earnings-rates-regimes .subtitle, #earnings-rates-regimes .note { margin: 0 0 10px; color: var(--muted-foreground); font-size: 12px; }
#earnings-rates-regimes .note { margin: 8px 0 0; }
#earnings-rates-regimes .chart { display: block; width: 100%; height: auto; overflow: visible; }
#earnings-rates-regimes .grid, #earnings-rates-regimes .vgrid { stroke: var(--border); stroke-width: 1; opacity: .45; }
#earnings-rates-regimes .zero { stroke: var(--border); stroke-width: 1.2; opacity: .9; }
#earnings-rates-regimes .tick, #earnings-rates-regimes .axis-title { fill: var(--foreground); font-size: 12px; }
#earnings-rates-regimes .line { fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; }
#earnings-rates-regimes .series-1 { stroke: var(--viz-series-1); color: var(--viz-series-1); }
#earnings-rates-regimes .series-2 { stroke: var(--viz-series-2); color: var(--viz-series-2); }
#earnings-rates-regimes .series-3 { stroke: var(--viz-series-3); color: var(--viz-series-3); }
#earnings-rates-regimes .series-4 { stroke: var(--viz-series-4); color: var(--viz-series-4); }
#earnings-rates-regimes .legend { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 4px 0 0 60px; }
#earnings-rates-regimes .legend-item { display: inline-flex; align-items: center; gap: 6px; border: 0; padding: 2px 0; background: transparent; color: var(--foreground); font: inherit; font-size: 12px; cursor: pointer; }
#earnings-rates-regimes .swatch { width: 22px; height: 0; border-top: 3px solid currentColor; display: inline-block; }
#earnings-rates-regimes .legend-item.series-1 { color: var(--viz-series-1); }
#earnings-rates-regimes .legend-item.series-2 { color: var(--viz-series-2); }
#earnings-rates-regimes .legend-item.series-3 { color: var(--viz-series-3); }
#earnings-rates-regimes .legend-item.series-4 { color: var(--viz-series-4); }
#earnings-rates-regimes .legend-item[aria-pressed="false"] { opacity: .35; }
@media (max-width: 500px) { #earnings-rates-regimes .legend { margin-left: 48px; gap: 6px 12px; } #earnings-rates-regimes .legend-item { font-size: 11px; } }
</style>`;
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, html, "utf8");
console.log(OUT);
