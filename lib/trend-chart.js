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
  // Monotone cubic (Fritsch-Carlson): a smooth curve that never overshoots below zero or above a data point's neighbours.
  function smoothPath(pts) {
    const n = pts.length;
    if (n < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 0; i < n - 1; i++) {
      const c1x = pts[i][0] + dx[i] / 3, c1y = pts[i][1] + t[i] * dx[i] / 3, c2x = pts[i + 1][0] - dx[i] / 3, c2y = pts[i + 1][1] - t[i + 1] * dx[i] / 3;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
    }
    return d;
  }
  // Hide the quiet lead-in (days of zeros before anything happened), but never show fewer than the last 7 buckets.
  function fitted(o) {
    const n = o.labels.length;
    let start = 0;
    if (o.fit !== false && n > 7) {
      let first = -1;
      for (let i = 0; i < n && first < 0; i++) if (o.series.some(s => (s.values[i] || 0) > 0)) first = i;
      if (first > 0) start = Math.max(0, Math.min(first - 1, n - 7));
    }
    return { start, labels: o.labels.slice(start), series: o.series.map(s => Object.assign({}, s, { values: s.values.slice(start) })) };
  }
  function stackedSvg(o, f) {
    f = f || fitted(o);
    const mode = 'stacked';
    const W = 720, H = 270, L = 48, R = 16, T = 12, B = 30;
    const labels = f.labels, n = labels.length;
    const cats = f.series.filter(s => !s.total), tot = f.series.find(s => s.total);
    const totalValues = tot ? tot.values : labels.map((_, i) => cats.reduce((a, s) => a + (s.values[i] || 0), 0));
    const drawn = mode === 'total' ? [{ name: tot ? tot.name : 'Total', color: (tot && tot.color) || '#52514e', values: totalValues }] : cats;
    const stackMax = labels.map((_, i) => cats.reduce((a, s) => a + (s.values[i] || 0), 0));
    const maxV = niceMax(Math.max(0, ...(mode === 'stacked' ? stackMax : drawn.map(s => Math.max(0, ...s.values)))));
    const plotW = W - L - R, slot = plotW / Math.max(1, n);
    const x = (i) => mode === 'stacked' ? L + slot * (i + 0.5) : L + (n > 1 ? i / (n - 1) : 0.5) * plotW;
    const y = (v) => T + (1 - v / maxV) * (H - T - B);
    const base = y(0);
    let g = '';
    for (let k = 0; k <= 4; k++) {
      const v = maxV * k / 4, yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="tc-grid"/><text x="${L - 6}" y="${yy + 3.5}" text-anchor="end" class="tc-ax">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / 8));
    let lastShown = -99;
    labels.forEach((lb, i) => { if (i % every === 0 || (i === n - 1 && i - lastShown >= Math.ceil(every * 0.7))) { lastShown = i; g += `<text x="${x(i).toFixed(1)}" y="${H - 9}" text-anchor="middle" class="tc-ax">${esc(lb)}</text>`; } });
    g += `<text x="11" y="${(T + H - B) / 2}" text-anchor="middle" class="tc-ax" transform="rotate(-90 11 ${(T + H - B) / 2})">${esc(o.yLabel || 'Animals')}</text>`;
    if (mode === 'stacked') {
      const bw = Math.min(30, slot * 0.64);
      labels.forEach((_, i) => {
        let acc = 0;
        const live = cats.filter(s => (s.values[i] || 0) > 0);
        live.forEach((s, k) => {
          const v = s.values[i], y0 = y(acc), y1 = y(acc + v), h = y0 - y1, xx = x(i) - bw / 2, top = k === live.length - 1;
          g += top && h > 4
            ? `<path d="M${xx.toFixed(1)},${y0.toFixed(1)} V${(y1 + 4).toFixed(1)} Q${xx.toFixed(1)},${y1.toFixed(1)} ${(xx + 4).toFixed(1)},${y1.toFixed(1)} H${(xx + bw - 4).toFixed(1)} Q${(xx + bw).toFixed(1)},${y1.toFixed(1)} ${(xx + bw).toFixed(1)},${(y1 + 4).toFixed(1)} V${y0.toFixed(1)} Z" fill="${s.color}" stroke="var(--tc-surface,#fff)" stroke-width="1.5"/>`
            : `<rect x="${xx.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${s.color}" stroke="var(--tc-surface,#fff)" stroke-width="1.5"/>`;
          acc += v;
        });
      });
    } else {
      drawn.forEach(s => {
        const pts = s.values.map((v, i) => [x(i), y(v)]);
        const line = smoothPath(pts);
        if (pts.length > 1) g += `<path d="${line} L${pts[pts.length - 1][0].toFixed(1)},${base.toFixed(1)} L${pts[0][0].toFixed(1)},${base.toFixed(1)} Z" fill="${s.color}" fill-opacity="${mode === 'total' ? 0.16 : 0.12}" stroke="none"/>`;
        g += `<path d="${line}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        if (n <= 31) s.values.forEach((v, i) => { if (v > 0 || n <= 14) g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${s.color}" stroke="var(--tc-surface,#fff)" stroke-width="2"/>`; });
      });
    }
    // hover layer: one tall hit area per bucket + a crosshair; the tooltip itself is drawn by the page-level handler below
    g += `<line class="tc-cross" x1="0" x2="0" y1="${T}" y2="${base}" style="display:none"/>`;
    labels.forEach((lb, i) => {
      const rows = f.series.filter(s => !s.total).map(s => [s.name, s.color, (s.raw ? s.raw.slice(f.start) : s.values)[i], s.values[i]]);
      const tip = JSON.stringify({ l: lb, r: rows.map(r => [r[0], r[1], r[3]]), t: mode === 'stacked' || mode === 'total' || tot ? totalValues[i] : null, x: +x(i).toFixed(1) });
      g += `<rect class="tc-hit" x="${(x(i) - Math.max(slot, 14) / 2).toFixed(1)}" y="${T}" width="${Math.max(slot, 14).toFixed(1)}" height="${(base - T).toFixed(1)}" fill="transparent" data-tip="${esc(tip)}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="tc-svg" role="img" aria-label="${esc(o.title || 'Activity chart')}">${g}</svg>`;
  }
  // Stacked columns (Totals): one column per day / month, the stack is the total. Quiet lead-in days are hidden.
  function stackedHtml(o) {
    const raw = (s) => s.raw || s.values, sum = (a) => a.reduce((x, y) => x + y, 0);
    const f = fitted(o);
    const legend = '<div class="tc-legend">' + o.series.filter(s => !s.total).map(s => `<span class="tc-key"><i style="background:${s.color}"></i>${esc(s.name)} <b>${sum(raw(s))}</b></span>`).join('')
      + (o.series.some(s => s.total) ? `<span class="tc-key tc-key-total">${esc(o.series.find(s => s.total).name)} <b>${sum(raw(o.series.find(s => s.total)))}</b></span>` : '') + '</div>';
    const table = `<details class="tc-table"><summary>Show as table</summary><div class="tc-scroll"><table><thead><tr><th></th>${o.series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${
      o.labels.map((lb, i) => `<tr><th>${esc(lb)}</th>${o.series.map(s => `<td>${raw(s)[i]}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>Total</th>${o.series.map(s => `<td>${sum(raw(s))}</td>`).join('')}</tr></tfoot></table></div></details>`;
    const hidden = f.start ? ` \u00B7 Quiet days before ${esc(f.labels[0])} are hidden` : '';
    return legend + stackedSvg(o, f) + `<div class="tc-note">${esc(o.unitLabel || '')}${hidden}</div>` + table;
  }
  function html(o) {
    if (o.mode === 'stacked') return stackedHtml(o);
    // s.raw = what was actually done in each bucket; the line may be a running total (s.values), but the legend and the table always use the real counts.
    const raw = (s) => s.raw || s.values, sum = (a) => a.reduce((x, y) => x + y, 0);
    const legend = '<div class="tc-legend">' + o.series.map(s => `<span class="tc-key"><i style="background:${s.color}${s.dash ? ';opacity:.7' : ''}"></i>${esc(s.name)} <b>${sum(raw(s))}</b></span>`).join('') + '</div>';
    const table = `<details class="tc-table"><summary>Show as table</summary><div class="tc-scroll"><table><thead><tr><th></th>${o.series.map(s => `<th>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${
      o.labels.map((lb, i) => `<tr><th>${esc(lb)}</th>${o.series.map(s => `<td>${raw(s)[i]}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr><th>Total</th>${o.series.map(s => `<td>${sum(raw(s))}</td>`).join('')}</tr></tfoot></table></div></details>`;
    return legend + svg(o) + `<div class="tc-note">${esc(o.unitLabel || '')}</div>` + table;
  }
  // One floating tooltip + crosshair for every chart on the page (hover, or tap on a touch screen).
  if (typeof document !== 'undefined' && !document.__tcTip) {
    document.__tcTip = true;
    let tip = null;
    const hide = () => { if (tip) tip.style.display = 'none'; document.querySelectorAll('.tc-cross').forEach(l => { l.style.display = 'none'; }); };
    const show = (hit) => {
      let d; try { d = JSON.parse(hit.getAttribute('data-tip')); } catch (e) { return; }
      if (!tip) { tip = document.createElement('div'); tip.className = 'tc-tip'; document.body.appendChild(tip); }
      tip.innerHTML = '<b>' + esc(d.l) + '</b>' + d.r.map(r => `<div><i style="background:${esc(r[1])}"></i>${esc(r[0])}<span>${r[2]}</span></div>`).join('') + (d.t != null ? `<div class="tc-tip-total">Total<span>${d.t}</span></div>` : '');
      const svgEl = hit.ownerSVGElement, cross = svgEl.querySelector('.tc-cross');
      if (cross) { cross.setAttribute('x1', d.x); cross.setAttribute('x2', d.x); cross.style.display = ''; }
      tip.style.display = 'block';
      const r = hit.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + 'px';
      tip.style.top = (window.scrollY + r.top + 6) + 'px';
    };
    document.addEventListener('mouseover', (e) => { const h = e.target.closest && e.target.closest('.tc-hit'); if (h) show(h); });
    document.addEventListener('mouseout', (e) => { if (e.target.closest && e.target.closest('.tc-hit')) hide(); });
    document.addEventListener('click', (e) => { const h = e.target.closest && e.target.closest('.tc-hit'); if (h) show(h); else hide(); });
  }
  return { html, svg, niceMax };
});
