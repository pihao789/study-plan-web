/**
 * Converts biy1.csv to bible-in-a-year-365.json plan format.
 * Run from repo root: node study-plan-web/scripts/csv-to-plan.js
 */
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'plans', 'biy1.csv');
const outPath = path.join(__dirname, '..', 'plans', 'bible-in-a-year-365.json');

function parseCSVLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
      out.push(field.trim());
      field = '';
      if (c === '\n') break;
    } else {
      field += c;
    }
  }
  if (field.length) out.push(field.trim());
  return out;
}

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const header = lines[0];
const rows = lines.slice(1);

const days = [];
for (const line of rows) {
  const cols = parseCSVLine(line);
  const daysCol = cols[0] || '';
  const first = (cols[1] || '').trim();
  const second = (cols[2] || '').trim();
  const psalm = (cols[3] || '').trim();

  const match = daysCol.match(/Day\s+(\d+)/i);
  const dayNumber = match ? parseInt(match[1], 10) : days.length + 1;

  const readings = [first, second, psalm].filter(Boolean);
  days.push({
    dayNumber,
    title: 'Day ' + dayNumber,
    readings
  });
}

const plan = {
  title: 'Bible in a Year (Fr. Mike Schmitz)',
  startDate: new Date().toISOString().slice(0, 10),
  days
};

fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
console.log('Wrote', days.length, 'days to', outPath);
