// A fictional "Vet Treatments Due" workbook with the same layout as the real Report 7 export (x: namespace prefix,
// shared strings, multi-line header cells, dates as Excel serials). No real animals or names.
const JSZip = require('../../vendor/jszip.min.js');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function makeReport7(animals) {
  const strings = [];
  const si = (s) => { let i = strings.indexOf(s); if (i < 0) { strings.push(s); i = strings.length - 1; } return i; };
  const sCell = (ref, s) => `<x:c r="${ref}" t="s"><x:v>${si(s)}</x:v></x:c>`;
  const nCell = (ref, n) => `<x:c r="${ref}"><x:v>${n}</x:v></x:c>`;
  const rows = [];
  rows.push(`<x:row r="1">${sCell('C1', 'Vet Treatments Due')}</x:row>`);
  rows.push(`<x:row r="2">${sCell('C2', 'Date Generated:')}${sCell('E2', '19 Oct 2026')}</x:row>`);
  rows.push(`<x:row r="9">${sCell('C9', 'Vet Treatment:')}${sCell('E9', 'Nobivac Flex Tricat')}</x:row>`);
  const heads = ['Animal ID', 'Name', 'Animal \nType', 'Microchip', null, 'Shelter Tag', 'Age', 'Current Status', 'Sub Status', 'Shelter Location', null, 'Kennel Number', 'Weight', 'Treatment', 'Treatment Due \nDate'];
  const letters = 'ABCDEFGHIJKLMNO';
  rows.push(`<x:row r="14">${heads.map((h, i) => h == null ? '' : sCell(letters[i] + '14', h)).join('')}</x:row>`);
  animals.forEach((a, n) => {
    const r = 15 + n;
    rows.push(`<x:row r="${r}">${sCell('A' + r, a.id)}${a.name ? sCell('B' + r, a.name) : ''}${sCell('C' + r, 'Cat')}${a.chip ? sCell('D' + r, a.chip) : ''}${sCell('J' + r, a.location)}${a.kennel ? sCell('L' + r, a.kennel) : ''}${nCell('M' + r, a.weight || 3)}${sCell('N' + r, a.treatment || 'Nobivac Flex Tricat')}${nCell('O' + r, a.due || 46314)}</x:row>`);
  });
  const sheet = `﻿<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>${rows.join('')}</x:sheetData></x:worksheet>`;
  const sst = `﻿<?xml version="1.0" encoding="utf-8"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(s => `<x:si><x:t xml:space="preserve">${esc(s)}</x:t></x:si>`).join('')}</x:sst>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('xl/workbook.xml', '<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>');
  zip.file('xl/worksheets/sheet.xml', sheet);   // the real export names it sheet.xml, not sheet1.xml
  zip.file('xl/sharedStrings.xml', sst);
  return zip.generateAsync({ type: 'nodebuffer' });
}
module.exports = { makeReport7 };
