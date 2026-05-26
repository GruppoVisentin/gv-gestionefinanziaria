const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const folder = 'E:\\Direzione\\Desktop\\Nuova cartella';
const filePath = path.join(folder, 'Costi 1-2-3-4.2026.xlsx');
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Searching for invoices containing 'cassa' and having non-zero Imposte:");
let fepInvoice = "";
rows.forEach((row, idx) => {
  const desc = String(row[1] ?? '').trim();
  if (desc.startsWith('FEP')) {
    fepInvoice = desc;
  }
  
  if (desc.toLowerCase().includes('cassa') && row[7] > 0) {
    console.log(`\nFound row matching in invoice: ${fepInvoice}`);
    // Print this invoice from its FEP header line down to the blank line or next FEP
    // Let's find the start row of this invoice
    let startIdx = idx;
    while (startIdx > 0 && !String(rows[startIdx][1] ?? '').startsWith('FEP')) {
      startIdx--;
    }
    for (let i = startIdx; i <= idx + 5; i++) {
      if (rows[i] && (i === startIdx || !String(rows[i][1] ?? '').startsWith('FEP'))) {
        console.log(`Row ${i}:`, JSON.stringify(rows[i]));
      } else {
        break;
      }
    }
  }
});
