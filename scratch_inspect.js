const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const folder = 'E:\\Direzione\\Desktop\\Nuova cartella';
const files = fs.readdirSync(folder).filter(f => f.endsWith('.xlsx'));

files.forEach(file => {
  console.log(`\n========================================`);
  console.log(`FILE: ${file}`);
  const filePath = path.join(folder, file);
  const workbook = XLSX.readFile(filePath);
  console.log(`Sheets: ${workbook.SheetNames.join(', ')}`);
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log(`Total rows in first sheet: ${rows.length}`);
  console.log(`Header row (first 3 rows):`);
  console.log(rows.slice(0, 5));
});
