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
    const amount = t.amount || 0;
    const vat = t.vatRate ? (amount * t.vatRate) / 100 : 0;
    return amount + vat;
  };

  const meseCorrente = new Date().getMonth();
  const isAnnoCorrente = currentYear === new Date().getFullYear();

  const calculateMonthlyFlow = (monthIndex: number) => {
    // Determina se il mese ha dati consuntivi
    const hasActuals = transactions.some(t => {
      const d = parseUTCDate(t.date);
      return d.getUTCMonth() === monthIndex && d.getUTCFullYear() === currentYear && !t.isForecast;
    });

    // Usa consuntivi se: mese passato o corrente (con dati reali)
    const useActuals = hasActuals || (isAnnoCorrente && monthIndex <= meseCorrente);

    if (useActuals) {
      // --- CONSUNTIVO ---
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

    // --- PREVISIONALE (mesi futuri senza consuntivi) ---
    const forecastTransactions = transactions.filter(t => {
      const d = parseUTCDate(t.date);
      if (d.getUTCMonth() !== monthIndex || d.getUTCFullYear() !== currentYear || !t.isForecast) return false;
      // Escludi forecast già liquidati
      return !transactions.some(act => !act.isForecast && act.linkedForecastId === t.id);
    });

    const fIncome = forecastTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    let fExpense = forecastTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    // Rate prestiti previsionali
    const calculateLoanRepayment = (mIdx: number) => {
      // BUG-01 Fix: If we already have manual transactions for interests or quota capitale in the month, skip prediction.
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

    // Costi cantiere previsionali
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

  // Helper per calcolo componenti prestito (allineato a ExpenseTimeline.tsx con supporto rinegoziazioni)
  function calculateLoanComponents(principal: number, details: any, targetMonthIndex: number) {
    if (!details || !details.interestStartDate) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

    const targetDate = new Date(Date.UTC(currentYear, targetMonthIndex, 15));
    const intStart = parseUTCDate(details.interestStartDate);
    const princStart = details.principalStartDate ? parseUTCDate(details.principalStartDate) : intStart;
    const end = details.endDate ? parseUTCDate(details.endDate) : new Date(Date.UTC(intStart.getUTCFullYear() + 20, intStart.getUTCMonth(), 15));

    if (targetDate < intStart || targetDate > end) return { total: 0, principal: 0, interest: 0, rateUsed: 0, typeUsed: 'FIXED' };

    // Determina il tasso applicabile per questa specifica data (considerando rinegoziazioni)
    let currentRate = details.interestRate;
    let currentType = details.rateType;
    
    if (details.rinegoziazioni && details.rinegoziazioni.length > 0) {
      // Ordina per data e prendi l'ultima rinegoziazione valida per targetDate
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
  
  // Calcolo progressivo
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

    // Accumulo trimestrale
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

  // --- HEADER E FOOTER (Stile GV) ---
  const drawHeaderFooter = (currentPage: number, totalPages: number) => {
    // Header
    pdf.setFillColor(34, 34, 34); // Nero smorzato
    pdf.rect(0, 0, pdfW, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('GRUPPO VISENTIN SRL', 10, 10);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`REPORT PROIEZIONE ANNUALE CASH FLOW — ${currentYear}`, 10, 16);

    const dataGen = new Date().toLocaleDateString('it-IT', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    pdf.setFontSize(8);
    pdf.text(`Generato il: ${dataGen}`, pdfW - 10, 10, { align: 'right' });

    // Footer
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, pdfH - 10, pdfW, 10, 'F');
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(7);
    pdf.text('GV Ecosystem — Gestione Finanziaria Avanzata', 10, pdfH - 4);
    pdf.text(`Pagina ${currentPage} di ${totalPages}`, pdfW - 10, pdfH - 4, { align: 'right' });
  };

  // --- EXECUTIVE SUMMARY ---
  let currentY = 30;
  pdf.setTextColor(34, 34, 34);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('EXECUTIVE SUMMARY', 10, currentY);
  currentY += 8;

  const avgMonthlyExpense = monthlyData.reduce((sum, d) => sum + d.expense, 0) / 12;
  const minBalance = Math.min(...tableRows.filter(r => typeof r[4] === 'object' && r[4].content !== '-').map(r => {
      const val = r[4].content.replace(/[^0-9,-]/g, '').replace(',', '.');
      const parsed = parseFloat(val);
      return isNaN(parsed) ? Infinity : parsed;
  }).filter(v => v !== Infinity));

  const summaryData = [
    ['Saldo Iniziale Disponibile', CURRENCY_FORMATTER.format(totalInitialBalance)],
    ['Media Uscite Mensili', CURRENCY_FORMATTER.format(avgMonthlyExpense)],
    ['Punto di Minimo Previsto', CURRENCY_FORMATTER.format(minBalance)],
    ['Saldo Finale Previsto', CURRENCY_FORMATTER.format(cumulative)]
  ];

  autoTable(pdf, {
    startY: currentY,
    body: summaryData,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: 10 }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 15;

  // --- TABELLA TIMELINE ---
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PROIEZIONE FLUSSI MENSILI', 10, currentY);
  currentY += 5;

  autoTable(pdf, {
    startY: currentY,
    head: [['Mese', 'Entrate', 'Uscite', 'Flusso Netto', 'Saldo Progressivo']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [34, 34, 34], fontSize: 10, cellPadding: 4 },
    bodyStyles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: {
      4: { fontStyle: 'bold', halign: 'right' },
      3: { halign: 'right' },
      2: { halign: 'right' },
      1: { halign: 'right' }
    },
    margin: { left: 10, right: 10 }
  });

  // --- CALCOLO METRICHE DI CONGRUITÀ REALI ---
  let fatturato = 0;
  let costiVariabili = 0;
  let costiStudio = 0;
  let costiFissi = 0;
  let oneriFin = 0;
  let compensoSoci = 0;

  transactions.forEach(t => {
    const d = parseUTCDate(t.date);
    if (d.getUTCFullYear() !== currentYear) return;
    const isIncome = t.type === TransactionType.INCOME;
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

  // --- PAGINA NUOVA: AUDIT DI CONGRUITÀ COSTI E VALUTAZIONE ---
  pdf.addPage();
  currentY = 30;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('AUDIT DI CONGRUITÀ COSTI & STRATEGIA (PMI Nord-Est)', 10, currentY);
  currentY += 6;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(`Valutazione della sostenibilità delle spese basata sul fatturato reale calcolato di ${CURRENCY_FORMATTER.format(fatturato)}.`, 10, currentY);
  currentY += 8;

  autoTable(pdf, {
    startY: currentY,
    head: [['Macro Voce Spesa', 'GV Incidenza', 'Valutazione', 'Azione Correttiva Suggerita']],
    body: [
      ['Costi Variabili (Diretti)', incVar, parseFloat(incVar) > 75 ? '🔴 Elevata' : '🟢 Sotto Controllo', 'Negoziare contratti quadro annuali sui materiali; limitare subappalti.'],
      ['Costi Studio / Tecnici', incStudio, parseFloat(incStudio) > 15 ? '⚠️ Sopra Media' : '🟢 Standard', 'Monitorare ore non produttive di ufficio. Ottimizzazione software BIM.'],
      ['Compenso Soci', incSoci, parseFloat(incSoci) > 5 ? '⚠️ Rilevante' : '🟢 Congruo', 'Allineato alle prassi. Vincolare futuri aumenti alla crescita dell\'utile.'],
      ['Overhead Struttura Fissa', incFissi, parseFloat(incFissi) > 8 ? '🔴 Elevato' : '🟢 Eccellente', 'Mantenere la sede e le licenze snelle. Ottimo controllo di gestione.'],
      ['Oneri Finanziari', incOneri, parseFloat(incOneri) > 2 ? '🔴 Alto debito' : '🟢 Eccellente', 'Rinegoziare commissioni fisse sui fidi e tassi per le fideiussioni.'],
    ],
    theme: 'grid',
    headStyles: { fillColor: [34, 34, 34], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { halign: 'center', cellWidth: 25 },
      2: { halign: 'center', fontStyle: 'bold', cellWidth: 35 },
      3: { fontSize: 7.5, textColor: [100, 100, 100] as [number,number,number] },
    },
    margin: { left: 10, right: 10 }
  });
  currentY = (pdf as any).lastAutoTable.finalY + 12;

  // --- ANALISI RISCHI E CRITICITÀ CASH FLOW ---
  const riskMonths = monthlyData.map((d, i) => {
      let tempCumulative = totalInitialBalance;
      for(let j=0; j<=i; j++) tempCumulative += monthlyData[j].net;
      return { month: months[i], balance: tempCumulative };
  }).filter(m => m.balance < 0);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(34, 34, 34);
  pdf.text('ANALISI DELLE CRITICITÀ DI CASSA', 10, currentY);
  currentY += 8;

  if (riskMonths.length > 0) {
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    riskMonths.forEach(risk => {
        pdf.text(`• Attenzione: Previsto saldo negativo a ${risk.month} (${CURRENCY_FORMATTER.format(risk.balance)})`, 15, currentY);
        currentY += 6;
    });
  } else {
    pdf.setTextColor(34, 34, 34);
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('• Nessuna criticità di cassa rilevata nel periodo analizzato.', 15, currentY);
  }

  // --- ANALISI AI (OPZIONALE) ---
  if (aiAnalysis) {
    pdf.addPage();
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(41, 128, 185); // Blue color for AI Header
    pdf.text('Analisi Direzionale e Suggerimenti AI (Gemini)', 10, 30);
    
    let aiY = 40;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40, 40, 40);

    const splitText = pdf.splitTextToSize(aiAnalysis.replace(/\*\*/g, '').replace(/#/g, ''), pdfW - 20);
    
    splitText.forEach((line: string) => {
      if (aiY > pdfH - 30) {
        pdf.addPage();
        aiY = 30;
      }
      pdf.text(line, 10, aiY);
      aiY += 5;
    });
  }

  // Finalize
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeaderFooter(i, totalPages);
  }

  pdf.save(`GV_Proiezione_CashFlow_${currentYear}.pdf`);
};
