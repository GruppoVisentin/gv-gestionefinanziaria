import { DettFEP, DettFEA } from './puntaNetImporter';
import { Transaction } from '../types';

export const calcOutstandingInvoices = (
  snapshotDate: string,
  transactions: Transaction[],
  mapFEA: Map<string, DettFEA>,
  mapFEP: Map<string, DettFEP>
) => {
  // 1. Find all paid FEA invoices on or before snapshotDate
  const paidFEAs = new Set<string>();
  transactions.forEach(tx => {
    if (tx.type === 'INCOME' && tx.date <= snapshotDate) {
      // Try to extract invoice number (e.g., "FEA 12/2025" or "12/2025")
      const match = tx.description.match(/FEA\s+n\.\s*(\d+)\/(\d{4})/i) || 
                    tx.description.match(/FEA\s+(\d+)\/(\d{4})/i) ||
                    tx.description.match(/(\d{1,4})\/(\d{4})/);
      if (match) {
        paidFEAs.add(`${match[1]}/${match[2]}`);
      }
    }
  });

  // 2. Sum unpaid FEAs that were emitted on or before snapshotDate
  let creditiClienti = 0;
  for (const [key, invoice] of mapFEA.entries()) {
    if (invoice.dataDocumento && invoice.dataDocumento <= snapshotDate) {
      if (!paidFEAs.has(key)) {
        creditiClienti += invoice.totale;
      }
    }
  }

  // 3. Find all paid FEP invoices on or before snapshotDate
  const paidFEPs = new Set<string>();
  transactions.forEach(tx => {
    if (tx.type === 'EXPENSE' && tx.date <= snapshotDate) {
      // Extract FEP number (e.g. FEP 60/2026/E)
      const match = tx.description.match(/FEP\s+n\.\s*([\w\/\-\.]+)/i) || 
                    tx.description.match(/FEP\s+([\w\/\-\.]+)/i);
      if (match) {
        paidFEPs.add(match[1].trim().toUpperCase());
      }
    }
  });

  // 4. Sum unpaid FEPs emitted on or before snapshotDate
  let debitiFornitori = 0;
  for (const [key, invoice] of mapFEP.entries()) {
    const invKey = key.trim().toUpperCase();
    if (invoice.dataDocumento && invoice.dataDocumento <= snapshotDate) {
      if (!paidFEPs.has(invKey)) {
        debitiFornitori += invoice.totale;
      }
    }
  }

  return { 
    creditiClienti: Math.round(creditiClienti), 
    debitiFornitori: Math.round(debitiFornitori) 
  };
};
