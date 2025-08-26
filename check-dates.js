// Check date ranges in CSV
const fs = require('fs');
const csv = require('csv-parse/sync');

const csvContent = fs.readFileSync('./revenue-july-august.csv', 'utf8');
const records = csv.parse(csvContent, {
  columns: true,
  skip_empty_lines: true
});

const dates = new Set();
let minDate = null;
let maxDate = null;

records.forEach(row => {
  const dateStr = row['Date'];
  if (!dateStr || dateStr === 'MSN') return;
  
  dates.add(dateStr);
  const dateParts = dateStr.split('/');
  if (dateParts.length === 3) {
    const month = parseInt(dateParts[0]);
    const day = parseInt(dateParts[1]);
    const year = 2000 + parseInt(dateParts[2]);
    const date = new Date(year, month - 1, day);
    
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
  }
});

console.log('Date Analysis:');
console.log('==============');
console.log(`Total unique dates: ${dates.size}`);
console.log(`Earliest date: ${minDate ? minDate.toLocaleDateString() : 'N/A'}`);
console.log(`Latest date: ${maxDate ? maxDate.toLocaleDateString() : 'N/A'}`);
console.log('\nLast 10 dates (sorted):');

const sortedDates = Array.from(dates).sort((a, b) => {
  const [m1, d1, y1] = a.split('/').map(Number);
  const [m2, d2, y2] = b.split('/').map(Number);
  const date1 = new Date(2000 + y1, m1 - 1, d1);
  const date2 = new Date(2000 + y2, m2 - 1, d2);
  return date2 - date1;
}).slice(0, 10);

sortedDates.forEach(d => console.log(`  ${d}`));