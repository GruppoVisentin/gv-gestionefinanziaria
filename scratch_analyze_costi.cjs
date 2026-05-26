const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const folder = 'E:\\Direzione\\Desktop\\Nuova cartella';
const filePath = path.join(folder, 'Costi 1-2-3-4.2026.xlsx');
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Analyzing professional cost rows (containing 'professionisti' or 'commercialista' or 'studio'):");
let count = 0;
let fepInvoice = "";
rows.forEach((row, idx) => {
  const desc = String(row[1] ?? '').trim();
  if (desc.startsWith('FEP')) {
    fepInvoice = desc;
  }
  
  const tipologia = String(row[10] ?? '').trim().toLowerCase();
  const categoria = String(row[9] ?? '').trim().toLowerCase();
  
  if (tipologia.includes('professionist') || categoria.includes('consulenze') || categoria.includes('professionisti')) {
    if (count < 20) {
      console.log(`\nInvoice: ${fepInvoice}`);
      console.log(`Row ${idx}:`, JSON.stringify(row));
    }
    count++;
  }
});
console.log(`\nTotal professional rows found: ${count}`);
