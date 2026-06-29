import fs from 'fs';
import XLSX from 'xlsx';

const data = JSON.parse(fs.readFileSync('gv-cashflow.gvcf', 'utf8'));
const transactions = data.transactions || [];

// Read Excel consuntivo
const filePath = 'e:\\Direzione\\Desktop\\PIANIFICAZIONE FLUSSO DI CASSA ANNUALE.xlsx';
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['FLUSSO DI CASSA 2026'];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile'];
const previstoColIndices = [5, 10, 15, 20];
const consuntivoColIndices = [6, 11, 16, 21];

const excelCategories = {};

rows.forEach((row, rowIndex) => {
  const cat = String(row[0] || '').trim();
  if (rowIndex >= 76 && cat && !cat.startsWith('TOTALE') && !cat.startsWith('USCITE') && !cat.startsWith('SALDO')) {
    excelCategories[cat] = {
      previsto: previstoColIndices.map(col => parseFloat(row[col]) || 0),
      consuntivo: consuntivoColIndices.map(col => parseFloat(row[col]) || 0)
    };
  }
});

// Let's print the detailed comparisons month by month
months.forEach((mName, mIdx) => {
  console.log(`\n=================== MONTH: ${mName} (Index: ${mIdx}) ===================`);
  
  const mStr = `2026-0${mIdx + 1}`;
  const tMonth = transactions.filter(t => t.date.startsWith(mStr) && t.type === 'EXPENSE');
  
  // Group app by category
  const appPrevMap = {};
  const appConsMap = {};
  
  tMonth.forEach(t => {
    const gross = t.amount * (1 + (t.vatRate || 0)/100);
    if (t.isForecast) {
      appPrevMap[t.category] = (appPrevMap[t.category] || 0) + gross;
    } else {
      appConsMap[t.category] = (appConsMap[t.category] || 0) + gross;
    }
  });
  
  console.log(`%-45s | %-15s | %-15s | %-15s | %-15s`, 'Category Name', 'Excel Previsto', 'Excel Consunt.', 'App Previsto', 'App Consunt.');
  console.log('-'.repeat(105));
  
  Object.keys(excelCategories).sort().forEach(cat => {
    const exPrev = excelCategories[cat].previsto[mIdx];
    const exCons = excelCategories[cat].consuntivo[mIdx];
    
    // Find matching categories in the app.
    // Since app categories have prefixes like [PERSONALE], [FORNITORI], etc.
    // Let's do a substring match.
    const appCatKeys = Object.keys(appPrevMap).concat(Object.keys(appConsMap));
    const matchingAppCats = [...new Set(appCatKeys.filter(ac => ac.toUpperCase().includes(cat.toUpperCase()) || cat.toUpperCase().includes(ac.replace(/\[.*?\]\s*/, '').toUpperCase())))];
    
    let appPrev = 0;
    let appCons = 0;
    matchingAppCats.forEach(ac => {
      appPrev += appPrevMap[ac] || 0;
      appCons += appConsMap[ac] || 0;
    });
    
    if (exPrev > 0 || exCons > 0 || appPrev > 0 || appCons > 0) {
      console.log(`%-45s | %-15s | %-15s | %-15s | %-15s`, 
        cat.substring(0, 44), 
        exPrev.toFixed(2), 
        exCons.toFixed(2), 
        appPrev.toFixed(2), 
        appCons.toFixed(2)
      );
    }
  });
});
