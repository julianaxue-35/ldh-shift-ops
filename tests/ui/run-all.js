const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
let failed = 0;
for (const f of fs.readdirSync(__dirname).filter(n => n.endsWith('.test.js')).sort()) {
  const r = spawnSync('node', [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : '\nALL UI TESTS PASSED');
process.exit(failed ? 1 : 0);
