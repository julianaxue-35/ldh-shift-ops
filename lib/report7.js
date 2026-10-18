/* LDH Shift Ops: read the "Vet Treatments Due" report (Report 7) exported from ShelterMate as an Excel file.
   Plain logic, no page code, so it can be tested. Pass in the JSZip library (browser global or node require).
   Only the fields the nurse needs are kept (animal ID, shelter location, kennel, treatment, due date, weight):
   names, microchip numbers and ages in the report are deliberately NOT read into the page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Report7 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function decode(s) {
    return String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  const stripNs = xml => xml.replace(/<(\/?)[A-Za-z0-9_]+:/g, '<$1').replace(/\sxmlns(:[A-Za-z0-9_]+)?="[^"]*"/g, '');
  const textOf = xml => decode((xml.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || []).map(t => t.replace(/^<t(?:\s[^>]*)?>/, '').replace(/<\/t>$/, '')).join(''));
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
  function excelDate(serial) {
    const n = Number(serial);
    if (!isFinite(n) || n < 20000 || n > 80000) return '';
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  async function parse(buffer, JSZip) {
    let zip;
    try { zip = await JSZip.loadAsync(buffer); } catch (e) { return { animals: [], error: 'That file could not be opened. Is it the Excel (.xlsx) report?' }; }
    const sheetName = Object.keys(zip.files).filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
    if (!sheetName) return { animals: [], error: 'No worksheet was found in that file.' };
    const sstFile = zip.file('xl/sharedStrings.xml');
    const shared = sstFile ? (stripNs(await sstFile.async('string')).match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(textOf) : [];
    const sheet = stripNs(await zip.file(sheetName).async('string'));
    const rows = [];
    (sheet.match(/<row\b[\s\S]*?<\/row>/g) || []).forEach(r => {
      const cells = {};
      (r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(c => {
        const ref = (/\br="([A-Z]+\d+)"/.exec(c) || [])[1]; if (!ref) return;
        const type = (/\bt="([^"]*)"/.exec(c) || [])[1];
        const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
        let val = '';
        if (type === 's') val = v == null ? '' : shared[Number(v)] || '';
        else if (type === 'inlineStr') val = textOf(c);
        else if (v != null) val = decode(v);
        cells[colIndex(ref)] = val;
      });
      rows.push(cells);
    });
    const hi = rows.findIndex(r => Object.values(r).some(v => norm(v).toLowerCase() === 'animal id'));
    if (hi < 0) return { animals: [], error: 'This does not look like the Vet Treatments Due report (no "Animal ID" column found).' };
    const head = {};
    Object.keys(rows[hi]).forEach(ci => { head[norm(rows[hi][ci]).toLowerCase()] = Number(ci); });
    const need = ['animal id', 'shelter location', 'treatment'];
    const missing = need.filter(h => head[h] == null);
    if (missing.length) return { animals: [], error: 'The report is missing the column(s): ' + missing.join(', ') + '.' };
    const animals = [], seen = new Set();
    rows.slice(hi + 1).forEach(r => {
      const id = norm(r[head['animal id']]).toUpperCase();
      if (!id || !/^[A-Z0-9][A-Z0-9-]*$/.test(id)) return;
      const treatment = norm(r[head['treatment']]);
      const key = id + '|' + treatment;
      if (seen.has(key)) return;
      seen.add(key);
      const due = head['treatment due date'] != null ? r[head['treatment due date']] : '';
      animals.push({
        id, treatment,
        location: norm(r[head['shelter location']]) || 'No location',
        kennel: head['kennel number'] != null ? norm(r[head['kennel number']]) : '',
        due: excelDate(due) || norm(due),
        weight: head['weight'] != null ? norm(r[head['weight']]) : ''
      });
    });
    if (!animals.length) return { animals: [], error: 'No animals were found in that report.' };
    return { animals, error: '' };
  }
  // Group by shelter location (in the dashboard's room order, then A-Z), kennel numbers in order within a room.
  function groupByLocation(animals, roomOrder) {
    const order = (roomOrder || []).map(x => String(x).toLowerCase());
    const by = new Map();
    animals.forEach(a => { if (!by.has(a.location)) by.set(a.location, []); by.get(a.location).push(a); });
    const rank = loc => { const i = order.indexOf(loc.toLowerCase()); return i < 0 ? 1e6 : i; };
    return Array.from(by.keys()).sort((x, y) => rank(x) - rank(y) || x.localeCompare(y)).map(loc => ({
      location: loc,
      animals: by.get(loc).slice().sort((a, b) => (parseInt(a.kennel, 10) || 1e6) - (parseInt(b.kennel, 10) || 1e6) || a.id.localeCompare(b.id))
    }));
  }
  return { parse, groupByLocation, excelDate };
});
