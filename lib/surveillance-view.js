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
        <div class="heat-sub">${s.cases} case${s.cases === 1 ? '' : 's'} · ${s.cages} cages${s.leading ? ' · ' + esc(L.CONDITION_LABELS[s.leading] || s.leading) : ''}</div>
      </div>`).join('') + '</div>';
  }

  function groupsHtml(survey) {
    return `<table class="queue-table heat-groups"><thead><tr><th>Group</th><th>Cases</th><th>Cages</th><th>Rate</th></tr></thead><tbody>${
      survey.groups.map(g => `<tr><td>${esc(g.name)}</td><td><b>${g.cases}</b></td><td>${g.cages}</td><td>${pct(g.rate)}</td></tr>`).join('')}</tbody></table>`;
  }

  function rankedHtml(survey) {
    if (!survey.ranked.length) return '<p class="empty-state">No signs flagged in this period.</p>';
    return `<table class="queue-table heat-ranked"><thead><tr><th>Sign</th><th>Animals</th><th>Share of cases</th></tr></thead><tbody>${
      survey.ranked.map(r => `<tr><td>${esc(L.CONDITION_LABELS[r.key] || r.key)}</td><td><b>${r.animals}</b></td><td>${r.share}%</td></tr>`).join('')}</tbody></table>`;
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

  return { heatMapHtml, groupsHtml, rankedHtml, unmappedHtml, baselineHtml, caveatHtml };
});
