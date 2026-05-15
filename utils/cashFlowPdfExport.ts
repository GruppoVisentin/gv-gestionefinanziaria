import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, TransactionType, InitialBalanceBreakdown, BankAccount, ExistingLoan, Project } from '../types';
import { CURRENCY_FORMATTER } from '../constants';

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
}

export const exportCashFlowProjectionPDF = ({
  transactions,
  currentYear,
  projects,
  initialData
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

  const calculateMonthlyFlow = (monthIndex: number) => {
    // 1. Previsionali
    const forecastTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      if (d.getMonth() !== monthIndex || d.getFullYear() !== currentYear || !t.isForecast) return false;
      const isPaid = transactions.some(act => !act.isForecast && act.linkedForecastId === t.id);
      if (isPaid) return false;
      return true;
    });

    const fIncome = forecastTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);
    
    let fExpense = forecastTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    // Calcolo rate prestiti (solo per previsionali)
    const calculateLoanRepayment = (mIdx: number) => {
      let total = 0;
      // Nuovi prestiti
      transactions.filter(t => 
        t.type === TransactionType.INCOME && 
        t.category === '[FINANZA] Finanziamenti Ricevuti' && 
        t.loanDetails
      ).forEach(loan => {
        const comps = calculateLoanComponents(loan.amount, loan.loanDetails, mIdx);
        total += comps.total;
      });
      // Prestiti esistenti
      if (initialData.loans) {
        initialData.loans.forEach(loan => {
          const comps = calculateLoanComponents(loan.originalAmount, loan.details, mIdx);
          total += comps.total;
        });
      }
      return total;
    };

    fExpense += calculateLoanRepayment(monthIndex);

    // Calcolo costi di cantiere (solo per previsionali)
    const calculateProjectCostForMonth = (category: string, mIdx: number) => {
        let total = 0;
        projects.filter(p => p.status === 'ACTIVE' && p.estimatedStartDate).forEach(p => {
            const start = new Date(p.estimatedStartDate!);
            const startMonthGlobal = start.getFullYear() * 12 + start.getMonth();
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

    // 2. Consuntivi
    const actualTransactions = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === monthIndex && d.getFullYear() === currentYear && !t.isForecast;
    });

    const aIncome = actualTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);
    
    const aExpense = actualTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + getGrossAmount(t), 0);

    const totalIncome = fIncome + aIncome;
    const totalExpense = fExpense + aExpense;

    return { 
      income: totalIncome, 
      expense: totalExpense, 
      net: totalIncome - totalExpense,
      hasActuals: aIncome > 0 || aExpense > 0
    };
  };

  // Helper per calcolo componenti prestito (duplicato per indipendenza utility)
  function calculateLoanComponents(principal: number, details: any, targetMonthIndex: number) {
    if (!details) return { total: 0 };
    const { interestRate, interestStartDate, principalStartDate, endDate } = details;
    const targetDate = new Date(currentYear, targetMonthIndex, 1);
    const intStart = new Date(interestStartDate);
    const princStart = new Date(principalStartDate);
    if (isNaN(intStart.getTime()) || isNaN(princStart.getTime())) return { total: 0 };
    const end = endDate ? new Date(endDate) : new Date(princStart.getFullYear() + 20, princStart.getMonth(), 1);
    if (targetDate < intStart || targetDate > end) return { total: 0 };
    const monthlyRate = (interestRate / 100) / 12;
    const n = (end.getFullYear() - princStart.getFullYear()) * 12 + (end.getMonth() - princStart.getMonth());
    if (n <= 0) return { total: 0 };
    const rataFissa = monthlyRate > 0
      ? principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
      : principal / n;
    const monthsPassed = (targetDate.getFullYear() - princStart.getFullYear()) * 12 + (targetDate.getMonth() - princStart.getMonth());
    if (monthsPassed < 0) return { total: 0 };
    const residualCapital = monthlyRate > 0
      ? principal * (Math.pow(1 + monthlyRate, n) - Math.pow(1 + monthlyRate, monthsPassed)) / (Math.pow(1 + monthlyRate, n) - 1)
      : Math.max(0, principal - (principal / n * monthsPassed));
    const interestPayment = Math.max(0, residualCapital * monthlyRate);
    const principalPayment = targetDate >= princStart ? Math.min(residualCapital, rataFissa - interestPayment) : 0;
    return { total: principalPayment + interestPayment };
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
  const minBalance = Math.min(...tableRows.filter(r => typeof r[4] === 'object').map(r => {
      const val = r[4].content.replace(/[^0-9,-]/g, '').replace(',', '.');
      return parseFloat(val);
  }));

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

  // --- ANALISI RISCHI ---
  currentY = (pdf as any).lastAutoTable.finalY + 15;
  if (currentY > pdfH - 40) {
    pdf.addPage();
    currentY = 30;
  }

  const riskMonths = monthlyData.map((d, i) => {
      let tempCumulative = totalInitialBalance;
      for(let j=0; j<=i; j++) tempCumulative += monthlyData[j].net;
      return { month: months[i], balance: tempCumulative };
  }).filter(m => m.balance < 0);

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('ANALISI DELLE CRITICITÀ', 10, currentY);
  currentY += 8;

  if (riskMonths.length > 0) {
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    riskMonths.forEach(risk => {
        pdf.text(`• Attenzione: Previsto saldo negativo a ${risk.month} (${CURRENCY_FORMATTER.format(risk.balance)})`, 15, currentY);
        currentY += 6;
    });
  } else {
    pdf.setTextColor(34, 34, 34);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('• Nessuna criticità di cassa rilevata nel periodo analizzato.', 15, currentY);
  }

  // Finalize
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeaderFooter(i, totalPages);
  }

  pdf.save(`GV_Proiezione_CashFlow_${currentYear}.pdf`);
};
