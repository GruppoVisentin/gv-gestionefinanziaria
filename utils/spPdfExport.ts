import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SPSnapshot } from '../types';

interface SPPdfOptions {
  snapshot: SPSnapshot;
  metrics: any;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

export const exportSPPDF = ({
  snapshot,
  metrics
}: SPPdfOptions) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // --- HEADER ---
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 40, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN', 15, 12);

  pdf.setFontSize(18);
  pdf.text('REPORT STATO PATRIMONIALE', 15, 22);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Data Riferimento: ${new Date(snapshot.dataRiferimento).toLocaleDateString('it-IT')}`, 15, 28);
  pdf.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 15, 33);

  // Badge Quadratura
  const quadText = metrics.quadratura ? 'BILANCIO QUADRATO' : 'SBILANCIO RILEVATO';
  if (metrics.quadratura) {
    pdf.setFillColor(16, 185, 129); // emerald
  } else {
    pdf.setFillColor(244, 63, 94); // rose
  }
  pdf.roundedRect(pdfW - 65, 12, 50, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.text(quadText, pdfW - 40, 18.5, { align: 'center' });

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

  drawKPIBox(15, currentY, 'PFN', formatEuro(metrics.pfn), metrics.pfn <= 0 ? 'LIQUIDITÀ' : 'DEBITO', [15, 23, 42]);
  drawKPIBox(15 + boxW, currentY, 'Current Ratio', metrics.currentRatio.toFixed(2), metrics.currentRatio > 1 ? 'SOLIDO' : 'CRITICO', [79, 70, 229]);
  drawKPIBox(15 + boxW * 2, currentY, 'Solidità', formatPercent(metrics.soliditaPatr), 'PN / ATTIVO', [16, 185, 129]);
  drawKPIBox(15 + boxW * 3, currentY, 'Tot. Attivo', formatEuro(metrics.totAttivo), 'CAPITALE INVESTITO', [30, 41, 59]);

  currentY += 30;

  // --- MAIN TABLES (ATTIVO & PASSIVO) ---
  const tableBody: any[] = [];

  // ATTIVO
  tableBody.push([{ content: 'ATTIVO IMMOBILIZZATO', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
  tableBody.push(['Immobilizzazioni Immateriali', formatEuro(snapshot.immImmateriali)]);
  tableBody.push(['Immobilizzazioni Materiali', formatEuro(snapshot.immMateriali)]);
  tableBody.push(['Immobili e Terreni', formatEuro(snapshot.immobiliTerreni)]);
  tableBody.push(['Partecipazioni', formatEuro(snapshot.partecipazioni)]);
  tableBody.push([{ content: 'TOTALE ATTIVO IMMOBILIZZATO', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: formatEuro(metrics.totAttivoImm), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);

  tableBody.push([{ content: 'ATTIVO CIRCOLANTE', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
  tableBody.push(['Rimanenze', formatEuro(snapshot.rimanenze)]);
  tableBody.push(['Crediti verso Clienti', formatEuro(snapshot.creditiClienti)]);
  tableBody.push(['Crediti Tributari', formatEuro(snapshot.creditiTributari)]);
  tableBody.push(['Disponibilità Liquide', formatEuro(snapshot.liquidita)]);
  tableBody.push([{ content: 'TOTALE ATTIVO CIRCOLANTE', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: formatEuro(metrics.totAttivoCirc), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);

  tableBody.push([{ content: 'TOTALE ATTIVO', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }, { content: formatEuro(metrics.totAttivo), styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }]);

  // PASSIVO
  tableBody.push([{ content: 'PATRIMONIO NETTO', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
  tableBody.push(['Capitale Sociale', formatEuro(snapshot.capitaleSociale)]);
  tableBody.push(['Riserve', formatEuro(snapshot.riserve)]);
  tableBody.push(['Utile d\'Esercizio', formatEuro(snapshot.utileEsercizio)]);
  tableBody.push([{ content: 'TOTALE PATRIMONIO NETTO', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: formatEuro(metrics.totPN), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);

  tableBody.push([{ content: 'PASSIVITÀ A LUNGO TERMINE', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
  tableBody.push(['Mutui e Finanziamenti LT', formatEuro(snapshot.mutuiLT)]);
  tableBody.push(['Leasing LT', formatEuro(snapshot.leasingLT)]);
  tableBody.push(['TFR', formatEuro(snapshot.tfr)]);
  tableBody.push([{ content: 'TOTALE PASSIVO LT', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: formatEuro(metrics.totPassivoLT), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);

  tableBody.push([{ content: 'PASSIVITÀ A BREVE TERMINE', colSpan: 2, styles: { fillColor: [241, 245, 249], fontStyle: 'bold' } }]);
  tableBody.push(['Fidi e RT', formatEuro(snapshot.fidiRT)]);
  tableBody.push(['Debiti verso Fornitori', formatEuro(snapshot.debitiFornitori)]);
  tableBody.push(['Debiti Tributari', formatEuro(snapshot.debitiTributari)]);
  tableBody.push(['Acconti da Clienti', formatEuro(snapshot.accontiClienti)]);
  tableBody.push(['Altri Debiti BT', formatEuro(snapshot.altriDebitiBT)]);
  tableBody.push(['Quota Corrente Mutui', formatEuro(snapshot.mutuiBT || 0)]);
  tableBody.push([{ content: 'TOTALE PASSIVO BT', styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }, { content: formatEuro(metrics.totPassivoBT), styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } }]);

  tableBody.push([{ content: 'TOTALE PASSIVO E NETTO', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }, { content: formatEuro(metrics.totPassivo), styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }]);

  autoTable(pdf, {
    startY: currentY,
    head: [['Voce di Bilancio', 'Importo']],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right', cellWidth: 40 }
    }
  });

  // --- FOOTER ---
  // Footer line
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 20, pdfW - 15, pdfH - 20);

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN', 15, pdfH - 15);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Situazione Patrimoniale e Finanziaria — Analisi Professionale.', 15, pdfH - 10);
  pdf.text(`Pagina 1 di 1 — Flusso Smart 3.1`, pdfW - 15, pdfH - 15, { align: 'right' });

  pdf.save(`Stato_Patrimoniale_${snapshot.dataRiferimento}.pdf`);
};
