const spaces = [['Cat Room 1', 'Cat rooms', 30], ['Cat Room 2', 'Cat rooms', 24], ['Cat Room 3', 'Cat rooms', 10], ['FIR Room', 'Cat rooms', 32],
  ['Adoption 1', 'Cat adoption', 16], ['Adoption 2', 'Cat adoption', 16], ['Cat Isolation ward', 'Isolation', 6],
  ['Pound 1', 'Pounds', 30], ['Pound 2', 'Pounds', 26], ['Pound 3', 'Pounds', 60], ['Pound 4', 'Pounds', 9], ['Transport', 'Transport', 10]];
module.exports = { LOCATION_ROWS: spaces.map(([name, grp, cages], i) => ({ id: 'loc' + i, name, grp, cages, sort: i + 1 })) };
