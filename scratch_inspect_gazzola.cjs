const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const folder = 'E:\\Direzione\\Desktop\\Nuova cartella';
const filePath = path.join(folder, 'Costi 1-2-3-4.2026.xlsx');
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Details for invoice GAZZOLA ARCH. ALESSIA:");
rows.forEach((row, idx) => {
  const desc = String(row[1] ?? '').trim();
  if (desc.includes('GAZZOLA ARCH. ALESSIA')) {
    // Print this header row and the following 6 rows
    for (let i = 0; i <= 6; i++) {
      console.log(`Row ${idx + i}:`, JSON.stringify(rows[idx + i]));
    }
  }
});
