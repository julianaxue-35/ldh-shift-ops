/* LDH Shift Ops — small line chart (inline SVG, no library) for the Stats page. Browser: global TrendChart. Node: module.exports.
   TrendChart.html({ labels, series:[{ name, color, values, dash }], unitLabel }) -> legend (with each line's total) + chart + a table view. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TrendChart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function svg(o) {
    const W = 720, H = 270, L = 48, R = 16, T = 12, B = 30;
    const n = o.labels.length;
    const maxV = niceMax(Math.max(0, ...o.series.map(s => Math.max(0, ...s.values))));
    const x = (i) => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R);
    const y = (v) => T + (1 - v / maxV) * (H - T - B);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxV * k / 4, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="tc-grid"/><text x="${L - 6}" y="${yy + 3.5}" text-anchor="end" class="tc-ax">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / 8));
    let lastShown = -99;
    o.labels.forEach((lb, i) => { if (i % every === 0 || (i === n - 1 && i - lastShown >= Math.ceil(every * 0.7))) { lastShown = i; g += `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" class="tc-ax">${esc(lb)}</text>`; } });
    g += `<text x="11" y="${(T + H - B) / 2}" text-anchor="middle" class="tc-ax" transform="rotate(-90 11 ${(T + H - B) / 2})">${esc(o.yLabel || 'Animals')}</text>`;
    const dots = n <= 31;
    o.series.forEach(s => {
      const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
      if (dots) s.values.forEach((v, i) => { g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--tc-surface,#fff)" stroke-width="2"/>`; });
      s.values.forEach((v, i) => { g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="11" fill="transparent"><title>${esc(s.name)} · ${esc(o.labels[i])}: ${v}</title></circle>`; });
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="tc-svg" role="img" aria-label="${esc(o.title || 'Line chart')}">${g}</svg>`;
  }
  function html(o) {
    const legend = '<div class="tc-legend">' + o.series.map(s => `<span class="tc-key"><i style="background:${s.color}${s.dash ? ';opacity:.7' : ''}"></i>${esc(s.name)} <b>${s.values.reduce((a, b) => a + b, 0)}</b></span>`).join('') + '</div>';
    const table = `<details class="tc-table"><summary>Show as table</summary><div class="tc-scroll"><table><thead><tr><th></th>${o.series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${
      o.labels.map((lb, i) => `<tr><th>${esc(lb)}</th>${o.series.map(s => `<td>${s.values[i]}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    return legend + svg(o) + `<div class="tc-note">${esc(o.unitLabel || '')}</div>` + table;
  }
  return { html, svg, niceMax };
});
