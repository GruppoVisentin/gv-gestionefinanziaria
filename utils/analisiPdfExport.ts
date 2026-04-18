import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatEuro, formatPercent } from './formatters';

interface AnalisiPdfData {
  anno: number;
  rates: any;
  metrics: any;
  resCantiere: any;
  resImmobiliare: any;
  resOrario: any;
  previsioneFiscale: any;
}

export const exportAnalisiPDF = (data: AnalisiPdfData) => {
  const { anno, rates, metrics, resCantiere, resImmobiliare, resOrario, previsioneFiscale } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Colors
  const colors = {
    primary: [30, 41, 59], // Slate 800
    secondary: [71, 85, 105], // Slate 600
    accent: [14, 165, 233], // Sky 500
    success: [16, 185, 129], // Emerald 500
    warning: [245, 158, 11], // Amber 500
    danger: [239, 68, 68], // Rose 500
    light: [248, 250, 252], // Slate 50
    border: [226, 232, 240], // Slate 200
  };

  const addHeader = (title: string) => {
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('GRUPPO VISENTIN', 15, 18);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(title, 15, 28);
    
    doc.setFontSize(10);
    doc.text(`Anno di Riferimento: ${anno}`, pageWidth - 15, 18, { align: 'right' });
    doc.text(`Data Report: ${new Date().toLocaleDateString('it-IT')}`, pageWidth - 15, 28, { align: 'right' });
  };

  const addFooter = () => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
      doc.line(15, pageHeight - 20, pageWidth - 15, pageHeight - 20);
      
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('GRUPPO VISENTIN', 15, pageHeight - 12);
      
      doc.setFont('helvetica', 'normal');
      doc.text('Analisi & Indici di Struttura — Report Riservato', pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - 15, pageHeight - 12, { align: 'right' });
    }
  };

  // --- PAGINA 1: INDICI E NUMERI SACRI ---
  addHeader('ANALISI & INDICI DI STRUTTURA');
  let currentY = 50;

  // 7+1 Numeri Sacri
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text('I 7+1 Numeri Sacri (KPI Chiave)', 15, currentY);
  currentY += 10;

  const sacriData = [
    ['Fatturato YTD', formatEuro(metrics.fatturato), 'Punto di Pareggio', formatEuro(metrics.breakEven)],
    ['Primo Margine %', formatPercent(metrics.primoMarginePercent), 'Incidenza Studio %', formatPercent(rates.incidenzaStudioFatturato)],
    ['EBITDA %', formatPercent(metrics.ebitdaPercent), 'Incidenza Fissi %', formatPercent(rates.incidenzaFissiFatturato)],
    ['Utile Netto %', formatPercent(metrics.utileNettoPercent), 'Compenso Soci', formatEuro(rates.compensoSoci)]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Indicatore', 'Valore', 'Indicatore', 'Valore']],
    body: sacriData,
    theme: 'grid',
    headStyles: { fillColor: colors.primary as [number, number, number], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [249, 250, 251] as [number, number, number] },
      1: { halign: 'right', fontStyle: 'bold' },
      2: { fontStyle: 'bold', fillColor: [249, 250, 251] as [number, number, number] },
      3: { halign: 'right', fontStyle: 'bold' }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Indici Struttura
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Indici di Struttura & Overhead', 15, currentY);
  currentY += 10;

  const indiciData = [
    ['Incidenza Studio sul Fatturato', formatPercent(rates.incidenzaStudioFatturato), formatEuro(rates.totaleCostiStudio)],
    ['Incidenza Overhead Totale sul Fatturato', formatPercent(rates.incidenzaCompletaFatturato), formatEuro(rates.totaleOverheadCompleto)],
    ['Oneri Finanziari (Incidenza su Fatturato)', formatPercent(rates.totaleOneriFin / (rates.fatturato > 0 ? rates.fatturato : 1)), formatEuro(rates.totaleOneriFin)]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Voce di Costo / Indice', 'Percentuale', 'Importo Assoluto']],
    body: indiciData,
    theme: 'striped',
    headStyles: { fillColor: colors.secondary as [number, number, number], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: {
      1: { halign: 'center', fontStyle: 'bold' },
      2: { halign: 'right', fontStyle: 'bold' }
    }
  });

  // --- PAGINA 2: CALCOLATORI E FISCALE ---
  doc.addPage();
  addHeader('CALCOLATORI PREVENTIVI & PREVISIONE FISCALE');
  currentY = 50;

  // Calcolatore Preventivo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text('Calcolatore Preventivo Rapido', 15, currentY);
  currentY += 10;

  const preventivoData = [
    ['CANTIERE: Prezzo Minimo da Offrire', formatEuro(resCantiere.prezzoMinimo), `Coeff: ${resCantiere.coefficienteRicarico.toFixed(2)}x`],
    ['IMMOBILIARE: Prezzo Vendita Minimo', formatEuro(resImmobiliare.prezzoVenditaMinimo), `ROI: ${formatPercent(resImmobiliare.roiOperazione)}`],
    ['COSTO ORARIO: Costo Reale / Ora', formatEuro(resOrario.costoOrarioReale), `Contrattuale: ${formatEuro(resOrario.costoOrarioContrattuale)}`]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Tipologia Calcolo', 'Risultato', 'Parametro Chiave']],
    body: preventivoData,
    theme: 'grid',
    headStyles: { fillColor: [51, 65, 85] as [number, number, number], textColor: 255 },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold', textColor: colors.accent as [number, number, number] },
      2: { halign: 'center', fontStyle: 'italic' }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Previsione Fiscale
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Previsione Fiscale Stimata', 15, currentY);
  currentY += 10;

  const fiscaleData = [
    ['Base Imponibile IRES', formatEuro(previsioneFiscale.baseImponibileIRES), 'IRES Stimata', formatEuro(previsioneFiscale.iresStimata)],
    ['Base Imponibile IRAP', formatEuro(previsioneFiscale.baseImponibileIRAP), 'IRAP Stimata', formatEuro(previsioneFiscale.irapStimata)],
    ['Totale Imposte Stimate', formatEuro(previsioneFiscale.totaleImposteStimate), 'Residuo da Versare', formatEuro(previsioneFiscale.residuoDaVersare)],
    ['Utile Netto Dopo Imposte', formatEuro(previsioneFiscale.utileDopoImposte), '', '']
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Voce Fiscale', 'Importo', 'Voce Fiscale', 'Importo']],
    body: fiscaleData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42] as [number, number, number], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' },
      3: { halign: 'right', fontStyle: 'bold' }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
  doc.text('Nota: I calcoli fiscali sono stime semplificate e non sostituiscono il parere del commercialista.', 15, currentY);

  addFooter();
  doc.save(`Analisi_Indici_GV_${anno}.pdf`);
};
