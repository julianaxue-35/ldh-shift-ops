/* LDH Shift Ops — HTML for the disease-surveillance board. Browser: global SurveillanceView. Node: module.exports. */
(function (root, factory) {
  const logic = (typeof module === 'object' && module.exports) ? require('./ldh-logic.js') : root.LDHLogic;
  if (typeof module === 'object' && module.exports) module.exports = factory(logic);
  else root.SurveillanceView = factory(logic);
})(typeof self !== 'undefined' ? self : this, function (L) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (r) => (r == null ? '–' : r + '%');
  // Neutral blue tint that deepens with the rate — deliberately never red: there is no "high" line until a baseline exists.
  function shade(rate) {
    if (rate == null || rate <= 0) return '#f4f5f8';
    return 'rgba(74,108,247,' + Math.min(0.12 + rate / 100 * 0.55, 0.7).toFixed(2) + ')';
  }

  function heatMapHtml(survey) {
    return '<div class="heat-grid">' + survey.spaces.map(s =>
      `<div class="heat-tile" data-space="${esc(s.name)}" style="background:${shade(s.rate)}">
        <div class="heat-name">${esc(s.name)}</div>
        <div class="heat-rate">${pct(s.rate)}</div>
        <div class="heat-sub">${s.cases} case${s.cases === 1 ? '' : 's'} · ${s.cages} cages${s.leading && !(s.top3 && s.top3.length) ? ' · ' + esc(L.CONDITION_LABELS[s.leading] || s.leading) : ''}</div>
        ${s.top3 && s.top3.length ? `<div class="heat-sub heat-top3">${s.top3.map(c => '<b>' + c.animals + '</b> ' + esc(L.CONDITION_LABELS[c.key] || c.key)).join(' · ')}</div>` : ''}
      </div>`).join('') + '</div>';
  }

  function groupsHtml(survey) {
    return `<table class="queue-table heat-groups"><thead><tr><th>Group</th><th>Cases</th><th>Cages</th><th>Rate</th></tr></thead><tbody>${
      survey.groups.map(g => `<tr><td>${esc(g.name)}</td><td><b>${g.cases}</b></td><td>${g.cages}</td><td>${pct(g.rate)}</td></tr>`).join('')}</tbody></table>`;
  }

  // A space and its count as a pill: the count sits in its own badge so it can never read as part of the name ("Cat Room 2" + "2").
  const chip = (name, n) => `<span class="chip"><span class="chip-name">${esc(name)}</span><span class="chip-n">${n}</span></span>`;
  // Fixed colour per condition (the validated categorical order): the same condition is the same colour on every chart.
  const condColor = (key) => 'var(--cond-' + Math.max(0, L.SIGN_KEYS.indexOf(key)) + ')';

  // Most commonly reported: each condition with its top 3 spaces drawn as small bars (space name, bar, animal count), so nothing
  // can run out of the card and the numbers sit beside what they count.
  function rankedHtml(survey) {
    if (!survey.ranked.length) return '<p class="empty-state">No signs flagged in this period.</p>';
    const cond = {}; (survey.byCondition || []).forEach(c => { cond[c.key] = c; });
    return '<div class="rk-list">' + survey.ranked.map(r => {
      const c = cond[r.key], top = c ? c.top3 : [], max = top.length ? top[0].animals : 1;
      return `<div class="rk-item"><div class="rk-head"><span class="sw" style="background:${condColor(r.key)}"></span><b class="rk-name">${esc(L.CONDITION_LABELS[r.key] || r.key)}</b><span class="rk-total"><b>${r.animals}</b> animal${r.animals === 1 ? '' : 's'} · ${r.share}%</span></div>`
        + (top.length ? top.map(s => `<div class="bar-row rk-row"><div class="bar-label">${esc(s.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, Math.round(s.animals / max * 100))}%;background:${condColor(r.key)}"></div></div><div class="bar-val">${s.animals}</div></div>`).join('')
          : '<div class="subtle rk-none">spaces not on the list</div>') + '</div>';
    }).join('') + '</div>';
  }

  // One collapsible bar graph per condition: how many animals were flagged with it in each space (busiest condition open first).
  function conditionChartsHtml(survey) {
    const list = (survey.byCondition || []).filter(c => c.spaces.length);
    if (!list.length) return '<p class="empty-state">No signs flagged in any space in this period.</p>';
    return list.map((c, i) => {
      const max = c.spaces[0].animals;
      return `<details class="cond-chart" data-cond="${esc(c.key)}"${i === 0 ? ' open' : ''}><summary><b>${esc(L.CONDITION_LABELS[c.key] || c.key)}</b> <span class="subtle">${c.animals} animal${c.animals === 1 ? '' : 's'} · ${c.spaces.length} space${c.spaces.length === 1 ? '' : 's'}</span></summary>
        <div class="bars">${c.spaces.map(s => `<div class="bar-row"><div class="bar-label">${esc(s.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round(s.animals / max * 100))}%;background:${condColor(c.key)}"></div></div><div class="bar-val">${s.animals}</div></div>`).join('')}</div></details>`;
    }).join('');
  }

  // For each condition, the space where it is most prevalent (flagged animals as a share of that space's cages), as ranked horizontal bars.
  function prevalenceHtml(survey) {
    const list = (survey.byCondition || []).filter(c => c.peak).sort((a, b) => b.peak.rate - a.peak.rate || b.peak.animals - a.peak.animals);
    if (!list.length) return '<p class="empty-state">No signs flagged in any space in this period.</p>';
    const max = list[0].peak.rate || 1;
    return '<div class="bars prevalence">' + list.map(c => `<div class="bar-row prev-row"><div class="bar-label">${esc(L.CONDITION_LABELS[c.key] || c.key)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round(c.peak.rate / max * 100))}%;background:${condColor(c.key)}"></div></div>
      <div class="bar-val wide"><b>${pct(c.peak.rate)}</b> ${esc(c.peak.name)} <span class="subtle">(${c.peak.animals} of ${c.peak.cages} cages)</span></div></div>`).join('') + '</div>';
  }

  // What was reported in each space: every condition with its animal count and the animals' IDs, and the top 3. Spaces with no cases are left out.
  function roomsHtml(survey) {
    const rooms = survey.spaces.filter(s => s.cases > 0).sort((a, b) => b.cases - a.cases || (a.name < b.name ? -1 : 1));
    if (!rooms.length) return '<p class="empty-state">No signs flagged in any space in this period.</p>';
    const label = k => esc(L.CONDITION_LABELS[k] || k);
    return `<table class="queue-table heat-rooms"><thead><tr><th>Space</th><th>Cases</th><th>Top 3 reported</th><th>All conditions reported (animals)</th></tr></thead><tbody>${
      rooms.map(s => `<tr data-space="${esc(s.name)}"><td><b>${esc(s.name)}</b><div class="subtle">${esc(s.grp || '')}</div></td><td><b>${s.cases}</b><div class="subtle">${pct(s.rate)}</div></td>
        <td>${s.top3.map((c, i) => `${i + 1}. ${label(c.key)} <b>${c.animals}</b>`).join('<br>')}</td>
        <td>${s.conditions.map(c => `<div><b>${label(c.key)}</b>: ${c.animals}</div>`).join('')}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---- dashboard pieces (one species at a time) ----
  function kpiTile(label, value, sub) { return `<div class="kpi"><div class="kpi-val">${value}</div><div class="kpi-label">${esc(label)}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`; }
  function kpiHtml(sp) {
    const s = sp.survey, withCases = s.spaces.filter(x => x.cases > 0).length, cages = s.spaces.reduce((n, x) => n + x.cages, 0);
    const top = s.ranked[0], peak = (s.byCondition || []).filter(c => c.peak).sort((a, b) => b.peak.rate - a.peak.rate)[0];
    const spPeak = s.spaces.filter(x => x.rate != null && x.cases > 0).sort((a, b) => b.rate - a.rate)[0];
    return '<div class="kpi-row">'
      + kpiTile('Cases flagged', '<b>' + s.totalCases + '</b>', s.animals + ' animal' + (s.animals === 1 ? '' : 's'))
      + kpiTile('Spaces with cases', '<b>' + withCases + '</b> of ' + s.spaces.length, '')
      + kpiTile('Overall rate', '<b>' + pct(cages ? Math.round(s.spaces.reduce((n, x) => n + x.cases, 0) / cages * 1000) / 10 : null) + '</b>', 'of ' + cages + ' cages')
      + kpiTile('Most reported', top ? '<b>' + esc(L.CONDITION_LABELS[top.key] || top.key) + '</b>' : '<b>–</b>', top ? top.animals + ' animal' + (top.animals === 1 ? '' : 's') : '')
      + kpiTile('Highest rate', spPeak ? '<b>' + pct(spPeak.rate) + '</b>' : '<b>–</b>', spPeak ? esc(spPeak.name) : '')
      + '</div>';
  }
  // Donut: share of cases by condition, with 2px gaps between slices; the legend carries the numbers (never colour alone).
  function donutHtml(sp) {
    const s = sp.survey, total = s.ranked.reduce((n, r) => n + r.animals, 0);
    if (!total) return '<p class="empty-state">No signs flagged in this period.</p>';
    const R = 38, C = 2 * Math.PI * R;
    let off = 0;
    const arcs = s.ranked.map(r => {
      const len = r.animals / total * C, gap = s.ranked.length > 1 ? 1.5 : 0;
      const a = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${condColor(r.key)}" stroke-width="14" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${(C - Math.max(0, len - gap)).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 50 50)"></circle>`;
      off += len; return a;
    }).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 100 100" class="donut" role="img" aria-label="Share of animals by reported condition">${arcs}<text x="50" y="49" text-anchor="middle" class="donut-n">${total}</text><text x="50" y="60" text-anchor="middle" class="donut-t">animals</text></svg>
      <ul class="legend">${s.ranked.map(r => `<li><span class="sw" style="background:${condColor(r.key)}"></span><span class="lg-name">${esc(L.CONDITION_LABELS[r.key] || r.key)}</span><span class="lg-n">${r.animals}</span><span class="lg-pct">${Math.round(r.animals / total * 100)}%</span></li>`).join('')}</ul></div>`;
  }
  // Condition x space grid of animal counts, shaded one hue light to dark (a zero is left blank).
  function matrixHtml(sp) {
    const s = sp.survey, conds = (s.byCondition || []).filter(c => c.spaces.length);
    if (!conds.length) return '<p class="empty-state">No signs flagged in this period.</p>';
    let max = 1; conds.forEach(c => c.spaces.forEach(x => { if (x.animals > max) max = x.animals; }));
    const cell = (n) => n ? `<td class="mx" style="background:rgba(42,120,214,${(0.14 + n / max * 0.6).toFixed(2)})"><b>${n}</b></td>` : '<td class="mx zero"></td>';
    return `<div class="mx-scroll"><table class="mx-table"><thead><tr><th>Condition</th>${s.spaces.map(x => `<th>${esc(x.name)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${
      conds.map(c => { const by = {}; c.spaces.forEach(x => { by[x.name] = x.animals; });
        return `<tr><th><span class="sw" style="background:${condColor(c.key)}"></span> ${esc(L.CONDITION_LABELS[c.key] || c.key)}</th>${s.spaces.map(x => cell(by[x.name] || 0)).join('')}<td class="mx tot"><b>${c.animals}</b></td></tr>`; }).join('')}</tbody></table></div>`;
  }
  function adoptionHtml(sp) {
    const a = sp.adoption;
    if (!a) return '<p class="subtle">Rabbits have no adoption room.</p>';
    const sub = a.spaces.map(x => `<div class="ad-row"><span>${esc(x.name)}</span><span><b>${x.cases}</b> case${x.cases === 1 ? '' : 's'} · ${pct(x.rate)}</span></div>`).join('');
    const compare = (label, rate, cases, cages) => `<div class="ad-bar"><div class="ad-bar-top"><span>${esc(label)}</span><b>${pct(rate)}</b></div><div class="bar-track"><div class="bar-fill${label === 'Other rooms' ? ' alt' : ''}" style="width:${Math.min(100, Math.max(rate ? 3 : 0, rate || 0) * 2)}%"></div></div><div class="subtle">${cases} case${cases === 1 ? '' : 's'} in ${cages} cages</div></div>`;
    return compare(a.label, a.rate, a.cases, a.cages) + compare('Other rooms', a.restRate, a.restCases, a.restCages) + (sub ? `<div class="ad-list">${sub}</div>` : '');
  }
  const card = (title, inner, cls) => `<section class="dcard ${cls || ''}"><h4>${esc(title)}</h4>${inner}</section>`;
  // The whole dashboard for one species.
  function dashboardHtml(sp) {
    const s = sp.survey;
    return kpiHtml(sp)
      + '<div class="dgrid">'
      + card('Conditions reported', donutHtml(sp))
      + card('Most commonly reported (top 3 spaces)', rankedHtml(s))
      + card('Heat map: share of cages with a flagged animal', heatMapHtml(s), 'wide')
      + card('Adoption rooms' + (sp.adoption ? ': ' + sp.adoption.label : ''), adoptionHtml(sp))
      + card('Where each condition is most prevalent', prevalenceHtml(s))
      + card('Condition by space (animals flagged)', matrixHtml(sp), 'wide')
      + card('Each condition by space (graphs)', '<div class="no-print mx-btns"><button type="button" class="secondary cond-expand">Expand all</button> <button type="button" class="secondary cond-collapse">Collapse all</button></div>' + conditionChartsHtml(s), 'wide')
      + '</div>';
  }

  function unmappedHtml(survey) {
    if (!survey.unmapped) return '';
    return `<p class="subtle">${survey.unmapped} flagged animal${survey.unmapped === 1 ? '' : 's'} had a space that isn't in the list, so ${survey.unmapped === 1 ? 'it is' : 'they are'} counted in the totals and the ranking but not on a tile.</p>`;
  }

  // lastDate: ISO 'YYYY-MM-DD' of the newest snapshot (built from its parts so there is no UTC shift).
  function baselineHtml(status, lastDate) {
    let extra = '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(lastDate || '');
    if (m) extra = ' Last snapshot: ' + esc(new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })) + '.';
    else if (status.days === 0) extra = ' No snapshot has been taken yet.';
    return status.done
      ? `<div class="baseline-banner done">Baseline year complete — this year's rates can now be compared with the same time last year.${extra}</div>`
      : `<div class="baseline-banner">Building your baseline — day ${status.day} of ${status.of}. It runs for a full year because disease varies with the season; from next year each period is compared with the same time last year. Until then rates are shown as they are, with no "high" line.${extra}</div>`;
  }

  function caveatHtml() {
    return '<p class="subtle heat-caveat">Rate = flagged cases as a share of a space\'s cages in this period. A case is one animal with one flagged sign: an animal counts once for the same sign, but twice if two different signs were flagged. Cages are capacity, not occupancy, so a half-empty space reads low. Only animals someone flagged are counted, so this reads lower than vet-exam prevalence — compare it against your own baseline, not older prevalence figures. Requests synced from the shift tools carry no sign, so only cases flagged on the dashboard appear here until the vet-diagnosed conditions are added.</p>';
  }

  return { heatMapHtml, groupsHtml, rankedHtml, conditionChartsHtml, prevalenceHtml, roomsHtml, dashboardHtml, kpiHtml, donutHtml, matrixHtml, adoptionHtml, unmappedHtml, baselineHtml, caveatHtml };
});
