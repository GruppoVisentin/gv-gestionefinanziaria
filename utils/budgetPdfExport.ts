import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BudgetData } from '../types';

interface BudgetPdfOptions {
  selectedYear: number;
  budgetData: BudgetData;
  actuals: Record<string, number[]>;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const formatPercent = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 }).format(val);

export const exportBudgetPDF = ({
  selectedYear,
  budgetData,
  actuals
}: BudgetPdfOptions) => {
  const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape for better table fit
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
  pdf.text('REPORT BUDGET E SCOSTAMENTI', 15, 22);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Analisi Budget Anno: ${selectedYear}`, 15, 28);
  pdf.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 15, 33);

  // Badge Periodo
  pdf.setFillColor(79, 70, 229); // indigo-600
  pdf.roundedRect(pdfW - 65, 12, 50, 10, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.text('PIANIFICAZIONE ANNUALE', pdfW - 40, 18.5, { align: 'center' });

  // --- KPI SUMMARY BOXES ---
  let currentY = 50;
  const boxW = (pdfW - 40) / 4;
  const boxH = 20;

  const drawKPIBox = (x: number, y: number, label: string, actual: number, budget: number, color: [number, number, number]) => {
    const pct = budget > 0 ? (actual / budget) : 0;
    const diff = actual - budget;
    
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.roundedRect(x, y, boxW - 5, boxH, 2, 2, 'F');
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.roundedRect(x, y, boxW - 5, boxH, 2, 2, 'D');

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text(label.toUpperCase(), x + 5, y + 6);

    pdf.setFontSize(11);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(formatEuro(actual), x + 5, y + 13);

    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Target: ${formatEuro(budget)} (${formatPercent(pct)})`, x + 5, y + 18);
  };

  const getActual = (type: string) => Math.abs(actuals[type]?.reduce((a, b) => a + b, 0) || 0);
  const getBudget = (type: string) => budgetData.righe.find(r => r.ceType === type)?.budgetAnnuo || 0;

  drawKPIBox(15, currentY, 'Ricavi Core', getActual('ricavo_core'), getBudget('ricavo_core'), [15, 23, 42]);
  drawKPIBox(15 + boxW, currentY, 'Costi Variabili', getActual('costo_variabile'), getBudget('costo_variabile'), [79, 70, 229]);
  drawKPIBox(15 + boxW * 2, currentY, 'Costi Fissi', getActual('costo_fisso'), getBudget('costo_fisso'), [16, 185, 129]);
  drawKPIBox(15 + boxW * 3, currentY, 'Costi Studio', getActual('costo_studio'), getBudget('costo_studio'), [30, 41, 59]);

  currentY += 30;

  // --- BUDGET TABLE ---
  const tableBody = budgetData.righe.map(r => {
    const actualTotal = Math.abs(actuals[r.ceType]?.reduce((a, b) => a + b, 0) || 0);
    const diff = actualTotal - r.budgetAnnuo;
    const isIncome = r.ceType.startsWith('ricavo');
    const isPositive = isIncome ? diff >= 0 : diff <= 0;
    const pct = r.budgetAnnuo > 0 ? (actualTotal / r.budgetAnnuo) : 0;

    return [
      r.categoria,
      { content: formatEuro(r.budgetAnnuo), styles: { textColor: [180, 83, 9] as [number, number, number], fontStyle: 'bold' as const } }, // amber-700
      { content: formatEuro(actualTotal), styles: { textColor: [12, 74, 110] as [number, number, number], fontStyle: 'bold' as const } }, // sky-900
      { 
        content: `${diff >= 0 ? '+' : ''}${formatEuro(diff)}`, 
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
    head: [['Categoria', 'Budget Annuo', 'Consuntivo YTD', 'Scostamento', 'Avanzamento %']],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        data.cell.styles.lineColor = [241, 245, 249];
        data.cell.styles.lineWidth = 0.1;
      }
    }
  });

  // --- FOOTER ---
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 20, pdfW - 15, pdfH - 20);

  pdf.setFontSize(8);
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN', 15, pdfH - 15);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Nota: Lo scostamento positivo indica un ricavo superiore al budget o un costo inferiore.', 15, pdfH - 10);
  pdf.text(`Pagina 1 di 1 — Flusso Smart 3.1`, pdfW - 15, pdfH - 15, { align: 'right' });

  pdf.save(`Budget_Scostamenti_${selectedYear}.pdf`);
};
