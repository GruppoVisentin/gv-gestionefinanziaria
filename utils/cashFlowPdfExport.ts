import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, TransactionType, InitialBalanceBreakdown, BankAccount, ExistingLoan, Project } from '../types';
import { CURRENCY_FORMATTER } from '../constants';
import { parseUTCDate } from './gasCoreEngine';

interface CashFlowPdfOptions {
  transactions: Transaction[];
  currentYear: number;
  projects: Project[];
  initialData: {
    accounts: BankAccount[];
    loans?: ExistingLoan[];
    previousFinancing?: number;
    accontiClienti?: number;
    altriDebitiBT?: number;
    mutuiBT?: number;
  };
  aiAnalysis?: string;
}

export const exportCashFlowProjectionPDF = ({
  transactions,
  currentYear,
  projects,
  initialData,
  aiAnalysis
}: CashFlowPdfOptions) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // --- CALCOLO DATI ---
  const totalInitialBalance = initialData.accounts.reduce((sum, acc) => sum + acc.balance, 0);
  
  const getGrossAmount = (t: Transaction) => {
    if (typeof t.grossAmount === 'number') return t.grossAmount;
    const amount = t.amount || 0;
    const vat = t.vatRate ? (amount * t.vatRate) / 100 : 0;
    return amount + vat;
  };

  const meseCorrente = new Date().getMonth();
  const isAnnoCorrente = currentYear === new Date().getFullYear();

  const calculateMonthlyFlow = (monthIndex: number) => {
    const hasActuals = transactions.some(t => {
      const d = parseUTCDate(t.date);
      return d.getUTCMonth() === monthIndex && d.getUTCFullYear() === currentYear && !t.isForecast;
    });

    const useActuals = hasActuals || (isAnnoCorrente && monthIndex <= meseCorrente);

    if (useActuals) {
      const actualTransactions = transactions.filter(t => {
        const d = parseUTCDate(t.date);
        return d.getUTCMonth() === monthIndex && d.getUTCFullYear() === currentYear && !t.isForecast;
      });
      const aIncome = actualTransactions
        .filter(t => t.type === TransactionType.INCOME)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      const aExpense = actualTransactions
        .filter(t => t.type === TransactionType.EXPENSE)
        .reduce((sum, t) => sum + getGrossAmount(t), 0);
      return { income: aIncome, expense: aExpense, net: aIncome - aExpense, hasActuals: true };
    }

    const forecastTransactions = transactions.filter(t => {
      const d = parseUTCDate(t.date);
      if (d.getUTCMonth() !== monthIndex || d.getUTCFullYear() !== currentYear || !t.isForecast) return false;
      return !transactions.some(act => !act.isForecast && act.linkedForecastId === t.id);
    });

    const fIncome = forecastTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    let fExpense = forecastTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const calculateLoanRepayment = (mIdx: number) => {
      const hasLoanTransactions = transactions.some(t => {
        const tDate = parseUTCDate(t.date);
        return (
          t.type === TransactionType.EXPENSE &&
          tDate.getUTCMonth() === mIdx &&
          tDate.getUTCFullYear() === currentYear &&
          (t.category === '[FINANZA] Interessi Passivi Finanziamenti' || t.category === '[FINANZA] Quota Capitale Rate Finanziamenti')
        );
      });
      if (hasLoanTransactions) return 0;

      let total = 0;
      transactions.filter(t => {
        if (t.type !== TransactionType.INCOME) return false;
        if (t.category !== '[FINANZA] Finanziamenti Ricevuti') return false;
        if (!t.loanDetails) return false;
        if (t.isForecast && transactions.some(act =>
          !act.isForecast &&
          (act.linkedForecastId === t.id || (t.loanSourceId && act.loanSourceId === t.loanSourceId))
        )) return false;
        return true;
      }).forEach(loan => {
        const comps = calculateLoanComponents(loan.amount, loan.loanDetails, mIdx);
        total += comps.total;
      });
      if (initialData.loans) {
        initialData.loans
          .filter(l => !transactions.some(t => t.loanSourceId === l.id && parseUTCDate(t.date).getUTCFullYear() === currentYear))
          .forEach(loan => {
            const comps = calculateLoanComponents(loan.originalAmount, loan.details, mIdx);
            total += comps.total;
          });
      }
      return total;
    };

    fExpense += calculateLoanRepayment(monthIndex);

    const calculateProjectCostForMonth = (category: string, mIdx: number) => {
      let total = 0;
      projects.filter(p => p.status === 'ACTIVE' && p.estimatedStartDate).forEach(p => {
        const start = parseUTCDate(p.estimatedStartDate!);
        const startMonthGlobal = start.getUTCFullYear() * 12 + start.getUTCMonth();
        const targetMonthGlobal = currentYear * 12 + mIdx;
        const diff = targetMonthGlobal - startMonthGlobal;
        if (category === '[CONSULENZE] Professionisti Esterni di Cantiere') {
          if (diff >= -2 && diff < 0) total += (p.estimatedProfessionals || 0) / 2;
        } else if (category === '[PERSONALE] Subappalti Manodopera') {
          if (p.laborType === 'EXTERNAL' && diff >= 0 && diff < 6) total += (p.estimatedLabor || 0) / 6;
        } else if (category === '[FORNITORI] Fornitori Materiali') {
          if (diff >= 0 && diff < 6) total += (p.estimatedMaterials || 0) / 6;
        } else if (category === '[FORNITORI] Subappalti su Cantieri') {
          if (diff >= 6 && diff < 18) total += (p.estimatedSubcontractors || 0) / 12;
        }
      });
      return total;
    };

    ['[CONSULENZE] Professionisti Esterni di Cantiere', '[PERSONALE] Subappalti Manodopera', '[FORNITORI] Fornitori Materiali', '[FORNITORI] Subappalti su Cantieri'].forEach(cat => {
      fExpense += calculateProjectCostForMonth(cat, monthIndex);
    });

    return { income: fIncome, expense: fExpense, net: fIncome - fExpense, hasActuals: false };
  };

  function calculateLoanComponents(principal: number, details: any, targetMonthIndex: number) {
    if (!details || !details.interestStartDate) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

    const targetDate = new Date(Date.UTC(currentYear, targetMonthIndex, 15));
    const intStart = parseUTCDate(details.interestStartDate);
    const princStart = details.principalStartDate ? parseUTCDate(details.principalStartDate) : intStart;
    const end = details.endDate ? parseUTCDate(details.endDate) : new Date(Date.UTC(intStart.getUTCFullYear() + 20, intStart.getUTCMonth(), 15));

    if (targetDate < intStart || targetDate > end) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

    let currentRate = details.interestRate;
    let currentType = details.rateType;
    
    if (details.rinegoziazioni && details.rinegoziazioni.length > 0) {
      const rinegValide = [...details.rinegoziazioni]
        .filter((r: any) => parseUTCDate(r.dataInizio) <= targetDate)
        .sort((a: any, b: any) => parseUTCDate(b.dataInizio).getTime() - parseUTCDate(a.dataInizio).getTime());
      
      if (rinegValide.length > 0) {
        currentRate = rinegValide[0].nuovoTasso;
        currentType = rinegValide[0].nuovoTipoTasso;
      }
    }

    const i = (currentRate / 100) / 12;
    const amortizationStart = !isNaN(princStart.getTime()) ? princStart : intStart;
    
    if (targetDate >= intStart && targetDate < amortizationStart) {
        return { 
          total: principal * i, 
          principal: 0, 
          interest: principal * i,
          rateUsed: currentRate,
          typeUsed: currentType
        };
    }

    const n = (end.getUTCFullYear() - amortizationStart.getUTCFullYear()) * 12 + (end.getUTCMonth() - amortizationStart.getUTCMonth());
    if (n <= 0) return { total: 0, principal: 0, interest: 0, rateUsed: currentRate, typeUsed: currentType };

    const rataFissa = i > 0
      ? principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
      : principal / n;

    const monthsPassed = (targetDate.getUTCFullYear() - amortizationStart.getUTCFullYear()) * 12 + (targetDate.getUTCMonth() - amortizationStart.getUTCMonth());
    if (monthsPassed <= 0 || monthsPassed > n) return { total: 0, principal: 0, interest: 0, rateUsed: currentRate, typeUsed: currentType };

    const paymentsMade = monthsPassed - 1;

    const residualCapital = i > 0
      ? principal * (Math.pow(1 + i, n) - Math.pow(1 + i, paymentsMade)) / (Math.pow(1 + i, n) - 1)
      : Math.max(0, principal - (principal / n * paymentsMade));

    const interestPayment = Math.max(0, residualCapital * i);
    const principalPayment = Math.min(residualCapital, rataFissa - interestPayment);

    return {
      total: Math.round((principalPayment + interestPayment) * 100) / 100,
      principal: Math.round(principalPayment * 100) / 100,
      interest: Math.round(interestPayment * 100) / 100,
      rateUsed: currentRate,
      typeUsed: currentType
    };
  }

  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
  ];

  const monthlyData = months.map((_, i) => calculateMonthlyFlow(i));
  
  let cumulative = totalInitialBalance;
  const tableRows: any[] = [];
  let qIncome = 0, qExpense = 0, qNet = 0;

  monthlyData.forEach((data, i) => {
    cumulative += data.net;
    
    tableRows.push([
      { 
        content: data.hasActuals ? `${months[i]} (Cons.)` : `${months[i]} (Prev.)`,
        styles: { fontStyle: data.hasActuals ? 'bold' : 'normal' }
      },
      CURRENCY_FORMATTER.format(data.income),
      CURRENCY_FORMATTER.format(data.expense),
      { 
        content: CURRENCY_FORMATTER.format(data.net),
        styles: { textColor: data.net >= 0 ? [34, 34, 34] : [100, 100, 100] }
      },
      {
        content: CURRENCY_FORMATTER.format(cumulative),
        styles: { 
          textColor: cumulative >= 0 ? [34, 34, 34] : [80, 80, 80],
          fontStyle: cumulative < 0 ? 'bold' : 'normal'
        }
      }
    ]);

    qIncome += data.income;
    qExpense += data.expense;
    qNet += data.net;

    if ((i + 1) % 3 === 0) {
      tableRows.push([
        { content: `TOTALE Q${(i + 1) / 3}`, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: CURRENCY_FORMATTER.format(qIncome), styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: CURRENCY_FORMATTER.format(qExpense), styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } },
        { content: CURRENCY_FORMATTER.format(qNet), styles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: qNet >= 0 ? [34, 34, 34] : [100, 100, 100] } },
        { content: '-', styles: { fillColor: [240, 240, 240] } }
      ]);
      qIncome = 0; qExpense = 0; qNet = 0;
    }
  });

  // --- HEADER E FOOTER (Stile Premium GV) ---
  const drawHeaderFooter = (currentPage: number, totalPages: number) => {
    pdf.setFillColor(15, 23, 42); 
    pdf.rect(0, 0, pdfW, 26, 'F');

    pdf.setFillColor(217, 119, 6);
    pdf.rect(0, 26, pdfW, 1.5, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('GRUPPO VISENTIN', 12, 11);
    
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(226, 232, 240);
    pdf.text(`REPORT PROIEZIONE FLUSSI DI CASSA — ANNO ${currentYear}`, 12, 17);

    const dataGen = new Date().toLocaleDateString('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    pdf.setFontSize(8);
    pdf.setTextColor(203, 213, 225);
    pdf.text(`Generato: ${dataGen}`, pdfW - 12, 15, { align: 'right' });

    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, pdfH - 12, pdfW, 12, 'F');
    
    pdf.setFillColor(226, 232, 240);
    pdf.rect(0, pdfH - 12, pdfW, 0.5, 'F');

    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('GV Ecosystem  |  Controllo di Gestione Avanzato', 12, pdfH - 5);
    pdf.text(`Pagina ${currentPage} di ${totalPages}`, pdfW - 12, pdfH - 5, { align: 'right' });
  };

  // --- PAGINA 1: EXECUTIVE SUMMARY & KPIs ---
  let currentY = 35;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('1. SINTESI FINANZIARIA & KPI DIREZIONALI', 12, currentY);
  currentY += 5;

  const avgMonthlyExpense = monthlyData.reduce((sum, d) => sum + d.expense, 0) / 12;
  const minBalance = Math.min(...tableRows.filter(r => typeof r[4] === 'object' && r[4].content !== '-').map(r => {
      const val = r[4].content.replace(/[^0-9,-]/g, '').replace(',', '.');
      const parsed = parseFloat(val);
      return isNaN(parsed) ? Infinity : parsed;
  }).filter(v => v !== Infinity));

  // Advanced KPIs calculation
  const totalLoanRepaymentsYear = transactions
    .filter(t => !t.isForecast && t.date.startsWith(String(currentYear)) && 
      (t.category?.includes('Quota Capitale') || t.category?.includes('Interessi Passivi')))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const ebitda = transactions
    .filter(t => !t.isForecast && t.date.startsWith(String(currentYear)))
    .reduce((sum, t) => {
      const amt = Math.abs(t.amount);
      if (['ricavo_core', 'ricavo_immobiliare', 'ricavo_altro'].includes(t.ceType as any)) return sum + amt;
      if (['costo_variabile', 'costo_fisso', 'costo_studio'].includes(t.ceType as any)) return sum - amt;
      return sum;
    }, 0);

  const dscr = totalLoanRepaymentsYear > 0 ? (ebitda / totalLoanRepaymentsYear).toFixed(2) : 'N.D.';
  const burnRateDays = avgMonthlyExpense > 0 ? Math.round((totalInitialBalance / avgMonthlyExpense) * 30) : 365;

  const summaryData = [
    ['Saldo Iniziale Disponibile', CURRENCY_FORMATTER.format(totalInitialBalance)],
    ['Media Uscite Mensili di Cassa', CURRENCY_FORMATTER.format(avgMonthlyExpense)],
    ['Punto Minimo Liquidità di Esercizio', CURRENCY_FORMATTER.format(minBalance)],
    ['Saldo di Cassa Stimato a Fine Anno', CURRENCY_FORMATTER.format(cumulative)]
  ];

  autoTable(pdf, {
    startY: currentY,
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 3.5, textColor: [51, 65, 85] },
    columnStyles: { 
      0: { fontStyle: 'bold', cellWidth: 80, textColor: [15, 23, 42] },
      1: { fontStyle: 'bold', halign: 'right', cellWidth: 50, textColor: [15, 23, 42] }
    },
    margin: { left: 12 }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('INDICI DI SOSTENIBILITÀ & TESORERIA', 12, currentY);
  currentY += 6;

  autoTable(pdf, {
    startY: currentY,
    head: [['Indicatore', 'Valore Rilevato', 'Soglia Limite', 'Stato']],
    body: [
      ['Autonomia di Cassa (Burn Rate)', `${burnRateDays} Giorni`, '60 Giorni', burnRateDays > 90 ? '🟢 Eccellente' : '🔴 Tensione'],
      ['DSCR (Copertura Debiti da EBITDA)', dscr, '> 1.15', parseFloat(dscr) > 1.25 ? '🟢 Sostenibile' : '🔴 Rischioso'],
      ['Copertura Spese Struttura (Mesi)', (avgMonthlyExpense > 0 ? (totalInitialBalance / avgMonthlyExpense).toFixed(1) : '12') + ' Mesi', '2.0 Mesi', (totalInitialBalance / avgMonthlyExpense) > 3 ? '🟢 Sicuro' : '🔴 Limite']
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 4, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60, textColor: [15, 23, 42] },
      1: { halign: 'center', cellWidth: 35, fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 35 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 35 }
    },
    margin: { left: 12 }
  });

  // --- PAGINA 2: TABELLA FLUSSI MENSILI ---
  pdf.addPage();
  currentY = 35;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('2. PROIEZIONE DETTAGLIATA DEI FLUSSI MENSILI', 12, currentY);
  currentY += 5;

  autoTable(pdf, {
    startY: currentY,
    head: [['Mese', 'Entrate (Lorde)', 'Uscite (Lorde)', 'Flusso Netto', 'Saldo Progressivo']],
    body: tableRows,
    theme: 'striped',
    headStyles: { 
      fillColor: [15, 23, 42], 
      fontSize: 9, 
      cellPadding: 4,
      textColor: [255, 255, 255]
    },
    bodyStyles: { 
      fontSize: 7.5, 
      cellPadding: 3,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45 },
      1: { halign: 'right', cellWidth: 35 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 35 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 40 }
    },
    margin: { left: 12, right: 12 }
  });

  // --- PAGINA 3: AUDIT CONGRUITÀ COSTI ---
  pdf.addPage();
  currentY = 35;

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('3. AUDIT DI CONGRUITÀ COSTI & ALLOCAZIONE CANTIERI', 12, currentY);
  currentY += 5;

  let fatturato = 0;
  let costiVariabili = 0;
  let costiStudio = 0;
  let costiFissi = 0;
  let oneriFin = 0;
  let compensoSoci = 0;

  transactions.forEach(t => {
    const d = parseUTCDate(t.date);
    if (d.getUTCFullYear() !== currentYear) return;
    const amount = Math.abs(t.amount);

    if (t.ceType?.startsWith('ricavo')) {
      fatturato += amount;
    } else if (t.ceType === 'costo_variabile') {
      costiVariabili += amount;
    } else if (t.ceType === 'costo_studio') {
      costiStudio += amount;
      if (t.category?.toLowerCase().includes('compenso amministratori') || t.category?.toLowerCase().includes('soci')) {
        compensoSoci += amount;
      }
    } else if (t.ceType === 'costo_fisso') {
      costiFissi += amount;
    } else if (t.ceType === 'onere_finanziario') {
      oneriFin += amount;
    }
  });

  const baseFatt = fatturato > 0 ? fatturato : 1;
  const incVar = (costiVariabili / baseFatt * 100).toFixed(1) + '%';
  const incStudio = (costiStudio / baseFatt * 100).toFixed(1) + '%';
  const incFissi = (costiFissi / baseFatt * 100).toFixed(1) + '%';
  const incOneri = (oneriFin / baseFatt * 100).toFixed(1) + '%';
  const incSoci = (compensoSoci / baseFatt * 100).toFixed(1) + '%';

  autoTable(pdf, {
    startY: currentY,
    head: [['Macro Voce Spesa', 'Incidenza GV', 'Valutazione', 'Azione Correttiva Consigliata']],
    body: [
      ['Costi Variabili (Diretti)', incVar, parseFloat(incVar) > 75 ? '🔴 Elevata' : '🟢 Sotto Controllo', 'Negoziare contratti quadro annuali sui materiali; limitare subappalti.'],
      ['Costi Studio / Tecnici', incStudio, parseFloat(incStudio) > 15 ? '⚠️ Sopra Media' : '🟢 Standard', 'Monitorare ore non produttive di ufficio. Ottimizzazione software BIM.'],
      ['Compenso Soci', incSoci, parseFloat(incSoci) > 5 ? '⚠️ Rilevante' : '🟢 Congruo', 'Allineato alle prassi. Vincolare futuri aumenti alla crescita dell\'utile.'],
      ['Overhead Struttura Fissa', incFissi, parseFloat(incFissi) > 8 ? '🔴 Elevato' : '🟢 Eccellente', 'Mantenere la sede e le licenze snelle. Ottimo controllo di gestione.'],
      ['Oneri Finanziari', incOneri, parseFloat(incOneri) > 2 ? '🔴 Alto debito' : '🟢 Eccellente', 'Rinegoziare commissioni fisse sui fidi e tassi per le fideiussioni.'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
    styles: { fontSize: 8, cellPadding: 4, textColor: [51, 65, 85] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, textColor: [15, 23, 42] },
      1: { halign: 'center', cellWidth: 25, fontStyle: 'bold', textColor: [15, 23, 42] },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 35 },
      3: { fontSize: 7.5, textColor: [71, 85, 105] as [number,number,number] },
    },
    margin: { left: 12, right: 12 }
  });
  currentY = (pdf as any).lastAutoTable.finalY + 15;

  // Calculate pure forecast balance for risk analysis
  const totalLoanRepaymentsForecast = transactions
    .filter(t => t.isForecast && t.date.startsWith(String(currentYear)) && 
      (t.category?.includes('Quota Capitale') || t.category?.includes('Interessi Passivi')))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const saldoInizialePrevisionale = initialData.accounts.reduce((sum, acc) => sum + acc.balance, 0); // fallback default

  const forecastMonthlyFlows = months.map((_, i) => calculateMonthlyFlow(i)); // calculateMonthlyFlow handles actual/forecast.
  
  // To evaluate strictly forecast:
  const pureForecastMonthlyNet = months.map((_, i) => {
    // Generate monthly forecast net (use calculateMonthlyFlow but force forecast logic or use it directly as forecast fallback if we map it)
    const forecastTransactions = transactions.filter(t => {
      const d = parseUTCDate(t.date);
      return d.getUTCMonth() === i && d.getUTCFullYear() === currentYear && t.isForecast;
    });
    const fInc = forecastTransactions.filter(t => t.type === TransactionType.INCOME).reduce((sum, t) => sum + getGrossAmount(t), 0);
    let fExp = forecastTransactions.filter(t => t.type === TransactionType.EXPENSE).reduce((sum, t) => sum + getGrossAmount(t), 0);
    return fInc - fExp;
  });

  const riskMonths = months.map((m, i) => {
      let tempCumulative = saldoInizialePrevisionale;
      for(let j=0; j<=i; j++) {
        // Accumulate using the pure forecast flow
        tempCumulative += pureForecastMonthlyNet[j];
      }
      return { month: m, balance: tempCumulative };
  }).filter(m => m.balance < 0);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(15, 23, 42);
  pdf.text('VALUTAZIONE DELLA SOSTENIBILITÀ', 12, currentY);
  currentY += 8;

  if (riskMonths.length > 0) {
    pdf.setTextColor(220, 38, 38);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ATTENZIONE: Rilevati periodi di potenziale tensione finanziaria:', 12, currentY);
    currentY += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    riskMonths.forEach(risk => {
        pdf.text(`• Saldo progressivo stimato in negativo a ${risk.month}: ${CURRENCY_FORMATTER.format(risk.balance)}`, 16, currentY);
        currentY += 5.5;
    });
  } else {
    pdf.setFillColor(240, 253, 244);
    pdf.rect(12, currentY, pdfW - 24, 14, 'F');
    pdf.setDrawColor(22, 163, 74);
    pdf.rect(12, currentY, pdfW - 24, 14, 'D');

    pdf.setTextColor(21, 128, 61);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ANALISI DI LIQUIDITÀ POSITIVA', 16, currentY + 5.5);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(22, 101, 52);
    pdf.text('Il flusso di cassa progressivo stimato si mantiene superiore a zero per l\'intero esercizio analizzato.', 16, currentY + 9.5);
  }

  // --- PAGINA 4: ANALISI AI ---
  if (aiAnalysis) {
    pdf.addPage();
    currentY = 35;
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text('4. ANALISI DIREZIONALE E SUGGERIMENTI AI (GEMINI)', 12, currentY);
    currentY += 8;
    
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(51, 65, 85);

    const splitText = pdf.splitTextToSize(aiAnalysis.replace(/\*\*/g, '').replace(/#/g, ''), pdfW - 24);
    
    splitText.forEach((line: string) => {
      if (currentY > pdfH - 22) {
        pdf.addPage();
        currentY = 35;
      }
      pdf.text(line, 12, currentY);
      currentY += 5;
    });
  }

  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeaderFooter(i, totalPages);
  }

  pdf.save(`GV_Proiezione_CashFlow_${currentYear}.pdf`);
};
