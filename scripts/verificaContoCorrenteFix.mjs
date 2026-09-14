import fs from 'fs';
import { parseUTCDate } from '../utils/gasCoreEngine.ts';

const NAS_PATH = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\gv-cashflow_v2-import-puntanet-automatico.gvcf`;

const raw = JSON.parse(fs.readFileSync(NAS_PATH, 'utf8'));
const data = raw.data || raw;
const transactions = data.transactions || [];
const initialData = data.initialData;
const saldoInizialeCF = data.saldoInizialeCF;

const getGrossAmount = (t) => t.amount * (1 + (t.vatRate || 0) / 100);

// Replica ESATTA della nuova calcolaSaldoAlYear di Dashboard.tsx
function calcolaSaldoAlYear(targetYear, txList) {
  const cf = saldoInizialeCF;
  const accountsList = Array.isArray(initialData.accounts) ? initialData.accounts : [];
  const annoBase = cf?.annoBase;

  const contiAnno = cf?.contiPerAnno?.[String(targetYear)];
  if (contiAnno && contiAnno.length > 0) {
    return contiAnno.reduce((sum, acc) => sum + acc.balance, 0);
  }

  if (annoBase === undefined) {
    return accountsList.reduce((sum, acc) => sum + (acc?.balance || 0), 0);
  }

  const saldoBase = accountsList.reduce((sum, acc) => sum + (acc?.balance || 0), 0) || cf.saldoManualeConsuntivo || 0;
  if (targetYear <= annoBase) return saldoBase;

  let saldo = saldoBase;
  for (let anno = annoBase; anno < targetYear; anno++) {
    const override = cf?.contiPerAnno?.[String(anno)];
    if (override && override.length > 0) {
      saldo = override.reduce((sum, acc) => sum + acc.balance, 0);
      continue;
    }
    txList.forEach(t => {
      const d = t && t.date ? parseUTCDate(t.date) : null;
      if (d && d.getUTCFullYear() === anno && !t.isForecast) {
        const amt = getGrossAmount(t);
        if (t.type === 'INCOME') saldo += amt;
        else if (t.ceType !== 'ammortamento') saldo -= amt;
      }
    });
  }
  return saldo;
}

console.log('contiPerAnno disponibili:', Object.keys(saldoInizialeCF.contiPerAnno || {}));
console.log('annoBase:', saldoInizialeCF.annoBase);
console.log('');

[2022, 2023, 2024, 2025, 2026, 2027].forEach(anno => {
  const saldo = calcolaSaldoAlYear(anno, transactions);
  console.log(`Saldo 01/01/${anno}: ${saldo.toFixed(2)}`);
});

console.log('');
console.log('Confronto: somma contiPerAnno[2025] diretta:', (saldoInizialeCF.contiPerAnno['2025'] || []).reduce((s,a)=>s+a.balance,0).toFixed(2));
console.log('Confronto: somma initialData.accounts (= saldo 1/1/2026 atteso):', initialData.accounts.reduce((s,a)=>s+a.balance,0).toFixed(2));

// Simula la curva completa per il 2026 (come farebbe contoCorrenteData) per un ultimo controllo di plausibilita'
function simulaAnno(contoCorrenteYear) {
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  let cumulative = calcolaSaldoAlYear(contoCorrenteYear, transactions);
  console.log(`\n--- Curva ${contoCorrenteYear} (start=${cumulative.toFixed(2)}) ---`);
  months.forEach((m, index) => {
    const monthTxs = transactions.filter(t => {
      const d = t && t.date ? parseUTCDate(t.date) : null;
      return d && d.getUTCFullYear() === contoCorrenteYear && d.getUTCMonth() === index;
    });
    const entrateReali = monthTxs.filter(t => t.type === 'INCOME' && !t.isForecast).reduce((s,t)=>s+getGrossAmount(t),0);
    const usciteReali = monthTxs.filter(t => t.type === 'EXPENSE' && !t.isForecast && t.ceType !== 'ammortamento').reduce((s,t)=>s+getGrossAmount(t),0);
    cumulative += (entrateReali - usciteReali);
    console.log(`  ${m}: ${cumulative.toFixed(2)}`);
  });
}
simulaAnno(2025);
simulaAnno(2026);
