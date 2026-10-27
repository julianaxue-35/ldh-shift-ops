/* LDH Shift Ops — FIR room + Feline Spectrum Assessment panel. Lives INSIDE the Behaviour page (behaviour.html), so only people
   with the Behaviour passcode can open it. Browser only: global FirPanel. Needs FSA (lib/fsa.js) and OpsCore.
   FirPanel.mount(hostEl, { sb, getInitials(), setInitials(v) }) -> { reload() }.
   Every id is fir-prefixed and every style is scoped under .fir, so it can't clash with the rest of the page. */
(function (root) {
  const CSS = `
  .fir .fir-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 14px; }
  .fir .fir-head h2 { margin: 0 0 2px; font-size: 1.15rem; }
  .fir .subtle, .fir .empty-state { font-size: 0.85rem; color: #6B7280; margin: 0; }
  .fir .err { color: #D03B3B; font-size: 0.82rem; min-height: 1.1em; margin: 0 0 8px; }
  .fir button.primary { background: #4338ca; color: #fff; box-shadow: 0 4px 14px rgba(67,56,202,0.3); }
  .fir button.danger { background: #fff; color: #D03B3B; border: 1px solid rgba(208,59,59,0.4); box-shadow: none; }
  .fir button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
  .fir .room-wrap { overflow-x: auto; padding-bottom: 6px; }
  .fir .room-title { width: min(340px, 100%); margin: 0 auto 16px; text-align: center; border: 2px solid #1E2238; border-radius: 6px; padding: 10px 14px; font-weight: 800; background: #fff; }
  .fir .room { display: flex; gap: 22px; align-items: flex-start; min-width: 820px; }
  .fir .room-main { display: grid; grid-template-columns: repeat(8, minmax(84px, 1fr)); grid-template-rows: repeat(3, 86px); grid-auto-flow: column; gap: 6px; flex: 1 1 auto; }
  .fir .room-side { display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(3, 86px); gap: 6px; flex: 0 0 300px; }
  .fir .cage { position: relative; background: #fff; border: 2px solid #1E2238; border-radius: 6px; padding: 6px 8px; text-align: left; font: inherit; color: #1E2238; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; box-shadow: none; min-width: 0; }
  .fir .cage:hover { box-shadow: 0 0 0 3px rgba(74,108,247,0.35); }
  .fir .cage:focus-visible { outline: 3px solid #4A6CF7; outline-offset: 1px; }
  .fir .cage .no { font-size: 0.72rem; font-weight: 700; color: #6B7280; }
  .fir .cage .cid { font-size: 0.92rem; font-weight: 800; overflow-wrap: anywhere; line-height: 1.15; }
  .fir .cage .cst { font-size: 0.68rem; font-weight: 700; line-height: 1.2; }
  .fir .cage.empty { border-style: dashed; border-color: rgba(30,34,56,0.35); color: #6B7280; }
  .fir .cage.s-day0 { background: #eef1fb; } .fir .cage.s-wait { background: #e8f1ff; }
  .fir .cage.s-due { background: #ffe9c7; border-color: #c2710c; }
  .fir .cage.s-graduate { background: #cdeed9; border-color: #17694a; }
  .fir .cage.s-outcome1 { background: #c9e8a6; } .fir .cage.s-outcome2 { background: #fff3a0; } .fir .cage.s-outcome3 { background: #f7c28b; } .fir .cage.s-outcome4 { background: #f4a0a0; }
  .fir .legend { display: flex; gap: 8px 14px; flex-wrap: wrap; font-size: 0.74rem; color: #6B7280; margin-top: 14px; align-items: center; }
  .fir .legend i { display: inline-block; width: 14px; height: 14px; border-radius: 4px; border: 1.5px solid #1E2238; vertical-align: -2px; margin-right: 5px; }
  .fir.fir-overlay { position: fixed; inset: 0; background: rgba(30,34,56,0.5); z-index: 8000; display: none; }
  .fir.fir-overlay.open { display: flex; }
  .fir.fir-overlay.modal { align-items: center; justify-content: center; padding: 16px; }
  .fir .fir-modal { background: #fff; border-radius: 16px; padding: 24px; width: min(440px, 100%); max-height: 92vh; overflow-y: auto; }
  .fir .fir-modal h2 { margin: 0 0 4px; font-size: 1.15rem; }
  .fir .fir-modal label, .fir .field-l { font-size: 0.78rem; font-weight: 700; color: #6B7280; display: block; margin-bottom: 4px; }
  .fir.fir-overlay.drawer { justify-content: flex-end; }
  .fir .drawer-panel { background: #F4F6FB; width: min(780px, 100%); height: 100%; overflow-y: auto; padding: 22px 24px 40px; }
  .fir .dr-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .fir .dr-head h2 { margin: 0; font-size: 1.35rem; }
  .fir .dr-meta { font-size: 0.82rem; color: #6B7280; margin: 2px 0 12px; }
  .fir .whobar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #fff; border: 1.5px solid #FF9F43; border-radius: 12px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.82rem; font-weight: 700; }
  .fir .whobar.ok { border-color: rgba(34,154,99,0.5); }
  .fir .whobar input { width: 90px; margin: 0; padding: 6px 10px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
  .fir .whobar .why { font-weight: 500; color: #6B7280; font-size: 0.78rem; }
  .fir .whobar.need { background: #fff1de; }
  .fir .banner { border-radius: 12px; padding: 12px 16px; font-size: 0.9rem; margin-bottom: 14px; border: 1px solid rgba(30,34,56,0.1); background: #fff; }
  .fir .banner.grad { background: #cdeed9; border-color: #17694a; color: #0f4a33; }
  .fir .banner.sm { background: #fff3d6; border-color: #c2710c; color: #6b3d00; font-weight: 600; }
  .fir .stabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
  .fir .stab { background: #fff; border: 1.5px solid rgba(30,34,56,0.1); border-radius: 12px; padding: 8px 6px; text-align: center; font-size: 0.82rem; box-shadow: none; line-height: 1.25; }
  .fir .stab small { display: block; font-weight: 500; color: #6B7280; font-size: 0.7rem; }
  .fir .stab[aria-selected="true"] { border-color: #4338ca; box-shadow: 0 0 0 1px #4338ca; background: #f5f6ff; }
  .fir .stab.done small { color: #17694a; font-weight: 700; } .fir .stab.due small { color: #b35a00; font-weight: 700; }
  .fir .keybar { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.78rem; color: #6B7280; margin: 0 0 12px; }
  .fir .keybar b { color: #1E2238; }
  .fir details.sec { background: #fff; border: 1px solid rgba(30,34,56,0.1); border-radius: 14px; margin-bottom: 10px; box-shadow: 0 2px 6px rgba(30,34,56,0.06); }
  .fir details.sec > summary { cursor: pointer; list-style: none; padding: 14px 16px; display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1rem; }
  .fir details.sec > summary::-webkit-details-marker { display: none; }
  .fir details.sec > summary .cnt { margin-left: auto; font-size: 0.78rem; font-weight: 700; color: #6B7280; white-space: nowrap; }
  .fir details.sec > summary::after { content: '\\25BE'; color: #6B7280; }
  .fir details.sec[open] > summary::after { transform: rotate(180deg); }
  .fir .sec-body { padding: 2px 16px 16px; }
  .fir .how { font-size: 0.78rem; color: #6B7280; margin: 0 0 10px; }
  .fir .grp-h { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7280; margin: 12px 0 6px; }
  .fir .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .fir .tk { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border: 1.5px solid #c7ccdb; background: #fff; font-size: 0.85rem; font-weight: 600; cursor: pointer; user-select: none; margin: 0; }
  .fir .tk.white { border-radius: 8px; } .fir .tk.gray { border-radius: 999px; background: #ececf1; }
  .fir .tk input { position: absolute; opacity: 0; inset: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; }
  .fir .tk .ico { width: 16px; height: 16px; border: 2px solid #6B7280; background: #fff; display: inline-block; }
  .fir .tk.white .ico { border-radius: 3px; } .fir .tk.gray .ico { border-radius: 50%; }
  .fir .tk.on.white { background: #fff4d6; border-color: #c2710c; } .fir .tk.on.gray { background: #d8e3ff; border-color: #4a6cf7; }
  .fir .tk.on .ico { background: currentColor; border-color: currentColor; }
  .fir .tk.on.white .ico { color: #c2710c; } .fir .tk.on.gray .ico { color: #4a6cf7; }
  .fir .tk:has(input:focus-visible) { outline: 3px solid #4A6CF7; outline-offset: 2px; }
  .fir .pts { margin-top: 16px; border-top: 1px dashed rgba(30,34,56,0.1); padding-top: 12px; }
  .fir .pts h4 { margin: 0 0 8px; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; }
  .fir .q { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid rgba(30,34,56,0.06); font-size: 0.88rem; }
  .fir .q:first-of-type { border-top: none; }
  .fir .q .qt { flex: 1 1 auto; }
  .fir .q .hintline { display: block; font-size: 0.72rem; color: #4338ca; font-weight: 600; }
  .fir .yn { display: inline-flex; border: 1.5px solid rgba(30,34,56,0.1); border-radius: 10px; overflow: hidden; flex: 0 0 auto; }
  .fir .yn button { background: #fff; border-radius: 0; padding: 8px 16px; box-shadow: none; color: #6B7280; font-weight: 700; border: 0; }
  .fir .yn button.on-yes { background: #229A63; color: #fff; } .fir .yn button.on-no { background: #6B7280; color: #fff; }
  .fir .totalbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; background: #fff; border: 1px solid rgba(30,34,56,0.1); border-radius: 14px; padding: 14px 16px; margin: 4px 0 14px; }
  .fir .totalbar .big { font-size: 1.6rem; font-weight: 800; }
  .fir .donebar { position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; background: #fff; border: 2px solid #4338ca; border-radius: 14px; padding: 14px 18px; margin: 0 0 14px; box-shadow: 0 -4px 18px rgba(30,34,56,0.12); }
  .fir .donebar.is-done { border-color: #17694a; background: #f2faf5; }
  .fir .donebar .dtext { flex: 1 1 240px; }
  .fir .donebar .dtext b { display: block; font-size: 1rem; }
  .fir .donebar .dtext small { display: block; color: #6B7280; font-size: 0.78rem; }
  .fir .donebar .donebtn { background: #229A63; color: #fff; font-size: 1.05rem; font-weight: 800; padding: 14px 28px; border-radius: 12px; box-shadow: 0 6px 18px rgba(34,154,99,0.35); }
  .fir .donebar .donebtn:hover { filter: brightness(1.08); } .fir .donebar .donebtn:active { transform: translateY(1px); }
  .fir .donebar .donebtn:focus-visible { outline: 3px solid #fff; box-shadow: 0 0 0 6px #4A6CF7; }
  .fir .warn { color: #b35a00; font-size: 0.8rem; font-weight: 600; }
  .fir table.cum { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  .fir table.cum th, .fir table.cum td { padding: 6px 10px; text-align: center; border-top: 1px solid rgba(30,34,56,0.08); }
  .fir table.cum th:first-child, .fir table.cum td:first-child { text-align: left; }
  .fir table.cum thead th { border-top: none; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280; }
  .fir table.cum tfoot td, .fir table.cum tfoot th { font-weight: 800; border-top: 2px solid rgba(30,34,56,0.25); }
  .fir .cum-note { font-size: 0.74rem; color: #6B7280; margin: 8px 0 0; }
  .fir .result { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px; }
  .fir .rbox { background: #f7f8fc; border-radius: 12px; padding: 10px 14px; }
  .fir .rbox .rl { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #6B7280; }
  .fir .rbox .rv { font-size: 1.2rem; font-weight: 800; }
  .fir .outcome { border-radius: 12px; padding: 12px 16px; font-weight: 800; margin-bottom: 4px; }
  .fir .outcome.o1 { background: #c9e8a6; } .fir .outcome.o2 { background: #fff3a0; } .fir .outcome.o3 { background: #f7c28b; } .fir .outcome.o4 { background: #f4a0a0; } .fir .outcome.og { background: #cdeed9; }
  .fir .outcome small { display: block; font-weight: 500; margin-top: 2px; }
  .fir pre.tmpl { background: #f7f8fc; border: 1px solid rgba(30,34,56,0.1); border-radius: 12px; padding: 12px 14px; font-size: 0.82rem; white-space: pre-wrap; margin: 0 0 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .fir .frow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .fir .saved { font-size: 0.75rem; color: #6B7280; }
  .fir .stressbox { display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #f5f0ff; border: 1.5px solid #7c5cbf; border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
  .fir .stressbox .st { flex: 1 1 260px; font-size: 0.9rem; } .fir .stressbox .st b { display: block; } .fir .stressbox .st small { display: block; color: #6B7280; font-weight: 500; }
  .fir .stressbox .sent { color: #17694a; font-weight: 700; }
  .fir .stressbox button { background: #7c5cbf; color: #fff; font-weight: 800; box-shadow: 0 4px 14px rgba(124,92,191,0.3); }
  .fir .smtick { display: flex; gap: 10px; align-items: flex-start; background: #fff3d6; border: 1.5px solid #c2710c; border-radius: 12px; padding: 12px 14px; margin: 10px 0; font-size: 0.9rem; font-weight: 700; cursor: pointer; }
  .fir .smtick.done { background: #cdeed9; border-color: #17694a; }
  .fir .smtick input { width: 22px; height: 22px; margin: 2px 0 0; flex: 0 0 auto; }
  .fir .smtick small { display: block; font-weight: 500; }
  .fir .cardx { background: #fff; border-radius: 16px; border: 1px solid rgba(30,34,56,0.1); box-shadow: 0 1px 2px rgba(30,34,56,0.05), 0 6px 20px rgba(30,34,56,0.05); padding: 16px 18px; margin-bottom: 12px; }
  .fir .cardx h3 { margin: 0 0 10px; font-size: 1rem; }
  .fir .cage.late { border-color: #D03B3B; border-width: 3px; }
  .fir .cage.late .cst::before { content: '\\26A0 '; }
  .fir .whoday { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: #fff1de; border: 1.5px solid #FF9F43; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; font-size: 0.85rem; font-weight: 700; }
  .fir .whoday.ok { background: #f2faf5; border-color: rgba(34,154,99,0.45); }
  .fir .whoday input { width: 90px; margin: 0; padding: 6px 10px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
  .fir .whoday .why { font-weight: 500; color: #6B7280; font-size: 0.78rem; flex: 1 1 260px; }
  .fir .bylab { display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 700; color: #6B7280; margin: 0 0 10px; }
  .fir .bylab input { width: 80px; margin: 0; padding: 5px 9px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
  .fir .donewrap { margin-top: 22px; border-top: 1px solid rgba(30,34,56,0.1); padding-top: 14px; }
  .fir .donewrap h3 { margin: 0 0 2px; font-size: 1rem; }
  .fir .donerow { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 10px 0; border-top: 1px solid rgba(30,34,56,0.06); font-size: 0.85rem; }
  .fir .donerow:first-of-type { border-top: none; }
  .fir .donerow .dl { flex: 1 1 260px; } .fir .donerow .dl b { font-size: 0.95rem; } .fir .donerow .dl small { display: block; color: #6B7280; }
  .fir .donerow select { width: auto; margin: 0; }
  .fir .rmlink { background: none; border: none; box-shadow: none; padding: 0; color: #6B7280; font-weight: 600; font-size: 0.78rem; text-decoration: underline; cursor: pointer; }
  .fir-banner-list { margin: 6px 0 0; padding: 0; list-style: none; font-size: 0.85rem; font-weight: 600; }
  .fir-banner-list li { margin: 2px 0; }
  .fir-banner-list button { background: transparent; border: none; box-shadow: none; padding: 0; color: inherit; font: inherit; text-decoration: underline; cursor: pointer; text-align: left; }
  .fir .statswrap { margin-top: 22px; border-top: 1px solid rgba(30,34,56,0.1); padding-top: 14px; }
  .fir .statswrap h3 { margin: 0 0 2px; font-size: 1rem; }
  .fir .fseg { display: inline-flex; border: 2px solid rgba(30,34,56,0.12); border-radius: 12px; overflow: hidden; margin: 8px 0 12px; }
  .fir .fseg button { margin: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; color: #1E2238; padding: 7px 16px; font-weight: 600; }
  .fir .fseg button.on { background: #1E2238; color: #fff; }
  .fir .tc-svg { width: 100%; height: auto; display: block; }
  .fir .tc-grid { stroke: rgba(30,34,56,0.1); stroke-width: 1; } .fir .tc-ax { font-size: 11px; fill: #52514e; }
  .fir .tc-legend { display: flex; gap: 8px 18px; flex-wrap: wrap; margin: 6px 0 4px; font-size: 0.82rem; }
  .fir .tc-key i { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fir .tc-key-total { color: #52514e; } .fir .tc-cross { stroke: rgba(30,34,56,0.35); stroke-dasharray: 3 3; pointer-events: none; }
  .fir .tc-note { font-size: 0.72rem; color: #52514e; text-align: right; }
  .fir .tc-table { margin-top: 6px; font-size: 0.78rem; } .fir .tc-table summary { cursor: pointer; color: #52514e; }
  .fir .tc-scroll { overflow: auto; max-height: 280px; }
  .fir .tc-table table { border-collapse: collapse; } .fir .tc-table th, .fir .tc-table td { padding: 3px 10px; text-align: right; border-top: 1px solid rgba(30,34,56,0.08); } .fir .tc-table th:first-child { text-align: left; }
  .fir .tc-table tfoot th, .fir .tc-table tfoot td { font-weight: 700; border-top: 2px solid rgba(30,34,56,0.25); }
  .tc-tip { position: absolute; z-index: 9500; display: none; pointer-events: none; background: #1e2238; color: #fff; font-size: 0.78rem; padding: 8px 12px; border-radius: 10px; min-width: 150px; box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
  .tc-tip b { display: block; margin-bottom: 4px; } .tc-tip div { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
  .tc-tip i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; } .tc-tip span { margin-left: auto; padding-left: 14px; font-weight: 700; }
  .tc-tip .tc-tip-total { border-top: 1px solid rgba(255,255,255,0.25); margin-top: 4px; padding-top: 4px; }
  @media (max-width: 800px) { .fir .stabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;

  const FAQ = `
    <button type="button" class="faq-close" aria-label="Close FAQ">&times;</button>
    <h2>FAQ &mdash; FIR room and the FSA</h2><p class="subtle">How to use the FIR tab.</p>
    <h3 class="faq-group">Getting started</h3>
    <details><summary>A cat has just arrived. What do I do?</summary><div><ol><li>Make sure your <b>initials</b> are filled in (left side of the Behaviour page, or at the top of the cat's page).</li><li>Tap the <b>cage the cat is in</b> on the FIR map.</li><li>Enter the <b>animal ID</b> and the <b>arrival hour</b> (to the hour, e.g. 2 pm), add the intake type if you like, and press <b>Add cat</b>.</li></ol><p>The day the cat arrives is <b>Day 0</b>. The next morning is <b>Day 1</b>. Nothing needs assessing on Day 0.</p></div></details>
    <details><summary>Why do I need my initials?</summary><div><p>Every assessment is recorded against the initials of the person who did it, and the ShelterMate text shows who assessed each day and who wrote the behaviour notes. You can&rsquo;t tick, answer, mark done or copy without initials.</p></div></details>
    <details><summary>What do the cage colours mean?</summary><div><ul><li><b>Dashed white</b>: empty cage.</li><li><b>Pale blue-grey</b>: Day 0, arrived today.</li><li><b>Orange</b>: an assessment is due now (the tile says which).</li><li><b>Light blue</b>: in progress, nothing due yet.</li><li><b>Dark green</b>: FSA graduate, the cat is social, so assessing stops.</li><li><b>Green / yellow / orange / red</b>: the final FSA result, 1 (extremely likely to be socialised) to 4 (extremely unlikely).</li></ul><p>A tile that says <b>enter in SM</b> still needs its notes put into ShelterMate and ticked off.</p></div></details>
    <h3 class="faq-group">Doing the assessments</h3>
    <details><summary>How many assessments are there, and when?</summary><div><p>Four, over two days: <b>Day 1 AM</b>, <b>Day 1 PM</b>, <b>Day 2 AM</b> and <b>Day 2 PM</b>. Tap the cat, then pick the assessment at the top. Only the <b>AM</b> assessments carry points; the PM ones are for the tick-boxes only. By the PM of Day 2 you will have the result.</p></div></details>
    <details><summary>How do I fill one in?</summary><div><p>Work through <b>A: Greet</b>, <b>B: Crack door</b>, <b>C: Toy</b> and <b>D: Wand</b> in that order. Each heading opens to show its behaviours. Tick every behaviour you see.</p><ul><li><b>Square (white)</b> behaviours are the &ldquo;one and done&rdquo; ones.</li><li><b>Circle (grey)</b> behaviours are the affiliative signs.</li></ul><p>On an AM assessment each section also has <b>yes / no</b> questions. Just answer them; the tool adds the points. The total warns you if a question is unanswered.</p></div></details>
    <details><summary>What makes a cat an FSA graduate?</summary><div><p><b>Any one square (white) box</b> ticked at any time, or <b>4 or more circle (grey) boxes</b> added up across all the assessments, makes the cat an <b>early graduate</b>: it is social, so assessment stops and the cage turns dark green. Everyone else goes through <b>full points scoring</b>.</p></div></details>
    <details><summary>How is the points score worked out?</summary><div><p>Each <b>Yes</b> on the AM questions adds its points automatically. Day 1 AM is out of 50 and Day 2 AM is out of 51. You never type the points.</p></div></details>
    <h3 class="faq-group">The result and ShelterMate</h3>
    <details><summary>What does the result 1 to 4 mean?</summary><div><p>The tool compares the <b>Day 1 AM</b> score with the <b>Day 2 AM</b> score on the points chart: <b>1</b> extremely likely, <b>2</b> likely, <b>3</b> unlikely, <b>4</b> extremely unlikely to be socialised. After Day 1 AM only, the result is <b>provisional</b>.</p></div></details>
    <details><summary>How do I put this in ShelterMate or Teams?</summary><div><p>Fill in <b>Behaviour</b> (what the cat was like), the <b>FAS score</b> and the <b>Plan</b>. Press <b>Copy for ShelterMate</b> and paste it into the note. <b>Share (Teams)</b> opens your share menu where the device has one, otherwise it copies the text. The text includes the initials of who did each assessment and who wrote the behaviour notes.</p></div></details>
    <details><summary>How does a cage become free?</summary><div><p>Once the notes are in ShelterMate, tick <b>Entered in ShelterMate</b> in the cat&rsquo;s page. The cage becomes available straight away and the cat moves to <b>Completed</b>. There is no separate discharge step.</p></div></details>
    <details><summary>What is the Completed list? Can I undo it?</summary><div><p>Completed cats show under the room with their animal ID, the cage they were in and who entered them in ShelterMate. They are kept for <b>7 days</b>, then deleted from the system. Within the 7 days press <b>Put back</b> to return a cat to its cage (or pick another free cage if it is taken), then tick it again when ready.</p></div></details>
    <details><summary>What is the banner at the top, and the red cages?</summary><div><p>The banner reminds staff of things to pick up: an assessment that was not done when it was due, or notes still not in ShelterMate <b>2 days after the final assessment</b>. Tap a line to open that cat. The cage is outlined in red on the map until it is sorted.</p></div></details>
    <details><summary>Whose initials go on the assessments?</summary><div><p>Enter your initials once at the <b>start of the day</b> on the tablet (&ldquo;Signed in on this tablet as&rdquo;). They go on every assessment and behaviour note you do that day. If someone else did a particular assessment or wrote the notes, change the initials in the <b>Assessed by</b> or <b>Behaviour notes by</b> box inside the cat.</p></div></details>
    <details><summary>I added a cat by mistake.</summary><div><p>While nothing has been recorded for the cat, open it and press <b>Remove it</b> at the bottom. After that, use the normal steps instead.</p></div></details>
    <details><summary>How do I ask the vets to start shelter stress medication?</summary><div><p>Open the cat and press <b>Start on shelter stress meds &mdash; send to vet</b> (in the ShelterMate note section). You can do it any time before the cat is ticked as entered in ShelterMate, including for early graduates. It sends a task to the vets with the animal ID, <b>FIR Room</b> and the cage number, plus the FSA score and your behaviour notes, and it appears on the Behaviour page under <b>Requested from the vets</b>. It records who sent it and when; pressing again asks first, so a request isn&rsquo;t doubled by accident.</p></div></details>
    <details><summary>Where do I see how many cats come through and their FSA results?</summary><div><p>At the very bottom of the FIR tab. Pick <b>Week</b>, <b>Month</b>, <b>Quarter</b> or <b>Year</b> to see how many cats arrived and how they scored: FSA graduate, FSA 1 to 4, or still in progress. Only the counts are kept (no animal IDs), so the numbers stay even after a cat&rsquo;s record is deleted.</p></div></details>
    <details><summary>Where is the FAS picture?</summary><div><p>Under &ldquo;FAS scoring reference&rdquo; &mdash; tap it to show or hide the chart. Pick the FAS score from 1 to 5.</p></div></details>
`;

  function mount(host, cfg) {
    const FSA = root.FSA, OpsCore = root.OpsCore, esc = OpsCore.esc, sb = cfg.sb;
    if (!document.getElementById('fir-css')) { const st = document.createElement('style'); st.id = 'fir-css'; st.textContent = CSS; document.head.appendChild(st); }
    const $ = (id) => document.getElementById('fir-' + id);
    const SIDE_ORDER = [27, 26, 25, 28, 29, 32, 31, 30];   // the small block on the right, row by row (28 and 29 are the wide ones)
    const initials = () => String(cfg.getInitials() || '').trim().toUpperCase();
    let LOG = [], LOGERR = false, STAT = { period: 'month' }, CATS = [], DONE = [], OPEN = null, OPEN_SECS = new Set(['A']), EDITS = [], flushTimer = null, saving = false, pendingReload = false, addCage = null;

    host.classList.add('fir');
    host.innerHTML = `<div class="fir-head"><div><h2>FIR room &mdash; Feline Spectrum Assessment</h2><p class="subtle">Everyone sees the same cages, live. Tap a cage to add a cat, or tap a cat to assess it.</p></div>
        <button type="button" class="faq-btn" id="fir-faq-btn">&#10067; FAQ</button></div>
      <div class="whoday" id="fir-whoday"><label for="fir-who" style="margin:0">Signed in on this tablet as</label><input id="fir-who" maxlength="4" placeholder="AB" autocomplete="off"><span class="why" id="fir-whowhy"></span></div>
      <p class="err" id="fir-error"></p>
      <div class="room-wrap"><div class="room-title">Feline Intake Room</div><div class="room" id="fir-room"></div></div><div class="legend" id="fir-legend"></div>
      <div class="donewrap" id="fir-done-wrap"></div>
      <div class="statswrap" id="fir-stats-wrap"></div>`;
    const mkOverlay = (cls, id, inner) => { const d = document.createElement('div'); d.className = 'fir ' + cls; d.id = 'fir-' + id; d.innerHTML = inner; document.body.appendChild(d); return d; };
    mkOverlay('fir-overlay modal', 'add-ov', `<div class="fir-modal" role="dialog" aria-label="Add a cat"><h2 id="fir-add-title">Add a cat</h2><p class="subtle" style="margin-bottom:14px;">Day 0 is the day the cat arrives.</p>
      <label for="fir-add-id">Animal ID *</label><input id="fir-add-id" autocomplete="off" placeholder="e.g. 1176455">
      <label for="fir-add-date">Arrived (to the hour)</label><div class="frow" style="flex-wrap:nowrap;gap:8px;margin-bottom:10px;"><input id="fir-add-date" type="date" style="margin:0"><select id="fir-add-hour" style="margin:0" aria-label="Arrival hour"></select></div>
      <label for="fir-add-type">Intake type</label><input id="fir-add-type" placeholder="e.g. stray, owner surrender">
      <p class="err" id="fir-add-err"></p><div class="frow"><button type="button" class="primary" id="fir-add-save">Add cat</button><button type="button" class="secondary" id="fir-add-cancel">Cancel</button></div></div>`);
    mkOverlay('fir-overlay drawer', 'drawer-ov', '<div class="drawer-panel" id="fir-drawer"></div>');
    const faqOv = document.createElement('div'); faqOv.className = 'faq-overlay'; faqOv.id = 'fir-faq-panel'; faqOv.innerHTML = '<div class="card faq-card faq-modal" id="fir-faq">' + FAQ + '</div>'; document.body.appendChild(faqOv);
    $('faq-btn').addEventListener('click', () => faqOv.classList.add('open'));
    faqOv.addEventListener('click', (e) => { if (e.target === faqOv || e.target.closest('.faq-close')) faqOv.classList.remove('open'); });

    const catAt = (n) => CATS.find(c => c.cage === n), catById = (id) => CATS.find(c => c.id === id);
    const fmtWhen = (iso) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const sess = (cat, sid) => ((cat.data || {}).sessions || {})[sid] || {};
    const ensureSession = (cat, sid) => { cat.data.sessions[sid] = cat.data.sessions[sid] || { ticks: {}, answers: {} }; const s = cat.data.sessions[sid]; s.ticks = s.ticks || {}; s.answers = s.answers || {}; return s; };

    /* ---------- load ---------- */
    /* ---------- numbers over time (counts only: kept after a cat's record is deleted) ---------- */
    const OUTS = [['graduate', 'FSA graduate (social)', '#17694a'], ['1', 'FSA 1 \u2013 extremely likely', '#6fb83f'], ['2', 'FSA 2 \u2013 likely', '#f2c200'], ['3', 'FSA 3 \u2013 unlikely', '#ed7d31'], ['4', 'FSA 4 \u2013 extremely unlikely', '#d03b3b'], ['unscored', 'In progress / not scored', '#9aa0b4']];
    async function loadLog() {
      const r = await sb.from('fsa_log').select('*').gte('intake_at', new Date(new Date().getFullYear(), 0, 1).toISOString()).limit(1000);
      LOGERR = !!r.error; LOG = r.error ? [] : (r.data || []); renderStats();
    }
    function renderStats() {
      const wrap = $('stats-wrap'); if (!wrap) return;
      const LD = root.LDHLogic, TC = root.TrendChart;
      const head = '<h3>Cats through the FIR room</h3><p class="subtle">By arrival date and FSA result. Only counts are kept here (no animal IDs), so these numbers stay after a cat\u2019s record is deleted.</p>';
      if (!TC) { wrap.innerHTML = head; return; }
      const rows = LOG.map(r => ({ at: r.intake_at, o: r.outcome })).concat(CATS.map(c => ({ at: c.intake_at, o: FSA.logOutcome(c) })));
      const b = LD.timeBuckets(STAT.period, Date.now());
      const series = OUTS.map(([k, name, color]) => ({ name, color, values: LD.bucketCounts(rows.filter(r => r.o === k).map(r => r.at), b, false) }));
      series.push({ name: 'All cats', color: '#52514e', total: true, values: LD.bucketCounts(rows.map(r => r.at), b, false) });
      const total = series[series.length - 1].values.reduce((a, v) => a + v, 0);
      const PN = { week: 'this week', month: 'this month', quarter: 'this quarter', year: 'this year' };
      wrap.innerHTML = head + '<div class="fseg no-print" role="group" aria-label="Period">' + [['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].map(([k, l]) => `<button type="button" data-fperiod="${k}" class="${STAT.period === k ? 'on' : ''}">${l}</button>`).join('') + '</div>'
        + (LOGERR ? '<p class="warn">Past results will show here once the latest database update (0039) has been run. Cats in the room now are counted already.</p>' : '')
        + `<p class="subtle" id="fir-stats-total" style="margin-bottom:6px;"><b>${total}</b> cat${total === 1 ? '' : 's'} arrived ${PN[STAT.period]}</p>`
        + TC.html({ labels: b.labels, series, mode: 'stacked', title: 'Cats through the FIR room, ' + PN[STAT.period], unitLabel: 'Cats by arrival date, coloured by FSA result' });
    }
    $('stats-wrap').addEventListener('click', (e) => { const b = e.target.closest('[data-fperiod]'); if (!b) return; STAT.period = b.dataset.fperiod; renderStats(); });
    async function reload() {
      if (EDITS.length || saving) { pendingReload = true; return; }   // never show an older copy over changes still being saved
      const { data, error } = await sb.from('fsa_cats').select('*').in('status', ['active', 'completed']).order('cage', { ascending: true });
      $('error').textContent = error ? 'Could not load the FIR room: ' + error.message : '';
      if (error) return;
      CATS = (data || []).filter(c => c.status === 'active');
      DONE = (data || []).filter(c => c.status === 'completed').sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
      renderRoom();
      loadLog();
      if (OPEN) { const c = catById(OPEN.id); if (!c) closeDrawer(); else renderDrawer(); }
    }

    /* ---------- the room ---------- */
    function cageHtml(n, wide) {
      const cat = catAt(n), span = wide ? ` style="grid-column: span ${wide}"` : '';
      if (!cat) return `<button type="button" class="cage empty" data-cage="${n}" aria-label="Cage ${n}, empty"${span}><span class="no">${n}</span><span class="cst">Empty</span></button>`;
      const st = FSA.tileState(cat, new Date()), late = LATE.has(cat.id) ? ' late' : '';
      return `<button type="button" class="cage s-${st.key}${late}" data-cage="${n}" aria-label="Cage ${n}, ${esc(cat.animal_id)}, ${esc(st.label)}"${span}><span class="no">${n}</span><span class="cid">${esc(cat.animal_id)}</span><span class="cst">${esc(st.label)}</span></button>`;
    }
    let LATE = new Set();
    function renderRoom() {
      LATE = new Set(FSA.reminders(CATS, new Date()).map(r => r.id));
      let main = ''; for (let n = 1; n <= 24; n++) main += cageHtml(n);
      $('room').innerHTML = `<div class="room-main">${main}</div><div class="room-side">${SIDE_ORDER.map(n => cageHtml(n, n === 28 || n === 29 ? 3 : 2)).join('')}</div>`;
      $('legend').innerHTML = '<span><i style="background:#fff;border-style:dashed"></i>Empty</span><span><i style="background:#eef1fb"></i>Day 0</span><span><i style="background:#ffe9c7"></i>Assessment due</span><span><i style="background:#e8f1ff"></i>In progress</span>'
        + '<span><i style="background:#fff;border-color:#D03B3B;border-width:3px"></i>Needs picking up</span><span><i style="background:#cdeed9"></i>Graduate (social)</span><span><i style="background:#c9e8a6"></i>FSA 1</span><span><i style="background:#fff3a0"></i>FSA 2</span><span><i style="background:#f7c28b"></i>FSA 3</span><span><i style="background:#f4a0a0"></i>FSA 4</span>';
      renderBanner(); renderDone(); renderWho();
    }
    /* ---------- top banner: things staff need to pick up ---------- */
    function renderBanner() {
      const el = cfg.bannerEl; if (!el) return;
      const list = FSA.reminders(CATS, new Date());
      el.style.display = list.length ? '' : 'none';
      if (!list.length) { el.innerHTML = ''; return; }
      el.innerHTML = '<div><b>FIR room: ' + list.length + ' thing' + (list.length === 1 ? '' : 's') + ' to pick up</b><ul class="fir-banner-list">' + list.map(r => `<li><button type="button" data-fir-open="${esc(r.id)}">Cage ${r.cage} \u00B7 ${esc(r.animal_id)} \u2014 ${esc(r.text)}</button></li>`).join('') + '</ul></div>';
    }
    if (cfg.bannerEl) cfg.bannerEl.addEventListener('click', (e) => { const b = e.target.closest('[data-fir-open]'); if (!b) return; if (cfg.showTab) cfg.showTab('fir'); openCat(b.dataset.firOpen); });
    /* ---------- completed in the last 7 days (staff can put one back) ---------- */
    function renderDone() {
      const wrap = $('done-wrap'); if (!wrap) return;
      if (!DONE.length) { wrap.innerHTML = '<h3>Completed</h3><p class="subtle">Cats whose notes are in ShelterMate stay here for 7 days (then they are deleted). You can put one back within the 7 days.</p>'; return; }
      const free = []; for (let n = 1; n <= 32; n++) if (!catAt(n)) free.push(n);
      wrap.innerHTML = '<h3>Completed <span class="subtle">(kept 7 days, then deleted)</span></h3>' + DONE.map(c => {
        const sm = (c.data || {}).smEntered || {}, sum = FSA.summary(c), left = Math.max(0, 7 - Math.floor((Date.now() - new Date(c.completed_at || Date.now())) / 86400000));
        const result = sum.graduation.early ? 'FSA graduate (social)' : sum.outcome ? 'FSA ' + sum.outcome.n + (sum.outcome.provisional ? ' (provisional)' : '') : 'not scored';
        const back = free.includes(c.cage) ? `<button type="button" class="secondary" data-putback="${c.id}" data-cage="${c.cage}">Put back in cage ${c.cage}</button>`
          : `<select data-pbsel="${c.id}"><option value="">Cage ${c.cage} is taken \u2014 choose another\u2026</option>${free.map(n => `<option value="${n}">Cage ${n}</option>`).join('')}</select><button type="button" class="secondary" data-putback="${c.id}">Put back</button>`;
        return `<div class="donerow"><div class="dl"><b>${esc(c.animal_id)}</b> \u00B7 was in cage ${c.cage} \u00B7 ${esc(result)}<small>In ShelterMate: ${esc(sm.by || '?')}, ${esc(c.completed_at ? fmtWhen(c.completed_at) : '')} \u00B7 deleted in ${left} day${left === 1 ? '' : 's'}</small></div><div class="frow">${back}</div></div>`;
      }).join('');
    }
    $('done-wrap').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-putback]'); if (!b) return;
      const c = DONE.find(x => x.id === b.dataset.putback); if (!c) return;
      const sel = $('done-wrap').querySelector('[data-pbsel="' + c.id + '"]'), cage = b.dataset.cage ? +b.dataset.cage : (sel ? +sel.value : 0);
      if (!cage) { if (sel) sel.focus(); return; }
      const data = clone(c.data || {}); delete data.smEntered;
      const { error } = await sb.from('fsa_cats').update({ status: 'active', cage, data, updated_by: initials() || null }).eq('id', c.id);
      if (error) { $('error').textContent = /duplicate|unique/i.test(error.message) ? 'Cage ' + cage + ' is taken.' : 'Could not put back: ' + error.message; await reload(); return; }
      await sb.from('fsa_log').delete().eq('cat_id', c.id);   // it will be counted again when it is completed
      OpsCore.toast(c.animal_id + ' is back in cage ' + cage); await reload();
    });
    /* ---------- who is on this tablet today ---------- */
    function renderWho() {
      const w = initials(), el = $('who'); if (!el) return;
      if (document.activeElement !== el) el.value = w;
      $('whoday').classList.toggle('ok', !!w);
      $('whowhy').textContent = w ? 'Your initials go on the assessments and behaviour notes you do today. You can change who did a particular assessment or note inside the cat.' : 'Start of the day: enter your initials here (once). They are needed to tick, answer, mark done or copy.';
    }
    if (cfg.initialsEl) cfg.initialsEl.addEventListener('change', () => { renderWho(); if (OPEN && $('dr-init')) $('dr-init').value = initials(); });
    $('who').addEventListener('change', (e) => { const v = e.target.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); e.target.value = v; cfg.setInitials(v); renderWho(); if (OPEN && $('dr-init')) { $('dr-init').value = v; } });
    $('room').addEventListener('click', (e) => { const b = e.target.closest('[data-cage]'); if (!b) return; const n = +b.dataset.cage, cat = catAt(n); if (cat) openCat(cat.id); else openAdd(n); });

    /* ---------- add a cat ---------- */
    const pad2 = (x) => String(x).padStart(2, '0');
    const clock12 = (h) => ((h % 12) || 12) + (h < 12 ? ' am' : ' pm');
    $('add-hour').innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${pad2(h)}">${clock12(h)}</option>`).join('');
    const fmtHour = (iso) => new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric' });   // 25 Oct, 2 pm
    function openAdd(n) {
      addCage = n; $('add-title').textContent = 'Add a cat to cage ' + n;
      ['add-id', 'add-type'].forEach(i => { $(i).value = ''; }); const now = new Date();
      $('add-date').value = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()); $('add-hour').value = pad2(now.getHours()); $('add-err').textContent = '';
      $('add-ov').classList.add('open'); setTimeout(() => $('add-id').focus(), 50);
    }
    $('add-cancel').addEventListener('click', () => $('add-ov').classList.remove('open'));
    $('add-save').addEventListener('click', async () => {
      const id = $('add-id').value.trim(); if (!id) { $('add-err').textContent = 'Enter the animal ID.'; return; }
      const dup = CATS.find(c => c.animal_id.toLowerCase() === id.toLowerCase());
      if (dup) { $('add-err').textContent = id + ' is already in cage ' + dup.cage + '.'; return; }
      const at = $('add-date').value ? new Date($('add-date').value + 'T' + $('add-hour').value + ':00') : new Date(new Date().setMinutes(0, 0, 0));   // always on the hour
      $('add-save').disabled = true;
      const { error } = await sb.from('fsa_cats').insert({ cage: addCage, animal_id: id, intake_at: at.toISOString(), intake_type: $('add-type').value.trim() || null, created_by: initials() || null, updated_by: initials() || null, data: { sessions: {} } });
      $('add-save').disabled = false;
      if (error) { $('add-err').textContent = /duplicate|unique/i.test(error.message) ? 'Someone has just put a cat in cage ' + addCage + '.' : 'Could not add: ' + error.message; await reload(); return; }
      $('add-ov').classList.remove('open'); OpsCore.toast('Cat added to cage ' + addCage); await reload();
    });
    $('add-id').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('add-save').click(); });

    /* ---------- saving: edits are queued, applied to the newest copy and written only if nobody else saved first ---------- */
    function queueEdit(fn) { EDITS.push(fn); if ($('saved-ind')) $('saved-ind').textContent = 'Saving…'; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 500); }
    async function flush() {
      if (saving || !EDITS.length || !OPEN) return;
      saving = true; const id = OPEN.id, edits = EDITS; EDITS = [];
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          const cat = catById(id); if (!cat) break;
          const next = clone(cat); next.data = next.data || {}; next.data.sessions = next.data.sessions || {};
          edits.forEach(fn => fn(next));
          const { data, error } = await sb.from('fsa_cats').update({ data: next.data, cage: next.cage, status: next.status, updated_by: initials() || null }).eq('id', id).eq('updated_at', cat.updated_at).select();
          if (error) { $('error').textContent = /duplicate|unique/i.test(error.message) ? 'That cage is already taken.' : 'Could not save: ' + error.message; saving = false; await reload(); return; }
          if (data && data.length) { CATS[CATS.findIndex(c => c.id === id)] = data[0]; $('error').textContent = ''; break; }
          const r = await sb.from('fsa_cats').select('*').eq('id', id).single();   // someone else saved first: take their copy and apply ours on top
          if (r.data) CATS[CATS.findIndex(c => c.id === id)] = r.data;
        }
      } finally { saving = false; }
      if ($('saved-ind')) $('saved-ind').textContent = 'Saved ✓';
      renderRoom();
      if (EDITS.length) { flush(); return; }
      if (pendingReload) { pendingReload = false; reload(); }
    }
    // keeps the day an early graduate graduated (the notes are due in ShelterMate 2 days after it)
    function afterEdit(c) { const early = FSA.graduation((c.data || {}).sessions || {}).early; if (early && !c.data.gradAt) c.data.gradAt = new Date().toISOString(); if (!early) delete c.data.gradAt; }
    function localApply(fn) { const cat = catById(OPEN.id); if (!cat) return; cat.data = cat.data || {}; cat.data.sessions = cat.data.sessions || {}; fn(cat); }

    /* initials are needed for every assessment action */
    function needInitials() {
      const w = initials(); if (w) return w;
      const bar = $('whobar'); if (bar) { bar.classList.add('need'); const i = $('dr-init'); if (i) i.focus(); }
      return '';
    }

    /* ---------- the cat drawer ---------- */
    function openCat(id) {
      const cat = catById(id); if (!cat) return;
      const due = FSA.nextDue(cat, new Date());
      OPEN = { id, sid: due ? due.id : 's1' };
      $('drawer-ov').classList.add('open'); renderDrawer(); $('drawer').scrollTop = 0;
    }
    function closeDrawer() { flush(); OPEN = null; $('drawer-ov').classList.remove('open'); renderRoom(); }
    $('drawer-ov').addEventListener('click', (e) => { if (e.target === $('drawer-ov')) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (faqOv.classList.contains('open')) { faqOv.classList.remove('open'); return; } if ($('add-ov').classList.contains('open')) $('add-ov').classList.remove('open'); else if (OPEN && $('drawer-ov').classList.contains('open')) closeDrawer(); });

    function tickHtml(cat, sid, sec, grp, item) {
      const id = FSA.tickId(sec.key, grp.key, item.key), on = !!(sess(cat, sid).ticks || {})[id];
      return `<label class="tk ${item.kind}${on ? ' on' : ''}"><input type="checkbox" data-tick="${esc(id)}"${on ? ' checked' : ''}><span class="ico"></span>${esc(item.label)}</label>`;
    }
    function questionsHtml(cat, sid, def, sec) {
      const qs = FSA.QUESTIONS[def.points].filter(q => q.section === sec.key); if (!qs.length) return '';
      const s = sess(cat, sid);
      return `<div class="pts"><h4>Points questions</h4>${qs.map(q => {
        const a = (s.answers || {})[q.id], hint = q.scope && a === undefined && FSA.suggest(s, q.scope);
        return `<div class="q" data-q="${q.id}"><div class="qt">${esc(q.text)}${hint ? '<span class="hintline">Suggested: yes – you ticked a behaviour in this part. Please confirm.</span>' : ''}</div>
          <div class="yn" role="group" aria-label="${esc(q.text)}"><button type="button" data-ans="${q.id}" data-v="1" class="${a === true ? 'on-yes' : ''}">Yes</button><button type="button" data-ans="${q.id}" data-v="0" class="${a === false ? 'on-no' : ''}">No</button></div></div>`;
      }).join('')}</div>`;
    }
    function sectionHtml(cat, sid, def, sec) {
      const c = FSA.sectionCounts(sess(cat, sid), sec.key);
      return `<details class="sec" data-sec="${sec.key}"${OPEN_SECS.has(sec.key) ? ' open' : ''}><summary>${esc(sec.title)}<span class="cnt" data-cnt="${sec.key}">□ ${c.white} · ○ ${c.gray}</span></summary>
        <div class="sec-body"><p class="how"><b>How:</b> ${esc(sec.how)}</p>
        ${sec.groups.map(g => `${g.label ? `<div class="grp-h">${esc(g.label)}</div>` : ''}<div class="chips">${g.items.map(i => tickHtml(cat, sid, sec, g, i)).join('')}</div>`).join('')}
        ${def.points ? questionsHtml(cat, sid, def, sec) : ''}</div></details>`;
    }
    function cumHtml(cat) {
      const c = FSA.cumulative((cat.data || {}).sessions);
      return `<table class="cum"><thead><tr><th>Assessment</th><th>□ white</th><th>○ grey</th></tr></thead><tbody>${c.rows.map(r => `<tr data-cum="${r.id}"><td>${esc(r.label)}${r.done ? ' ✓' : ''}</td><td>${r.white}</td><td>${r.gray}</td></tr>`).join('')}</tbody>
        <tfoot><tr><th>Total</th><td>${c.white}</td><td>${c.gray}</td></tr></tfoot></table>
        <p class="cum-note">One white box at any time, or 4 grey circles in total, makes the cat an early FSA graduate (social).</p>`;
    }
    function resultHtml(cat) {
      const s = FSA.summary(cat), o = s.outcome;
      const head = s.graduation.early
        ? `<div class="outcome og">Early FSA graduate &mdash; this cat is social<small>${s.graduation.byWhite ? 'A white box was ticked. ' : ''}${s.graduation.byGray ? 'Grey circles reached ' + s.graduation.gray + ' (4 or more).' : ''}</small></div>`
        : o ? `<div class="outcome o${o.n}">${o.n} &ndash; ${esc(o.label)}${o.provisional ? ' (provisional)' : ''}<small>${esc(o.blurb)}${o.provisional ? ' Day 2 AM has not been scored yet.' : ''}</small></div>`
        : '<div class="outcome" style="background:#f0f1f6">Not scored yet<small>Answer the points questions on Day 1 AM and Day 2 AM.</small></div>';
      return `<div class="result"><div class="rbox"><div class="rl">Graduation status</div><div class="rv" style="font-size:1rem">${esc(s.graduation.status)}</div></div>
        <div class="rbox"><div class="rl">One and done (□)</div><div class="rv">${s.graduation.white}</div></div>
        <div class="rbox"><div class="rl">4 or more (○)</div><div class="rv">${s.graduation.gray}</div></div>
        <div class="rbox"><div class="rl">Day 1 points</div><div class="rv">${s.day1 ? s.day1.total : '–'}</div></div>
        <div class="rbox"><div class="rl">Day 2 points</div><div class="rv">${s.day2 ? s.day2.total : '–'}</div></div></div>${head}`;
    }
    function stressHtml(cat) {
      const sent = (cat.data || {}).stressSent;
      return `<div class="st"><b>Start on shelter stress meds?</b><small>Sends a task to the vets with the animal ID, FIR Room cage ${cat.cage}, the FSA score and your behaviour notes. It also shows on the Behaviour page under &ldquo;Requested from the vets&rdquo;.</small>${sent ? `<span class="sent">Sent to the vets \u2713 ${esc(sent.by || '?')}, ${esc(fmtWhen(sent.at))}</span>` : ''}</div>
        <button type="button" id="fir-stress">${sent ? 'Send to vet again' : 'Start on shelter stress meds \u2014 send to vet'}</button>`;
    }
    function smHtml(cat) {
      const sm = (cat.data || {}).smEntered;
      return `<label class="smtick${sm ? ' done' : ''}"><input type="checkbox" id="fir-sm"${sm ? ' checked' : ''}><span>Entered in ShelterMate${sm ? ' ✓' : ''}<small>${sm ? 'Ticked by ' + esc(sm.by || '?') + ' ' + esc(fmtWhen(sm.at)) + '.' : 'Put the text above into ShelterMate, then tick this. The cage becomes available straight away and the cat moves to Completed (kept 7 days).'}</small></span></label>`;
    }
    function renderDrawer() {
      const cat = catById(OPEN.id); if (!cat) return;
      const sid = OPEN.sid, def = FSA.sessionDef(sid), s = sess(cat, sid), now = new Date(), d = cat.data || {};
      const di = FSA.dayInfo(cat.intake_at, now), sum = FSA.summary(cat), due = FSA.nextDue(cat, now), early = sum.graduation.early;
      const dueIds = FSA.dueSessions(cat, now).map(x => x.id);
      const emptyCages = []; for (let n = 1; n <= 32; n++) if (!catAt(n)) emptyCages.push(n);
      const pts = def.points ? FSA.sessionPoints(s, def.points) : null, can = FSA.canDischarge(cat), who = initials();
      $('drawer').innerHTML = `
        <div class="dr-head"><div><h2>Cage ${cat.cage} &middot; ${esc(cat.animal_id)}</h2>
          <div class="dr-meta">Arrived ${esc(fmtHour(cat.intake_at))}${cat.intake_type ? ' &middot; ' + esc(cat.intake_type) : ''}<br><b>${di.day < 1 ? 'Day 0 (arrival day)' : 'Day ' + di.day + ' ' + di.ampm}</b>${due && !early ? ' &middot; <b>' + esc(due.label) + ' is due</b>' : ''}</div></div>
          <button type="button" class="secondary" id="fir-dr-close">Close</button></div>
        <div class="whobar${who ? ' ok' : ' need'}" id="fir-whobar"><label for="fir-dr-init" style="margin:0">Your initials</label><input id="fir-dr-init" maxlength="4" value="${esc(who)}" placeholder="AB" autocomplete="off"><span class="why">${who ? 'Recorded on this assessment and in the ShelterMate text.' : 'Required before you can tick, answer, mark done or copy.'}</span></div>
        ${early ? '<div class="banner grad"><b>FSA graduate &mdash; stop assessing. This cat is social.</b><br>You can still add notes, the FAS score and the plan below.</div>' : ''}
        ${(early || (sum.outcome && !sum.outcome.provisional)) && !d.smEntered ? '<div class="banner sm">Add these notes to ShelterMate and tick <b>Entered in ShelterMate</b> (below) before this cage can be emptied for the next cat.</div>' : ''}
        <div class="stabs" role="tablist" aria-label="Assessment">${FSA.SESSIONS.map(x => {
          const done = !!sess(cat, x.id).doneAt;
          return `<button type="button" role="tab" class="stab${done ? ' done' : ''}${!done && dueIds.includes(x.id) && !early ? ' due' : ''}" data-sid="${x.id}" aria-selected="${x.id === sid}">${esc(x.label)}<small>${done ? 'Done ✓' : early ? 'Not needed' : dueIds.includes(x.id) ? 'Due' : 'Not due yet'}${x.points ? ' · points' : ''}</small></button>`; }).join('')}</div>
        <div class="bylab"><label for="fir-by-sess" style="margin:0">Assessed by</label><input id="fir-by-sess" maxlength="4" value="${esc(s.doneBy || s.by || '')}" placeholder="${esc(who || 'AB')}" autocomplete="off"><span style="font-weight:500">${esc(def.label)} &mdash; goes in as the initials of whoever ticks first. Change it if someone else did this assessment.</span></div>
        <div class="keybar"><span><b>□ Square (white)</b> = one-and-done</span><span><b>○ Circle (grey)</b> = affiliative sign</span></div>
        ${FSA.SECTIONS.map(sec => sectionHtml(cat, sid, def, sec)).join('')}
        <div class="totalbar"><div>${def.points ? `<div style="font-size:.7rem;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:.06em">${esc(def.label)} points</div><span class="big" id="fir-pts-total">${pts.total}</span> <span class="subtle">/ ${pts.max}</span>${pts.unanswered ? `<div class="warn" id="fir-pts-warn">${pts.unanswered} question${pts.unanswered === 1 ? '' : 's'} not answered yet</div>` : '<div class="subtle" id="fir-pts-warn">All questions answered</div>'}` : '<span class="subtle">No points on PM assessments &mdash; just tick the behaviours.</span>'}</div>
</div>
        <div class="donebar${s.doneAt ? ' is-done' : ''}">${s.doneAt
          ? `<div class="dtext"><b>\u2713 ${esc(def.label)} assessment done</b><small>by ${esc(s.doneBy || s.by || '?')}, ${esc(fmtWhen(s.doneAt))}</small></div><button type="button" class="secondary" id="fir-sess-undo">Re-open</button>`
          : `<div class="dtext"><b>Finished ${esc(def.label)}?</b><small>Ticks and answers save by themselves. Press this when the assessment is complete.</small></div><button type="button" class="donebtn" id="fir-sess-done">\u2713 Mark ${esc(def.label)} done</button>`}</div>
        <section class="cardx"><h3>Cumulative check-marks</h3><div id="fir-cum-wrap">${cumHtml(cat)}</div></section>
        <section class="cardx"><h3>Result</h3><div id="fir-result-wrap">${resultHtml(cat)}</div></section>
        <section class="cardx"><h3>ShelterMate note</h3>
          <div class="bylab"><label for="fir-by-beh" style="margin:0">Behaviour notes by</label><input id="fir-by-beh" maxlength="4" value="${esc(d.behaviourBy || '')}" placeholder="${esc(who || 'AB')}" autocomplete="off"><span style="font-weight:500">Goes in as the initials of whoever types the notes. Change it if someone else wrote them.</span></div>
          <label class="field-l" for="fir-f-beh">Behaviour (how the cat is behaving)</label><textarea id="fir-f-beh" rows="4" placeholder="e.g. Day 1 - in litter tray, flattened, increased RR, dilated pupils... Day 2 - on top of den...">${esc(d.behaviour || '')}</textarea>
          <label class="field-l" for="fir-f-fas">FAS score</label>
          <details style="margin-bottom:8px"><summary style="cursor:pointer;font-size:.8rem;font-weight:600;color:#4A6CF7">FAS scoring reference (tap to show/hide chart)</summary><div style="margin-top:8px"><img src="images/fas-chart.jpg" alt="Fear, Anxiety and Stress score chart" style="max-width:100%;border-radius:8px;border:1px solid rgba(30,34,56,0.1)"><div class="subtle" style="font-style:italic;margin-top:4px">Fear, Anxiety and Stress Scores. Modified from Fear Free Pets.</div></div></details>
          <select id="fir-f-fas"><option value="">-</option>${FSA.FAS_OPTIONS.map(o => `<option value="${o.v}"${d.fas === o.v ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
          <label class="field-l" for="fir-f-plan">Plan</label>
          <select id="fir-f-plan"><option value="">-</option>${FSA.PLANS.map(p => `<option${d.plan === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
          <pre class="tmpl" id="fir-tmpl">${esc(FSA.templateText(cat))}</pre>
          <div class="stressbox" id="fir-stress-wrap">${stressHtml(cat)}</div>
          <div class="frow"><button type="button" class="primary" id="fir-btn-copy">Copy for ShelterMate</button><button type="button" class="secondary" id="fir-btn-share">Share (Teams)</button><span class="saved" id="fir-saved-ind"></span></div>
          <div id="fir-sm-wrap">${smHtml(cat)}</div></section>
        ${FSA.hasAnyEntry(cat) ? '' : '<p class="subtle" style="margin-top:6px;">Added to the wrong cage or by mistake? <button type="button" class="rmlink" id="fir-rm">Remove it</button> (only possible while nothing has been recorded).</p>'}`;
    }

    /* live updates without rebuilding the form (so a cursor or an open heading is never lost) */
    function refreshLive() {
      const cat = catById(OPEN.id); if (!cat) return;
      const def = FSA.sessionDef(OPEN.sid), s = sess(cat, OPEN.sid);
      FSA.SECTIONS.forEach(sec => { const c = FSA.sectionCounts(s, sec.key), el = document.querySelector('#fir-drawer [data-cnt="' + sec.key + '"]'); if (el) el.textContent = '□ ' + c.white + ' · ○ ' + c.gray; });
      $('cum-wrap').innerHTML = cumHtml(cat); $('result-wrap').innerHTML = resultHtml(cat); $('tmpl').textContent = FSA.templateText(cat);
      if (def.points) {
        const p = FSA.sessionPoints(s, def.points); $('pts-total').textContent = p.total;
        $('pts-warn').className = p.unanswered ? 'warn' : 'subtle'; $('pts-warn').textContent = p.unanswered ? p.unanswered + ' question' + (p.unanswered === 1 ? '' : 's') + ' not answered yet' : 'All questions answered';
        FSA.QUESTIONS[def.points].forEach(q => {
          const row = document.querySelector('#fir-drawer [data-q="' + q.id + '"]'); if (!row) return; const a = (s.answers || {})[q.id];
          row.querySelector('[data-v="1"]').className = a === true ? 'on-yes' : ''; row.querySelector('[data-v="0"]').className = a === false ? 'on-no' : '';
          const h = row.querySelector('.hintline'); if (h && a !== undefined) h.remove();
        });
      }
      const had = !!document.querySelector('#fir-drawer .banner.grad');
      if (FSA.graduation((cat.data || {}).sessions).early !== had) renderDrawer();   // graduation just changed: rebuild once so banners and tabs update
      renderRoom();
    }

    $('drawer').addEventListener('click', (e) => {
      const cat = catById(OPEN.id); if (!cat) return;
      if (e.target.closest('#fir-dr-close')) return closeDrawer();
      const st = e.target.closest('[data-sid]'); if (st) { OPEN.sid = st.dataset.sid; return renderDrawer(); }
      const ans = e.target.closest('[data-ans]');
      if (ans) {
        const who = needInitials(); if (!who) return;
        const q = ans.dataset.ans, v = ans.dataset.v === '1', sid = OPEN.sid;
        const cur = (sess(cat, sid).answers || {})[q], nv = cur === v ? undefined : v;   // tap the same one again to clear it
        const fn = (c) => { const s = ensureSession(c, sid); if (nv === undefined) delete s.answers[q]; else s.answers[q] = nv; if (!s.by) s.by = who; afterEdit(c); };
        localApply(fn); queueEdit(fn); return refreshLive();
      }
      if (e.target.closest('#fir-sess-done')) {
        const who = needInitials(); if (!who) return;
        const sid = OPEN.sid, fn = (c) => { const s = ensureSession(c, sid); s.doneAt = new Date().toISOString(); s.doneBy = who; if (!s.by) s.by = who; };
        localApply(fn); queueEdit(fn); flush(); return renderDrawer();
      }
      if (e.target.closest('#fir-sess-undo')) { const sid = OPEN.sid, fn = (c) => { const s = ensureSession(c, sid); delete s.doneAt; delete s.doneBy; }; localApply(fn); queueEdit(fn); flush(); return renderDrawer(); }
      if (e.target.closest('#fir-stress')) return sendStress(cat);
      if (e.target.closest('#fir-btn-copy')) return copyText();
      if (e.target.closest('#fir-btn-share')) return shareText();
      if (e.target.closest('#fir-rm')) {
        if (FSA.hasAnyEntry(cat)) return;
        if (!confirm('Remove ' + cat.animal_id + ' from cage ' + cat.cage + '? Nothing has been recorded for it.')) return;
        sb.from('fsa_cats').delete().eq('id', cat.id).then(() => { OPEN = null; $('drawer-ov').classList.remove('open'); reload(); });
      }
    });
    $('drawer').addEventListener('change', (e) => {
      const cat = catById(OPEN.id); if (!cat) return;
      if (e.target.id === 'fir-dr-init') {
        const v = e.target.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); e.target.value = v; cfg.setInitials(v);
        const bar = $('whobar'); bar.classList.toggle('ok', !!v); bar.classList.toggle('need', !v); bar.querySelector('.why').textContent = v ? 'Recorded on this assessment and in the ShelterMate text.' : 'Required before you can tick, answer, mark done or copy.'; return;
      }
      if (e.target.id === 'fir-by-sess' || e.target.id === 'fir-by-beh') {
        const v = e.target.value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); e.target.value = v; const sid = OPEN.sid, isSess = e.target.id === 'fir-by-sess';
        const fn = (c) => { if (isSess) { const s = ensureSession(c, sid); if (v) { s.by = v; if (s.doneAt) s.doneBy = v; } else { delete s.by; delete s.doneBy; } } else if (v) c.data.behaviourBy = v; else delete c.data.behaviourBy; };
        localApply(fn); queueEdit(fn); $('tmpl').textContent = FSA.templateText(catById(OPEN.id)); return;
      }
      const tk = e.target.closest('[data-tick]');
      if (tk) {
        const who = needInitials(); if (!who) { tk.checked = !tk.checked; return; }
        const id = tk.dataset.tick, v = tk.checked, sid = OPEN.sid;
        tk.closest('.tk').classList.toggle('on', v);
        const fn = (c) => { const s = ensureSession(c, sid); if (v) s.ticks[id] = true; else delete s.ticks[id]; if (!s.by) s.by = who; afterEdit(c); };
        localApply(fn); queueEdit(fn); return refreshLive();
      }
      if (e.target.id === 'fir-f-fas' || e.target.id === 'fir-f-plan') {
        const key = e.target.id === 'fir-f-fas' ? 'fas' : 'plan', v = e.target.value;
        const fn = (c) => { c.data[key] = v; }; localApply(fn); queueEdit(fn); $('tmpl').textContent = FSA.templateText(catById(OPEN.id)); return;
      }
      if (e.target.id === 'fir-sm') {
        const who = needInitials(); if (!who) { e.target.checked = false; return; }
        if (!e.target.checked) return;
        if (!confirm('Mark ' + cat.animal_id + ' as entered in ShelterMate?\n\nCage ' + cat.cage + ' becomes available and the cat moves to Completed (kept for 7 days, you can put it back).')) { e.target.checked = false; return; }
        const at = new Date().toISOString(), cageNo = cat.cage, id = cat.id;
        const fn = (c) => { c.data.smEntered = { at, by: who }; c.status = 'completed'; };
        localApply(fn); queueEdit(fn);
        const logRow = { cat_id: id, intake_at: cat.intake_at, completed_at: at, outcome: FSA.logOutcome(cat) };   // counts only: no animal ID, no notes
        flush().then(() => sb.from('fsa_log').upsert(logRow, { onConflict: 'cat_id' }).then(() => {}, () => {})).then(() => { OPEN = null; $('drawer-ov').classList.remove('open'); return reload(); }).then(() => OpsCore.toast('Cage ' + cageNo + ' is free for the next cat'));
      }
    });
    $('drawer').addEventListener('focusin', (e) => { if (e.target.id === 'fir-f-beh' && !initials()) { needInitials(); e.target.blur(); } });
    $('drawer').addEventListener('input', (e) => {
      if (e.target.id !== 'fir-f-beh') return;
      const who = initials(); if (!who) { needInitials(); return; }
      const v = e.target.value, fn = (c) => { c.data.behaviour = v; c.data.behaviourBy = who; };
      localApply(fn); queueEdit(fn); $('tmpl').textContent = FSA.templateText(catById(OPEN.id));
    });
    $('drawer').addEventListener('toggle', (e) => { const d = e.target; if (d.matches && d.matches('details.sec')) { d.open ? OPEN_SECS.add(d.dataset.sec) : OPEN_SECS.delete(d.dataset.sec); } }, true);

    async function sendStress(cat) {
      const who = needInitials(); if (!who) return;
      const already = (cat.data || {}).stressSent;
      if (!confirm((already ? cat.animal_id + ' was already sent to the vets (' + (already.by || '?') + ', ' + fmtWhen(already.at) + ').\n\nSend another request?' : 'Send ' + cat.animal_id + ' (FIR Room cage ' + cat.cage + ') to the vets to start shelter stress medication?') + '\n\nThe FSA score and behaviour notes go with it.')) return;
      const row = root.LDHLogic.behaviourVetRequest({ type: 'shelter_stress_med', animalId: cat.animal_id, location: 'FIR Room / ' + cat.cage, note: FSA.vetNote(cat), initials: who });
      const btn = $('stress'); if (btn) btn.disabled = true;
      const err = await OpsCore.sendTaskToVets(sb, row);
      if (btn) btn.disabled = false;
      if (err) { alert('NOT sent to the vets: ' + err.message + '. Press the button to try again.'); return; }
      const at = new Date().toISOString(), fn = (c) => { c.data.stressSent = { at, by: who }; };
      localApply(fn); queueEdit(fn);
      if ($('stress-wrap')) $('stress-wrap').innerHTML = stressHtml(catById(OPEN.id));
      OpsCore.toast('Sent to the vets \u2014 shelter stress medication');
    }
    async function copyText() {
      if (!needInitials()) return;
      const text = FSA.templateText(catById(OPEN.id));
      try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 1500))]); }
      catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (er) {} ta.remove(); }
      OpsCore.toast('Copied – paste it into ShelterMate');
    }
    async function shareText() {
      if (!needInitials()) return;
      const text = FSA.templateText(catById(OPEN.id));
      if (navigator.share) { try { await navigator.share({ title: 'FSA ' + catById(OPEN.id).animal_id, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      await copyText();
    }
    setInterval(renderRoom, 60000);   // "due" markers roll over with the clock
    return { reload, openCat };
  }
  root.FirPanel = { mount };
})(window);
