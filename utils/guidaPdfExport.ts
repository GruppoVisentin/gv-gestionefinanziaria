import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { GLOSSARIO, CATEGORIE_GLOSSARIO } from '../content/glossary';
import { HELP_CONTENT } from '../content/helpContent';

export const exportGuidaPDF = (type: 'manuale' | 'glossario') => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  // Colors
  const colors = {
    primary: [30, 41, 59], // Slate 800
    secondary: [71, 85, 105], // Slate 600
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
      doc.text('Guida Metodologica & Glossario — Flusso Smart 3.1', pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(`Pagina ${i} di ${pageCount}`, pageWidth - 15, pageHeight - 12, { align: 'right' });
    }
  };

  if (type === 'manuale') {
    addHeader('MANUALE OPERATIVO - FLUSSO SMART 3.1');
    let currentY = 50;

    Object.entries(HELP_CONTENT).forEach(([key, section]: [string, any]) => {
      // Check for page break
      if (currentY > pageHeight - 60) {
        doc.addPage();
        addHeader('MANUALE OPERATIVO - FLUSSO SMART 3.1');
        currentY = 50;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.text(section.titolo.toUpperCase(), 15, currentY);
      currentY += 6;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      doc.text(section.sottotitolo, 15, currentY);
      currentY += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      const descLines = doc.splitTextToSize(section.descrizione, pageWidth - 30);
      doc.text(descLines, 15, currentY);
      currentY += descLines.length * 5 + 8;

      // A cosa serve
      doc.setFont('helvetica', 'bold');
      doc.text('A COSA SERVE:', 15, currentY);
      currentY += 5;
      doc.setFont('helvetica', 'normal');
      section.aQuiServe.forEach((item: string) => {
        const lines = doc.splitTextToSize(`• ${item}`, pageWidth - 35);
        doc.text(lines, 20, currentY);
        currentY += lines.length * 5;
      });
      currentY += 5;

      // Come si compila
      doc.setFont('helvetica', 'bold');
      doc.text('COME SI COMPILA:', 15, currentY);
      currentY += 5;
      doc.setFont('helvetica', 'normal');
      section.comeSiCompila.forEach((item: string, idx: number) => {
        const lines = doc.splitTextToSize(`${idx + 1}. ${item}`, pageWidth - 35);
        doc.text(lines, 20, currentY);
        currentY += lines.length * 5;
      });
      currentY += 15;
    });

  } else {
    addHeader('GLOSSARIO TERMINI TECNICI');
    let currentY = 50;

    const glossaryData = GLOSSARIO.map(t => [
      t.nome,
      CATEGORIE_GLOSSARIO[t.categoria],
      t.definizione
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Termine', 'Categoria', 'Definizione']],
      body: glossaryData,
      theme: 'grid',
      headStyles: { fillColor: colors.primary as [number, number, number], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 'auto' }
      }
    });
  }

  addFooter();
  doc.save(type === 'manuale' ? 'Manuale_GV_CashFlow.pdf' : 'Glossario_GV_CashFlow.pdf');
};
