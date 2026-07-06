import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BudgetData } from '../types';

interface BudgetPdfOptions {
  selectedYear: number;
  budgetData: BudgetData;
  actuals: Record<string, number[]>;
  modalita?: 'cassa' | 'competenza';
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

export const exportBudgetPDF = ({
  selectedYear,
  budgetData,
  actuals,
  modalita = 'cassa'
}: BudgetPdfOptions) => {
  const pdf = new jsPDF('p', 'mm', 'a4'); // Portrait to match SP view layout and allow deep analysis page
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // --- PAGE 1: BUDGET E SCOSTAMENTI ---
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 35, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN SRL', 15, 10);

  pdf.setFontSize(16);
  pdf.text('REPORT PIANIFICAZIONE BUDGET E SCOSTAMENTI', 15, 20);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Esercizio di Pianificazione: ${selectedYear} · Analisi di Controllo di Gestione · Metodo: ${modalita.toUpperCase()}`, 15, 26);
  pdf.text(`Documento di Analisi Strategica Interna · Generato: ${new Date().toLocaleDateString('it-IT')}`, 15, 30);

  // Badge Stato
  pdf.setFillColor(79, 70, 229); // indigo-600
  pdf.roundedRect(pdfW - 65, 10, 50, 8, 1.5, 1.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BUDGET INTEGRATO', pdfW - 40, 15, { align: 'center' });

  let currentY = 45;

  // Draw main structure table
  const tableBody = budgetData.righe.map(r => {
    const actualTotal = Math.abs(actuals[r.ceType]?.reduce((a, b) => a + b, 0) || 0);
    const isIncome = r.ceType.startsWith('ricavo');
    const diff = isIncome ? (actualTotal - r.budgetAnnuo) : (r.budgetAnnuo - actualTotal);
    const isPositive = diff >= 0;
    const pct = r.budgetAnnuo > 0 ? (actualTotal / r.budgetAnnuo) : 0;
    return [
      r.categoria,
      { content: formatEuro(r.budgetAnnuo), styles: { textColor: [180, 83, 9] as [number, number, number], fontStyle: 'bold' as const } }, // amber-700
      { content: formatEuro(actualTotal), styles: { textColor: [12, 74, 110] as [number, number, number], fontStyle: 'bold' as const } }, // sky-900
      { 
        content: `${isPositive ? '+' : ''}${formatEuro(diff)}`, 
        styles: { 
          textColor: (isPositive ? [5, 150, 105] : [225, 29, 72]) as [number, number, number], // emerald-600 or rose-600
          fontStyle: 'bold' as const
        } 
      },
      { content: formatPercent(pct), styles: { fontStyle: 'bold' as const } }
    ];
  });

  autoTable(pdf, {
    startY: currentY,
    head: [['Categoria di Flusso Economico', 'Budget Annuo', 'Consuntivo YTD', 'Scostamento', 'Avanzamento']],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 35 },
      2: { halign: 'right', cellWidth: 35 },
      3: { halign: 'right', cellWidth: 35 },
      4: { halign: 'right', cellWidth: 25 }
    }
  });

  // Footer pagina 1
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Report di pianificazione e controllo scostamenti cumulato ad oggi.', 15, pdfH - 10);
  pdf.text('Pagina 1 di 2 · Gruppo Visentin SRL', pdfW - 15, pdfH - 10, { align: 'right' });


  // --- PAGE 2: VALUTAZIONE DELLO SCOSTAMENTO E AZIONI STRATEGICHE ---
  pdf.addPage();
  
  // Header pagina 2
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 35, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('GRUPPO VISENTIN SRL', 15, 10);
  pdf.setFontSize(16);
  pdf.text('ANALISI ECONOMICA E PIANO D\'AZIONE', 15, 20);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Valutazione della deriva dei costi ed efficienza operativa rispetto agli obiettivi`, 15, 26);
  pdf.text(`Generato: ${new Date().toLocaleDateString('it-IT')}`, 15, 30);

  currentY = 45;

  // Calculate generic statistics
  const totActualRevenue = Math.abs((actuals['ricavo_core'] || []).reduce((a, b) => a + b, 0) + (actuals['ricavo_immobiliare'] || []).reduce((a, b) => a + b, 0) + (actuals['ricavo_altro'] || []).reduce((a, b) => a + b, 0));
  const totBudgetRevenue = (budgetData.righe.find(r => r.ceType === 'ricavo_core')?.budgetAnnuo || 0) + (budgetData.righe.find(r => r.ceType === 'ricavo_immobiliare')?.budgetAnnuo || 0) + (budgetData.righe.find(r => r.ceType === 'ricavo_altro')?.budgetAnnuo || 0);
  const revenuePct = totBudgetRevenue > 0 ? (totActualRevenue / totBudgetRevenue) : 0;

  const totActualCosts = Math.abs((actuals['costo_variabile'] || []).reduce((a, b) => a + b, 0) + (actuals['costo_fisso'] || []).reduce((a, b) => a + b, 0) + (actuals['costo_studio'] || []).reduce((a, b) => a + b, 0));
  const totBudgetCosts = (budgetData.righe.find(r => r.ceType === 'costo_variabile')?.budgetAnnuo || 0) + (budgetData.righe.find(r => r.ceType === 'costo_fisso')?.budgetAnnuo || 0) + (budgetData.righe.find(r => r.ceType === 'costo_studio')?.budgetAnnuo || 0);
  const costPct = totBudgetCosts > 0 ? (totActualCosts / totBudgetCosts) : 0;

  // Stats table
  const statsRows = [
    ['Totale Ricavi Cumulati', formatEuro(totActualRevenue), formatEuro(totBudgetRevenue), formatPercent(revenuePct)],
    ['Totale Costi Operativi', formatEuro(totActualCosts), formatEuro(totBudgetCosts), formatPercent(costPct)],
  ];

  autoTable(pdf, {
    startY: currentY,
    head: [['Aggregato Economico', 'Consuntivo Reale YTD', 'Target Budget Annuo', 'Avanzamento %']],
    body: statsRows,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'right', fontStyle: 'bold', cellWidth: 40 }
    }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;

  // Analisi Strutturale ed Autovalutazione
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('VALUTAZIONE DI SINTESI DEL REPORT SCOSTAMENTI', 15, currentY);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(51, 65, 85);
  
  currentY += 5;
  const analysisText = 
    `1. ANALISI DEI RICAVI E PROGRESSIONE DEGLI INCASSI: Ad oggi il Gruppo Visentin ha consuntivato ricavi per un totale di ${formatEuro(totActualRevenue)} a fronte di un obiettivo complessivo annuo di ${formatEuro(totBudgetRevenue)}. L'avanzamento dei ricavi è pari al ${formatPercent(revenuePct)}. Questo andamento riflette la regolarità della programmazione dei cantieri e dei SAL emessi. È fondamentale mantenere l'allineamento con il cronoprogramma per non compromettere il target di chiusura esercizio.\n\n` +
    `2. CONTROLLO E DERIVA DEI COSTI OPERATIVI (DIRETTI E FISSI): Le uscite operative reali ammontano a ${formatEuro(totActualCosts)} contro un budget teorico stimato di ${formatEuro(totBudgetCosts)} (${formatPercent(costPct)} di avanzamento). Un eventuale sforamento rispetto alla progressione pro-quota mensile indica la necessità di monitorare i costi di cantiere (materiali e subappalti) o un eccessivo carico di spese generali. La scomposizione mensile del budget permette di intercettare anzitempo tali derive.\n\n` +
    `3. MARGINE OPERATIVO LORDO PREVISIONALE (EBITDA ATTESO): L'incidenza dei costi variabili rispetto ai ricavi determina la tenuta del primo margine. Qualora i costi variabili registrassero scostamenti negativi superiori al target del 5%, risulterà prioritario rinegoziare i contratti di fornitura ed ottimizzare l'impiego della manodopera in cantiere per tutelare l'EBITDA finale.\n\n` +
    `4. EFFICIENZA DELLA STRUTTURA ED OVERHEAD: Il costo dello studio e del personale tecnico amministrativo incide direttamente sulla redditività operativa. Il mantenimento del costo studio entro i target di budget garantisce la sostenibilità strutturale del business e previene erosioni ingiustificate dell'utile d'esercizio.`;

  const splitText = pdf.splitTextToSize(analysisText, pdfW - 30);
  pdf.text(splitText, 15, currentY);

  // Box raccomandazioni
  currentY += 72;
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(15, currentY, pdfW - 30, 32, 2, 2, 'F');
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(15, currentY, pdfW - 30, 32, 2, 2, 'D');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(79, 70, 229);
  pdf.text('PIANO AZIENDALE DI CORREZIONE ED EFFICIENTAMENTO DEL BUDGET', 20, currentY + 6);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  const raccomandazioneText = 
    `• VERIFICA DELLO SCOSTAMENTO SUI COSTI DIRETTI (MATERIALI/SUBAPPALTI): In caso di scostamenti negativi, avviare un audit interno sulle singole commesse edili per risalire a sbilanciamenti di computo metrico o sprechi fisici nei cantieri.\n` +
    `• CONTROLLO MENSILE DEL FORECAST OPERATIVO: Eseguire a cadenza mensile la riclassificazione per cassa e competenza nel modulo Conto Economico, confrontando la proiezione di avanzamento con il budget pro-quota.\n` +
    `• CONTENIMENTO DEI COSTI FISSI STRUTTURALI (OVERHEAD): Congelare o razionalizzare le spese accessorie di struttura (servizi, abbonamenti, noleggi non strumentali) se l'avanzamento dei ricavi core scende sotto il 90% del programmato pro-quota.`;
  
  const splitRaccText = pdf.splitTextToSize(raccomandazioneText, pdfW - 40);
  pdf.text(splitRaccText, 20, currentY + 11);

  // Footer pagina 2
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 18, pdfW - 15, pdfH - 18);

  pdf.setFontSize(6.5);
  pdf.setTextColor(148, 163, 184);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN SRL', 15, pdfH - 13);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Flusso Smart 3.1 — Report di analisi scostamenti integrato con contabilità analitica del controllo di gestione.', 15, pdfH - 9);
  pdf.text(`Pagina 2 di 2 · Generato in modo sicuro`, pdfW - 15, pdfH - 13, { align: 'right' });

  pdf.save(`Budget_Scostamenti_${selectedYear}.pdf`);
};
