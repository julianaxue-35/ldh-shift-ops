#!/usr/bin/env node
/* LDH Shift Ops: monthly hard-copy backup (2026-10-30).
   Signs in with the same staff login the pages use (the LDH code is read from ~/.ldh-backup/code, which only you can read),
   then saves each table as a CSV in LDH_Backup_YYYY-MM inside the Dropbox 'monthly and yearly dashboard report' folder (Downloads if that is not writable). It only READS; it never changes the database.
   Run by hand:  node backup-export.mjs        Scheduled: see install-backup.sh (1st of each month, 7:00 am). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_ = 'https://yeazfafvylawwgoxlhbl.supabase.co';
const KEY = 'sb_publishable_fow5B_VGO3gKPf4BaULsOQ_ZiSH8q8Y';   // publishable key: safe to be public
const EMAIL = 'staff@ldh-shift-ops.local';
const TABLES = ['tasks', 'task_done_log', 'stats_daily', 'flag_history', 'memos', 'roster', 'locations', 'nurse_task_log', 'nurse_treatments',
  'nurse_treatment_doses', 'nurse_requests', 'noga_requests', 'behaviour_tasks', 'behaviour_done_log', 'aa_items', 'aa_done_log',
  'surgery_log', 'fsa_cats', 'fsa_log', 'vacc_list', 'surveillance_snapshots'];
const PAGE = 1000;

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
  const cell = v => { if (v == null) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return cols.join(',') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n') + '\n';
}

async function main() {
  const codeFile = path.join(os.homedir(), '.ldh-backup', 'code');
  const code = fs.readFileSync(codeFile, 'utf8').trim();
  const auth = await fetch(URL_ + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: code }) });
  if (!auth.ok) throw new Error('Sign-in failed (' + auth.status + '). Is the LDH code in ' + codeFile + ' current?');
  const token = (await auth.json()).access_token;
  const now = new Date();
  const name = 'LDH_Backup_' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  // Saved in Juliana's Dropbox (LDH Leadership > COO Reports > monthly and yearly dashboard report). If that folder is missing or
  // this scheduled job is not allowed to write there, it falls back to Downloads so a month is never lost.
  const DROPBOX = path.join(os.homedir(), 'Library/CloudStorage/Dropbox/work docs/job related info/LDH docs/LDH Leadership/COO Reports/monthly and yearly dashboard report');
  let dir = path.join(DROPBOX, name);
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); }
  catch { dir = path.join(os.homedir(), 'Downloads', name); fs.mkdirSync(dir, { recursive: true }); console.error('Dropbox folder not writable: saved in Downloads instead.'); }
  const summary = [];
  for (const t of TABLES) {
    const rows = [];
    let err = null;
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(URL_ + '/rest/v1/' + t + '?select=*', { headers: { apikey: KEY, Authorization: 'Bearer ' + token, Range: from + '-' + (from + PAGE - 1), 'Range-Unit': 'items' } });
      if (!r.ok) { err = r.status + ' ' + (await r.text()).slice(0, 120); break; }
      const page = await r.json();
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    if (err) { summary.push(t + ': NOT SAVED (' + err + ')'); continue; }
    fs.writeFileSync(path.join(dir, t + '.csv'), toCsv(rows));
    summary.push(t + ': ' + rows.length + ' rows');
  }
  fs.writeFileSync(path.join(dir, '_README.txt'), 'LDH Shift Ops backup, ' + now.toString() + '\n\n' + summary.join('\n') + '\n');
  console.log(dir + '\n' + summary.join('\n'));
}
if (import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
