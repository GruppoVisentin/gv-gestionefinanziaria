import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CEData, CERow } from '../types';

interface CEPdfOptions {
  selectedYear: number;
  modalita: 'cassa' | 'competenza';
  metrics: any;
  ceData: CEData;
  activeTab: 'ytd' | 'projection' | 'monthly' | 'scostamenti';
  scostamenti?: any[];
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

const MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export const exportCEPDF = ({
  selectedYear,
  modalita,
  metrics,
  ceData,
  activeTab,
  scostamenti
}: CEPdfOptions) => {
  const orientation = activeTab === 'monthly' ? 'l' : 'p';
  const pdf = new jsPDF(orientation, 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();

  // --- HEADER ---
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 40, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN', 15, 12);

  pdf.setFontSize(18);
  pdf.text('REPORT CONTO ECONOMICO RICLASSIFICATO', 15, 22);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Analisi Economica Anno: ${selectedYear}`, 15, 28);
  pdf.text(`Metodo: ${modalita.toUpperCase()} — Generato il: ${new Date().toLocaleDateString('it-IT')}`, 15, 33);

  // Badge Periodo
  const periodText = activeTab === 'ytd' ? 'CONSUNTIVO YTD' : 
                    activeTab === 'projection' ? 'PROIEZIONE FINE ANNO' :
                    activeTab === 'monthly' ? 'ANALISI MENSILE' : 'ANALISI SCOSTAMENTI';
  
  pdf.setFillColor(51, 65, 85); // slate-700
  pdf.roundedRect(pdfW - 65, 12, 50, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.text(periodText, pdfW - 40, 18.5, { align: 'center' });

  // --- KPI SUMMARY BOXES ---
  let currentY = 50;
  const boxW = (pdfW - 40) / 4;
  const boxH = 20;

  const drawKPIBox = (x: number, y: number, label: string, value: string, subValue: string, color: [number, number, number]) => {
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.roundedRect(x, y, boxW - 5, boxH, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.roundedRect(x, y, boxW - 5, boxH, 2, 2, 'D');

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(label.toUpperCase(), x + 5, y + 6);

    pdf.setFontSize(11);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(value, x + 5, y + 13);

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(subValue, x + 5, y + 18);
  };

  drawKPIBox(15, currentY, 'Fatturato YTD', formatEuro(metrics.fatturato), `Proiezione: ${formatEuro(metrics.proiezioneFatturato)}`, [15, 23, 42]);
  drawKPIBox(15 + boxW, currentY, 'Primo Margine', formatPercent(metrics.primoMarginePercent), formatEuro(metrics.primoMargineTot), [79, 70, 229]); // indigo
  drawKPIBox(15 + boxW * 2, currentY, 'EBITDA %', formatPercent(metrics.ebitdaPercent), formatEuro(metrics.ebitdaTot), [16, 185, 129]); // emerald
  drawKPIBox(15 + boxW * 3, currentY, 'Utile Netto', formatEuro(metrics.utileNettoTot), formatPercent(metrics.utileNettoPercent), [30, 41, 59]);

  currentY += 30;

  // --- MAIN TABLE ---
  if (activeTab === 'ytd' || activeTab === 'projection' || activeTab === 'monthly') {
    const tableBody: any[] = [];
    
    const addRow = (label: string, data: number[], isBold = false, isKPI = false, projOverride?: number) => {
      const sum = data.reduce((a, b) => a + b, 0);
      const pct = metrics.fatturato > 0 ? sum / metrics.fatturato : 0;
      const hasForecasts = metrics.proiezioneFatturato !== metrics.fatturato;
      const projection = (hasForecasts && projOverride !== undefined)
        ? projOverride
        : (metrics.mesiTrascorsi > 0 ? (sum / metrics.mesiTrascorsi) * 12 : 0);

      const row = [label];
      if (activeTab === 'monthly') {
        data.forEach(v => row.push(v !== 0 ? formatEuro(v) : '-'));
      }
      row.push(formatEuro(sum));
      row.push(formatPercent(pct));
      row.push(formatEuro(projection));
      tableBody.push(row);
    };

    // Header Sezione
    tableBody.push([{ content: 'RICAVI DI STRUTTURA', colSpan: activeTab === 'monthly' ? 16 : 4, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 } }]);
    addRow('Ricavi Core (SAL/Commesse)', ceData.ricaviCore, false, false, metrics.proiezioneRicaviCore);
    addRow('Vendite Immobiliari', ceData.ricaviImmobiliare, false, false, metrics.proiezioneRicaviImmobiliare);
    addRow('Altri Ricavi (Affitti/Sviluppo)', ceData.ricaviAltro, false, false, metrics.proiezioneRicaviAltro);
    
    // Totale Ricavi
    const totRicaviRow = ['TOTALE RICAVI (A)'];
    if (activeTab === 'monthly') metrics.totRicavi.forEach(v => totRicaviRow.push(formatEuro(v)));
    totRicaviRow.push(formatEuro(metrics.fatturato));
    totRicaviRow.push('100%');
    totRicaviRow.push(formatEuro(metrics.proiezioneFatturato));
    tableBody.push({ content: totRicaviRow, styles: { fillColor: [226, 232, 240], fontStyle: 'bold' } });

    tableBody.push([{ content: 'COSTI VARIABILI', colSpan: activeTab === 'monthly' ? 16 : 4, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 } }]);
    addRow('Costi Variabili (Materiali/Subappalti)', ceData.costiVariabili, false, false, metrics.proiezioneCostiVariabili);
    
    // Totale Costi Variabili Row
    const totCostiVarRow = ['TOTALE COSTI VARIABILI (B)'];
    if (activeTab === 'monthly') metrics.totCostiVar.forEach(v => totCostiVarRow.push(formatEuro(v)));
    totCostiVarRow.push(formatEuro(metrics.totCostiVar.reduce((a,b)=>a+b,0)));
    totCostiVarRow.push(formatPercent(metrics.fatturato > 0 ? metrics.totCostiVar.reduce((a,b)=>a+b,0)/metrics.fatturato : 0));
    totCostiVarRow.push(formatEuro(metrics.proiezioneCostiVariabili));
    tableBody.push({ content: totCostiVarRow, styles: { fillColor: [248, 250, 252], fontStyle: 'bold' } });

    // Primo Margine
    const pmRow = ['PRIMO MARGINE (A - B)'];
    if (activeTab === 'monthly') metrics.primoMargine.forEach(v => pmRow.push(formatEuro(v)));
    pmRow.push(formatEuro(metrics.primoMargineTot));
    pmRow.push(formatPercent(metrics.primoMarginePercent));
    pmRow.push(formatEuro(metrics.proiezionePrimoMargine));
    tableBody.push({ content: pmRow, styles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' } });

    tableBody.push([{ content: 'COSTI FISSI DI STRUTTURA', colSpan: activeTab === 'monthly' ? 16 : 4, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 } }]);
    addRow('Costi Studio (Personale/Amm.)', ceData.costiStudio, false, false, metrics.proiezioneCostiStudio);
    addRow('Altri Costi Fissi (Sedi/Marketing)', ceData.costiFissi, false, false, metrics.proiezioneCostiFissi);
    addRow('Ammortamenti', ceData.ammortamenti, false, false, metrics.proiezioneAmmortamenti);

    // EBITDA
    const ebitdaRow = ['EBITDA'];
    if (activeTab === 'monthly') metrics.ebitda.forEach(v => ebitdaRow.push(formatEuro(v)));
    ebitdaRow.push(formatEuro(metrics.ebitdaTot));
    ebitdaRow.push(formatPercent(metrics.ebitdaPercent));
    ebitdaRow.push(formatEuro(metrics.proiezioneEbitda));
    tableBody.push({ content: ebitdaRow, styles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' } });

    // EBIT
    const ebitRow = ['EBIT (Risultato Operativo)'];
    if (activeTab === 'monthly') metrics.ebit.forEach(v => ebitRow.push(formatEuro(v)));
    ebitRow.push(formatEuro(metrics.ebitTot));
    ebitRow.push(formatPercent(metrics.fatturato > 0 ? metrics.ebitTot / metrics.fatturato : 0));
    ebitRow.push(formatEuro(metrics.proiezioneEbit));
    tableBody.push({ content: ebitRow, styles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' } });

    tableBody.push([{ content: 'ONERI E IMPOSTE', colSpan: activeTab === 'monthly' ? 16 : 4, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 } }]);
    addRow('Oneri Finanziari', ceData.oneriFin, false, false, metrics.proiezioneOneriFin);
    addRow('Proventi Finanziari', ceData.proventiFin, false, false, metrics.proiezioneProventiFin);
    addRow('Risultato Straordinario', ceData.straordinario, false, false, metrics.proiezioneStraordinario);

    // EBT Row
    const ebtRow = ['UTILE ANTE IMPOSTE (EBT)'];
    if (activeTab === 'monthly') metrics.ebt.forEach(v => ebtRow.push(formatEuro(v)));
    ebtRow.push(formatEuro(metrics.ebt.reduce((a,b)=>a+b,0)));
    ebtRow.push(formatPercent(metrics.fatturato > 0 ? metrics.ebt.reduce((a,b)=>a+b,0)/metrics.fatturato : 0));
    ebtRow.push(formatEuro(metrics.proiezioneEbt));
    tableBody.push({ content: ebtRow, styles: { fillColor: [226, 232, 240], fontStyle: 'bold' } });

    addRow('Imposte Stimate', ceData.imposte, false, false, ceData.imposte.reduce((a,b)=>a+b,0));

    // Utile Netto Row
    const unRow = ['UTILE NETTO'];
    if (activeTab === 'monthly') metrics.utileNetto.forEach(v => unRow.push(formatEuro(v)));
    unRow.push(formatEuro(metrics.utileNettoTot));
    unRow.push(formatPercent(metrics.utileNettoPercent));
    unRow.push(formatEuro(metrics.proiezioneUtile));
    tableBody.push({ content: unRow, styles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' } });

    tableBody.push([{ content: 'COMPENSO IMPRENDITORE', colSpan: activeTab === 'monthly' ? 16 : 4, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', fontSize: 8 } }]);
    addRow('Prelievo Utile Soci', ceData.compensoImprenditore, false, false, metrics.proiezioneCompensoImprenditore); // Using imposte as a proxy if utileNetto isn't in CEData directly

    const headers = ['Voce di Conto'];
    if (activeTab === 'monthly') MONTHS.forEach(m => headers.push(m));
    headers.push('Totale YTD');
    headers.push('% Fatt.');
    headers.push('Proiezione');

    autoTable(pdf, {
      startY: currentY,
      head: [headers],
      body: tableBody,
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: activeTab === 'monthly' ? 40 : 80 },
      }
    });
  } else if (activeTab === 'scostamenti' && scostamenti) {
    const tableBody = scostamenti.map(r => [
      r.label,
      formatEuro(r.budget),
      formatEuro(r.previsionale),
      formatEuro(r.consuntivo),
      `${r.scostamentoBudget >= 0 ? '+' : ''}${formatEuro(r.scostamentoBudget)} (${formatPercent(r.scostamentoBudgetPct)})`,
      `${r.scostamentoPrevisionale >= 0 ? '+' : ''}${formatEuro(r.scostamentoPrevisionale)} (${formatPercent(r.scostamentoPrevPct)})`
    ]);

    autoTable(pdf, {
      startY: currentY,
      head: [['Voce', 'Budget', 'Previsionale', 'Consuntivo', 'Scost. vs Budget', 'Scost. vs Prev.']],
      body: tableBody,
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
    });
  }

  // --- FOOTER ---
  const finalY = (pdf as any).lastAutoTable.finalY + 15;
  const pdfH = pdf.internal.pageSize.getHeight();
  
  // Footer line
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 20, pdfW - 15, pdfH - 20);

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN', 15, pdfH - 15);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Nota: I valori proiettati sono estrapolazioni lineari basate sui mesi trascorsi.', 15, pdfH - 10);
  pdf.text(`Pagina 1 di 1 — Flusso Smart 3.1`, pdfW - 15, pdfH - 15, { align: 'right' });

  pdf.save(`Conto_Economico_${selectedYear}_${activeTab}.pdf`);
};
