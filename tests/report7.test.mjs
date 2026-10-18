import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('../vendor/jszip.min.js');
const R = require('../lib/report7.js');
const { makeReport7 } = require('./fixtures/report7-fixture.cjs');

const A = [
  { id: '9000001', name: 'Fictional One', chip: '956000000000001', location: 'Cat Room 2', kennel: '50', weight: 5, due: 46314 },
  { id: '9000002', location: 'Cat Room 2', kennel: '07', weight: 4.1, due: 46300 },
  { id: '9000003', location: 'Vet Clinic', weight: 0.86, due: 46312 },
  { id: '9000004', location: 'Cat Adoptions 1', kennel: '03', weight: 3.8, due: 46314, treatment: 'Nobivac Flex Tricat' },
  { id: '9000004', location: 'Cat Adoptions 1', kennel: '03', weight: 3.8, due: 46314, treatment: 'Nobivac Flex Tricat' }   // a duplicate row
];

test('parses the real report layout: header row found, multi-line headers, shared strings, date serials', async () => {
  const r = await R.parse(await makeReport7(A), JSZip);
  assert.equal(r.error, '');
  assert.equal(r.animals.length, 4, 'the duplicate row is dropped');
  const one = r.animals.find(a => a.id === '9000001');
  assert.deepEqual(one, { id: '9000001', treatment: 'Nobivac Flex Tricat', location: 'Cat Room 2', kennel: '50', due: '2026-10-19', weight: '5' });
  assert.equal(r.animals.find(a => a.id === '9000002').due, '2026-10-05', 'serial 46300 = 5 Oct 2026');
});

test('names, microchip numbers and ages are never read into the result', async () => {
  const r = await R.parse(await makeReport7(A), JSZip);
  const text = JSON.stringify(r.animals);
  assert.ok(!/Fictional|956000/.test(text));
  assert.deepEqual(Object.keys(r.animals[0]).sort(), ['due', 'id', 'kennel', 'location', 'treatment', 'weight']);
});

test('groupByLocation: rooms in the dashboard order then A-Z, kennels in number order', async () => {
  const r = await R.parse(await makeReport7(A), JSZip);
  const g = R.groupByLocation(r.animals, ['Cat Room 1', 'Cat Room 2', 'Vet Clinic']);
  assert.deepEqual(g.map(x => x.location), ['Cat Room 2', 'Vet Clinic', 'Cat Adoptions 1']);
  assert.deepEqual(g[0].animals.map(a => a.id), ['9000002', '9000001'], 'kennel 07 before kennel 50');
});

test('a wrong or broken file gives a clear message instead of an error', async () => {
  assert.match((await R.parse(Buffer.from('not a zip'), JSZip)).error, /could not be opened/i);
  const JS = JSZip; const z = new JS(); z.file('xl/worksheets/sheet.xml', '<worksheet><sheetData/></worksheet>');
  assert.match((await R.parse(await z.generateAsync({ type: 'nodebuffer' }), JSZip)).error, /Animal ID/);
});
