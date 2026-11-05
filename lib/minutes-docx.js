/* Vet meeting minutes (.docx) built in the browser from the memo board. No server, no new data.
   One row per key point with an empty Notes cell to type into. Needs JSZip (vendor/jszip.min.js). */
(function (g) {
  function x(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function para(text, o) {
    o = o || {};
    var rpr = (o.bold ? '<w:b/>' : '') + (o.size ? '<w:sz w:val="' + o.size + '"/>' : '');
    return '<w:p><w:pPr><w:spacing w:after="' + (o.after == null ? 60 : o.after) + '"/></w:pPr><w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + x(text) + '</w:t></w:r></w:p>';
  }
  function cell(w, inner, shade) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (shade ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EEF5"/>' : '') + '</w:tcPr>' + inner + '</w:tc>';
  }
  var W = [500, 3600, 3300, 1600]; // A4 portrait, 1.5cm margins
  function row(cells, header, minH) {
    return '<w:tr><w:trPr>' + (header ? '<w:tblHeader/>' : '') + (minH ? '<w:trHeight w:val="' + minH + '" w:hRule="atLeast"/>' : '') + '</w:trPr>' +
      cells.map(function (c, i) { return cell(W[i], c, header); }).join('') + '</w:tr>';
  }
  // opts: { memos: [{author, text}], meetingDate: 'YYYY-MM-DD' | null, now: Date }
  function buildDocumentXml(opts) {
    var memos = opts.memos || [], now = opts.now || new Date();
    var when = opts.meetingDate ? new Date(opts.meetingDate + 'T00:00:00') : now;
    var dateText = when.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var body = para('Vet meeting minutes', { bold: true, size: 36, after: 120 }) +
      para('Date: ' + dateText) + para('Attendees: ') + para('Apologies: ', { after: 200 });
    var rows = row([para('#', { bold: true }), para('Key point', { bold: true }), para('Notes / discussion', { bold: true }), para('Action / owner / due', { bold: true })], true);
    memos.forEach(function (m, i) {
      rows += row([para(String(i + 1)), para(m.text || '') + para('Raised by: ' + (m.author || ''), { size: 18 }), para(''), para('')], false, 900);
    });
    if (!memos.length) rows += row([para(''), para('No open key points.'), para(''), para('')], false, 600);
    body += '<w:tbl><w:tblPr><w:tblW w:w="' + W.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/><w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) { return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>'; }).join('') +
      '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + W.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' + rows + '</w:tbl>' +
      para('', { after: 120 }) + para('Other business / next meeting:', { bold: true }) + para('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  }
  async function build(JSZip, opts) {
    var z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/document.xml', buildDocumentXml(opts));
    return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  var api = { buildDocumentXml: buildDocumentXml, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.MinutesDocx = api;
})(typeof window !== 'undefined' ? window : globalThis);
