import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PDFReportConfig {
  titolo: string;           // es. "Conto Economico 2025"
  sottotitolo?: string;     // es. "Progressivo YTD - Marzo 2025"
  elementId: string;        // id del div da catturare
  orientazione?: 'portrait' | 'landscape';  // default portrait
  nomeFile?: string;        // es. "CE_2025_marzo" (senza .pdf)
}

export const esportaPDF = async (config: PDFReportConfig): Promise<void> => {
  const elemento = document.getElementById(config.elementId);
  if (!elemento) {
    alert('Elemento non trovato per l\'export PDF');
    return;
  }

  // Mostra indicatore caricamento
  const loadingEl = document.createElement('div');
  loadingEl.innerHTML = '⏳ Generazione PDF in corso...';
  loadingEl.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 9999;
    background: #222222; color: white; padding: 12px 20px;
    border-radius: 8px; font-family: Arial; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(loadingEl);

  try {
    const canvas = await html2canvas(elemento, {
      scale: 2,              // Alta risoluzione
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      // Nasconde elementi con classe no-print durante la cattura
      ignoreElements: (el) => el.classList.contains('no-print'),
    });

    const imgData = canvas.toDataURL('image/png');
    const orientazione = config.orientazione ?? 'portrait';
    const pdf = new jsPDF({
      orientation: orientazione,
      unit: 'mm',
      format: 'a4',
    });

    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    // ── HEADER DEL REPORT ──────────────────────────────────────
    // Sfondo intestazione
    pdf.setFillColor(34, 34, 34);  // Nero smorzato
    pdf.rect(0, 0, pdfW, 22, 'F');

    // Logo testuale GV
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('GRUPPO VISENTIN SRL', 10, 10);

    // Titolo report
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(config.titolo.toUpperCase(), 10, 16);

    // Data generazione (destra)
    const dataGen = new Date().toLocaleDateString('it-IT', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    pdf.setFontSize(8);
    pdf.text(`Generato il: ${dataGen}`, pdfW - 10, 10, { align: 'right' });

    if (config.sottotitolo) {
      pdf.text(config.sottotitolo, pdfW - 10, 16, { align: 'right' });
    }

    // ── CONTENUTO ──────────────────────────────────────────────
    const margineTop = 26;  // sotto l'header
    const altezzaDisponibile = pdfH - margineTop - 12;  // 12 = footer
    const larghezzaDisponibile = pdfW - 20;  // 10mm margini

    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = imgW / imgH;

    let imgPdfW = larghezzaDisponibile;
    let imgPdfH = imgPdfW / ratio;

    // Se il contenuto è più alto di una pagina, va su più pagine
    if (imgPdfH <= altezzaDisponibile) {
      // Tutto su una pagina
      pdf.addImage(imgData, 'PNG', 10, margineTop, imgPdfW, imgPdfH);
    } else {
      // Paginazione automatica
      const pageCount = Math.ceil(imgPdfH / altezzaDisponibile);
      const sliceH = (canvas.height / pageCount);

      for (let i = 0; i < pageCount; i++) {
        if (i > 0) {
          pdf.addPage();
          // Header ripetuto su ogni pagina
          pdf.setFillColor(34, 34, 34);
          pdf.rect(0, 0, pdfW, 12, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text(`${config.titolo} — pag. ${i + 1}/${pageCount}`, 10, 8);
        }

        const srcY = i * sliceH;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(sliceH, canvas.height - srcY);
        const ctx = sliceCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, -srcY);
        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceH_pdf = altezzaDisponibile;
        pdf.addImage(sliceData, 'PNG', 10,
          i === 0 ? margineTop : 14,
          imgPdfW, sliceH_pdf);
      }
    }

    // ── FOOTER ─────────────────────────────────────────────────
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFillColor(245, 245, 245);
      pdf.rect(0, pdfH - 10, pdfW, 10, 'F');
      pdf.setTextColor(100, 100, 100);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.text('GV Ecosystem — Gestione Finanziaria Avanzata', 10, pdfH - 4);
      pdf.text(`Pagina ${i} di ${totalPages}`, pdfW - 10, pdfH - 4, { align: 'right' });
    }

    // ── SALVA ──────────────────────────────────────────────────
    const nomeFile = config.nomeFile
      ?? config.titolo.replace(/\s+/g, '_').toLowerCase();
    const dataStr = new Date().toISOString().split('T')[0];
    pdf.save(`GV_${nomeFile}_${dataStr}.pdf`);

  } catch (err) {
    console.error('Errore export PDF:', err);
    alert('Errore durante la generazione del PDF. Riprova.');
  } finally {
    if (document.body.contains(loadingEl)) {
      document.body.removeChild(loadingEl);
    }
  }
};
