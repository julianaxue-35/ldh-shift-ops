const spaces = [['Cat Room 1', 'Cat rooms', 30], ['Cat Room 2', 'Cat rooms', 24], ['Cat Room 3', 'Cat rooms', 10], ['FIR Room', 'Cat rooms', 32],
  ['Adoption 1', 'Cat adoption', 16], ['Adoption 2', 'Cat adoption', 16], ['Cat Isolation ward', 'Isolation', 6],
  ['Pound 1', 'Pounds', 30], ['Pound 2', 'Pounds', 26], ['Pound 3', 'Pounds', 60], ['Pound 4', 'Pounds', 9], ['Transport', 'Transport', 10]];

// Round 3 (0010_round3.sql) task shapes, for tests/ui/*-page.test.js (vets,
// nurses, shelter-staff cases list) to seed via harness open({ tasks: [...] }).
const H = 3600 * 1000, D = 24 * H;
const ago = ms => new Date(Date.now() - ms).toISOString();
const ROUND3_TASKS = {
  // Vet has done the check; waiting on the nurse to make the label.
  medication: {
    title: 'MED-CASE', location: 'Pound 1', shift: 'sick_injured', type: 'medication', urgency: 'urgent',
    needs_medication: true, sm_number: 'SM102934', vet_done_at: ago(1 * H), created_at: ago(2 * H)
  },
  // Offsite (foster/rescue) case — no cage, so excluded from the heat map.
  offsite: {
    title: 'OFFSITE-CASE', location: 'Offsite', location_detail: 'Foster carer — J. Smith', shift: 'sick_injured',
    type: 'shelter', urgency: 'routine', created_at: ago(3 * H)
  },
  // Inside the 24h "Completed" window.
  completedYesterday: {
    title: 'DONE-YDAY', location: 'Pound 2', shift: 'sick_injured', type: 'shelter', urgency: 'routine',
    done: true, completed_at: ago(20 * H), created_at: ago(22 * H)
  },
  // Outside the 24h "Completed" window — should not show in that group.
  completed2DaysAgo: {
    title: 'DONE-2DAY', location: 'Pound 3', shift: 'sick_injured', type: 'shelter', urgency: 'routine',
    done: true, completed_at: ago(2 * D + 2 * H), created_at: ago(2 * D + 4 * H)
  }
};

module.exports = {
  LOCATION_ROWS: spaces.map(([name, grp, cages], i) => ({ id: 'loc' + i, name, grp, cages, sort: i + 1 })),
  ROUND3_TASKS
};
