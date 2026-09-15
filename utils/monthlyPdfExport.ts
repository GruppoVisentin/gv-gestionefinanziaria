import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction, TransactionType, Project } from '../types';
import { CURRENCY_FORMATTER } from '../constants';
import { getDynamicCEType, computeCommesseCompletate } from './gasCoreEngine';

export interface MonthlyReportConfig {
  monthIndex: number;
  year: number;
  transactions: Transaction[];
  projects?: Project[];
}

export const exportMonthlyReportPDF = async (config: MonthlyReportConfig): Promise<void> => {
  const { monthIndex, year, transactions, projects } = config;
  // ceType e' congelato sulla transazione al momento della creazione: se la classificazione di una
  // categoria cambia dopo, le transazioni vecchie restano con il valore vecchio. getDynamicCEType
  // rilegge sempre la classificazione attuale (gia' usato dal motore CE principale) - prima questo
  // export filtrava su tx.ceType grezzo, escludendo/includendo voci in modo disallineato da CEView
  // per le transazioni con classificazione cambiata dopo la creazione (bug trovato in audit il
  // 2026-09-14: 8.488 euro su 2 transazioni reali 2026 escluse sia da Costi Variabili sia Fissi).
  const commesseCompletate = computeCommesseCompletate(transactions, projects);
  const dyn = (t: Transaction) => getDynamicCEType(t, projects, commesseCompletate, year);
  const months = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const monthName = months[monthIndex];
  const title = `Riepilogo Mensile — ${monthName} ${year}`;

  const getGrossAmount = (t: Transaction) => {
    const net = t.amount;
    const vat = t.vatRate || 0;
    return net * (1 + vat / 100);
  };

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  let currentY = 28;

  const drawHeader = (page: number, total: number) => {
    pdf.setFillColor(34, 34, 34);
    pdf.rect(0, 0, pdfW, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('GRUPPO VISENTIN SRL', 10, 10);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(title.toUpperCase(), 10, 16);
    pdf.setFontSize(7);
    pdf.text(`Generato il ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}  |  Pag. ${page}/${total}`, pdfW - 10, 16, { align: 'right' });
    pdf.setFillColor(245, 245, 245);
    pdf.rect(0, pdfH - 10, pdfW, 10, 'F');
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(7);
    pdf.text('GV Ecosystem Management — uso interno riservato', pdfW / 2, pdfH - 4, { align: 'center' });
  };

  const checkNewPage = () => {
    if (currentY > pdfH - 40) {
      pdf.addPage();
      currentY = 30;
    }
  };

  // ── Filtra transazioni del mese ──────────────────────────────
  const txMese = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === monthIndex;
  });

  // Escludi ammortamenti (costi non monetari) dal flusso di cassa
  const income       = txMese.filter(t => t.type === TransactionType.INCOME && !t.isForecast && dyn(t) !== 'ammortamento');
  const expense      = txMese.filter(t => t.type === TransactionType.EXPENSE && !t.isForecast && dyn(t) !== 'ammortamento');
  const forecIncome  = txMese.filter(t => t.type === TransactionType.INCOME && t.isForecast && dyn(t) !== 'ammortamento');
  const forecExpense = txMese.filter(t => t.type === TransactionType.EXPENSE && t.isForecast && dyn(t) !== 'ammortamento');

  const costiVariabili = expense.filter(t => dyn(t) === 'costo_variabile');
  const costiFissi     = expense.filter(t => dyn(t) === 'costo_fisso' || dyn(t) === 'costo_studio');
  const altreUscite    = expense.filter(t => !['costo_variabile','costo_fisso','costo_studio'].includes(dyn(t)));

  const sumGross = (arr: Transaction[]) => arr.reduce((s, t) => s + getGrossAmount(t), 0);
  const sumNet   = (arr: Transaction[]) => arr.reduce((s, t) => s + t.amount, 0);

  // ── SEZIONE 1: RIEPILOGO ESECUTIVO ─────────────────────────
  pdf.setTextColor(34, 34, 34);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('1. RIEPILOGO ESECUTIVO', 10, currentY);
  currentY += 8;

  // Calcolo Flusso Operativo / Netto da CE (escludendo capex, solo_cashflow, ed escludendo finanziamenti/prelievi soci)
  // Per entrate: ricavo_core, ricavo_immobiliare, ricavo_altro, provento_finanziario, straordinario
  const entrateOperative = income.filter(t => ['ricavo_core', 'ricavo_immobiliare', 'ricavo_altro', 'provento_finanziario', 'straordinario'].includes(dyn(t)));
  // Per uscite: costo_variabile, costo_fisso, costo_studio, onere_finanziario, straordinario
  const usciteOperative = expense.filter(t => ['costo_variabile', 'costo_fisso', 'costo_studio', 'onere_finanziario', 'straordinario'].includes(dyn(t)));

  // Calcoli previsionali
  const prevEntrateOperative = forecIncome.filter(t => ['ricavo_core', 'ricavo_immobiliare', 'ricavo_altro', 'provento_finanziario', 'straordinario'].includes(dyn(t)));
  const prevUsciteOperative = forecExpense.filter(t => ['costo_variabile', 'costo_fisso', 'costo_studio', 'onere_finanziario', 'straordinario'].includes(dyn(t)));

  const totConsEntrate = sumGross(entrateOperative);
  const totConsUscite  = sumGross(usciteOperative);
  const totPrevEntrate = sumGross(prevEntrateOperative);
  const totPrevUscite  = sumGross(prevUsciteOperative);
  const flussoNetto    = totConsEntrate - totConsUscite;

  // Flusso finanziario/patrimoniale non operativo (CAPEX, Mutui, Prelievi, Versamenti F24/IVA ecc.)
  const entrateNonOp = income.filter(t => !['ricavo_core', 'ricavo_immobiliare', 'ricavo_altro', 'provento_finanziario', 'straordinario'].includes(dyn(t)));
  const usciteNonOp = expense.filter(t => !['costo_variabile', 'costo_fisso', 'costo_studio', 'onere_finanziario', 'straordinario'].includes(dyn(t)));
  const prevEntrateNonOp = forecIncome.filter(t => !['ricavo_core', 'ricavo_immobiliare', 'ricavo_altro', 'provento_finanziario', 'straordinario'].includes(dyn(t)));
  const prevUsciteNonOp = forecExpense.filter(t => !['costo_variabile', 'costo_fisso', 'costo_studio', 'onere_finanziario', 'straordinario'].includes(dyn(t)));

  const totConsEntrateNonOp = sumGross(entrateNonOp);
  const totConsUsciteNonOp  = sumGross(usciteNonOp);
  const totPrevEntrateNonOp = sumGross(prevEntrateNonOp);
  const totPrevUsciteNonOp  = sumGross(prevUsciteNonOp);
  
  const saldoCassaCons = sumGross(income) - sumGross(expense);
  const saldoCassaPrev = sumGross(forecIncome) - sumGross(forecExpense);

  autoTable(pdf, {
    startY: currentY,
    head: [['Voce', 'Consuntivo', 'Previsionale', 'Scostamento', '% Scost.']],
    body: [
      [
        'Entrate Operative (lordo)',
        CURRENCY_FORMATTER.format(totConsEntrate),
        CURRENCY_FORMATTER.format(totPrevEntrate),
        CURRENCY_FORMATTER.format(totConsEntrate - totPrevEntrate),
        totPrevEntrate > 0 ? `${(((totConsEntrate - totPrevEntrate) / totPrevEntrate) * 100).toFixed(1)}%` : '—',
      ],
      [
        'Uscite Operative (lordo)',
        CURRENCY_FORMATTER.format(totConsUscite),
        CURRENCY_FORMATTER.format(totPrevUscite),
        CURRENCY_FORMATTER.format(totConsUscite - totPrevUscite),
        totPrevUscite > 0 ? `${(((totConsUscite - totPrevUscite) / totPrevUscite) * 100).toFixed(1)}%` : '—',
      ],
      [
        'Flusso Operativo Netto (CE)',
        CURRENCY_FORMATTER.format(flussoNetto),
        CURRENCY_FORMATTER.format(totPrevEntrate - totPrevUscite),
        CURRENCY_FORMATTER.format(flussoNetto - (totPrevEntrate - totPrevUscite)),
        '—',
      ],
      [
        'Flussi Non Operativi (Finanza/Capex/Fisco)',
        CURRENCY_FORMATTER.format(totConsEntrateNonOp - totConsUsciteNonOp),
        CURRENCY_FORMATTER.format(totPrevEntrateNonOp - totPrevUsciteNonOp),
        CURRENCY_FORMATTER.format((totConsEntrateNonOp - totConsUsciteNonOp) - (totPrevEntrateNonOp - totPrevUsciteNonOp)),
        '—',
      ],
      [
        'Variazione Cassa Mensile Totale',
        CURRENCY_FORMATTER.format(saldoCassaCons),
        CURRENCY_FORMATTER.format(saldoCassaPrev),
        CURRENCY_FORMATTER.format(saldoCassaCons - saldoCassaPrev),
        '—',
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [34, 34, 34], fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' },
      3: { halign: 'right' }, 4: { halign: 'right' },
    },
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;
  checkNewPage();

  // ── SEZIONE 2: ENTRATE DETTAGLIATE ──────────────────────────
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('2. ENTRATE — Dettaglio Consuntivo', 10, currentY);
  currentY += 6;

  autoTable(pdf, {
    startY: currentY,
    head: [['Data', 'Categoria', 'Descrizione / Cliente', 'Commessa', 'Imponibile', 'IVA%', 'Lordo']],
    body: income.length > 0
      ? income.map(t => [
          new Date(t.date).toLocaleDateString('it-IT'),
          t.category.replace(/\[.*?\]\s*/, ''),
          t.description || '—',
          t.project || '—',
          CURRENCY_FORMATTER.format(t.amount),
          `${t.vatRate || 0}%`,
          CURRENCY_FORMATTER.format(getGrossAmount(t)),
        ])
      : [['', '', 'Nessuna entrata consuntiva registrata', '', '', '', '']],
    foot: income.length > 0 ? [['', '', '', 'TOTALE',
      CURRENCY_FORMATTER.format(sumNet(income)),
      '',
      CURRENCY_FORMATTER.format(sumGross(income))]] : undefined,
    theme: 'striped',
    headStyles: { fillColor: [5, 122, 85], fontSize: 7 },
    footStyles: { fillColor: [220, 250, 230], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;
  checkNewPage();

  // ── SEZIONE 3: USCITE VARIABILI ─────────────────────────────
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('3. USCITE VARIABILI — Costi Diretti di Cantiere', 10, currentY);
  currentY += 6;

  autoTable(pdf, {
    startY: currentY,
    head: [['Data', 'Categoria', 'Fornitore / Descrizione', 'Commessa', 'Imponibile', 'IVA%', 'Lordo']],
    body: costiVariabili.length > 0
      ? costiVariabili.map(t => [
          new Date(t.date).toLocaleDateString('it-IT'),
          t.category.replace(/\[.*?\]\s*/, ''),
          t.description || '—',
          t.project || '—',
          CURRENCY_FORMATTER.format(t.amount),
          `${t.vatRate || 0}%`,
          CURRENCY_FORMATTER.format(getGrossAmount(t)),
        ])
      : [['', '', 'Nessun costo variabile registrato', '', '', '', '']],
    foot: costiVariabili.length > 0 ? [['', '', '', 'TOTALE',
      CURRENCY_FORMATTER.format(sumNet(costiVariabili)), '',
      CURRENCY_FORMATTER.format(sumGross(costiVariabili))]] : undefined,
    theme: 'striped',
    headStyles: { fillColor: [153, 27, 27], fontSize: 7 },
    footStyles: { fillColor: [255, 230, 230], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;
  checkNewPage();

  // ── SEZIONE 4: COSTI FISSI ──────────────────────────────────
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('4. USCITE FISSE — Costi di Struttura', 10, currentY);
  currentY += 6;

  autoTable(pdf, {
    startY: currentY,
    head: [['Data', 'Categoria', 'Descrizione', 'Imponibile', 'IVA%', 'Lordo']],
    body: costiFissi.length > 0
      ? costiFissi.map(t => [
          new Date(t.date).toLocaleDateString('it-IT'),
          t.category.replace(/\[.*?\]\s*/, ''),
          t.description || '—',
          CURRENCY_FORMATTER.format(t.amount),
          `${t.vatRate || 0}%`,
          CURRENCY_FORMATTER.format(getGrossAmount(t)),
        ])
      : [['', '', 'Nessun costo fisso registrato', '', '', '']],
    foot: costiFissi.length > 0 ? [['', '', 'TOTALE',
      CURRENCY_FORMATTER.format(sumNet(costiFissi)), '',
      CURRENCY_FORMATTER.format(sumGross(costiFissi))]] : undefined,
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
    footStyles: { fillColor: [235, 233, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;
  checkNewPage();

  // ── SEZIONE 5: PREVISIONALE ─────────────────────────────────
  if (forecIncome.length > 0 || forecExpense.length > 0) {
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('5. PREVISIONALE — Movimenti Attesi Non Ancora Realizzati', 10, currentY);
    currentY += 6;

    const allForec = [...forecIncome, ...forecExpense];
    autoTable(pdf, {
      startY: currentY,
      head: [['Data', 'Tipo', 'Categoria', 'Descrizione', 'Importo Atteso']],
      body: allForec.map(t => [
        new Date(t.date).toLocaleDateString('it-IT'),
        t.type === TransactionType.INCOME ? 'Entrata' : 'Uscita',
        t.category.replace(/\[.*?\]\s*/, ''),
        t.description || '—',
        (t.type === TransactionType.INCOME ? '+' : '−') + CURRENCY_FORMATTER.format(getGrossAmount(t)),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [100, 116, 139], fontSize: 7 },
      bodyStyles: { fontSize: 7 },
    });

    currentY = (pdf as any).lastAutoTable.finalY + 12;
  }

  // ── Applica header/footer su tutte le pagine ─────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    drawHeader(i, totalPages);
  }

  pdf.save(`GV_Report_Mensile_${monthName}_${year}.pdf`);
};
