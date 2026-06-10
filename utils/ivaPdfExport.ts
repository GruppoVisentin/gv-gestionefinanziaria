import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RiepilogoIVA } from './gasCoreEngine';

interface IVAPdfOptions {
  riepilogo: RiepilogoIVA;
  anno: number;
  vistaPrevisionale: boolean;
}

const formatEuro = (val: number) => 
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export const exportIVAPDF = ({
  riepilogo,
  anno,
  vistaPrevisionale
}: IVAPdfOptions) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  // --- HEADER SECTION ---
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 38, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('GRUPPO VISENTIN SRL', 15, 10);

  pdf.setFontSize(15);
  pdf.text(`REPORT TECNICO: POSIZIONE IVA & PIANIFICAZIONE SCADENZE F24`, 15, 20);

  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Periodo d'Imposta: ${anno} · Vista: ${vistaPrevisionale ? 'PREVISIONALE (FORECAST)' : 'CONSUNTIVA (REALE)'} · Regime IVA Rilevato: ${riepilogo.frequenzaLiquidazione.toUpperCase()}`, 15, 27);
  pdf.text(`Documento di Analisi Finanziaria Interna · Generato il: ${new Date().toLocaleString('it-IT')}`, 15, 32);

  // Status Badge
  const badgeText = vistaPrevisionale ? 'VISTA PREVISIONALE ATTIVA' : 'VISTA CONSUNTIVA (REALE)';
  if (vistaPrevisionale) {
    pdf.setFillColor(109, 40, 217); // violet-700
  } else {
    pdf.setFillColor(16, 185, 129); // emerald
  }
  pdf.roundedRect(pdfW - 65, 12, 50, 8, 1.5, 1.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text(badgeText, pdfW - 40, 17.5, { align: 'center' });

  let currentY = 45;

  // --- SECTION 1: QUADRO DI SINTESI (KPIs) ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('1. QUADRO DI SINTESI ANNUALE', 15, currentY);
  currentY += 4;

  const kpiData: any[] = [
    [
      { content: 'Totale IVA Esigibile (su ricavi incassati)', styles: { fontStyle: 'normal' } },
      { content: formatEuro(riepilogo.totaleIvaIncassata), styles: { fontStyle: 'bold', textColor: [37, 99, 235] } },
      { content: 'Totale IVA Detraibile (su acquisti pagati)', styles: { fontStyle: 'normal' } },
      { content: formatEuro(riepilogo.totaleIvaPagata), styles: { fontStyle: 'bold', textColor: [225, 29, 72] } }
    ],
    [
      { content: vistaPrevisionale ? 'F24 IVA Versati + Stime Future (*)' : 'F24 IVA Versati Effettivamente', styles: { fontStyle: 'normal' } },
      { content: formatEuro(riepilogo.totaleVersato), styles: { fontStyle: 'bold', textColor: [217, 119, 6] } },
      { content: riepilogo.creditoDebitoResiduo > 0 ? 'Debito Residuo Stimato da Versare' : 'Credito IVA Cumulato Previsto', styles: { fontStyle: 'bold' } },
      { content: formatEuro(Math.abs(riepilogo.creditoDebitoResiduo)), styles: { fontStyle: 'bold', fillColor: riepilogo.creditoDebitoResiduo > 0 ? [254, 242, 242] : [240, 253, 250], textColor: riepilogo.creditoDebitoResiduo > 0 ? [185, 28, 28] : [15, 118, 110] } }
    ]
  ];

  autoTable(pdf, {
    startY: currentY,
    body: kpiData,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 60 },
      3: { cellWidth: 35, halign: 'right' }
    }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 8;

  // --- SECTION 2: REGISTRO LIQUIDAZIONE MENSILE ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('2. DETTAGLIO LIQUIDAZIONI MENSILI REGISTRATE / STIMATE', 15, currentY);
  currentY += 4;

  const tableBody: any[] = [];
  
  riepilogo.mensile.forEach((m) => {
    const isForecast = !!m.isForecastMese;
    
    tableBody.push([
      { content: MONTH_NAMES[m.mese], styles: { fontStyle: 'bold', fillColor: isForecast ? [250, 245, 255] : [255, 255, 255] } },
      m.ivaIncassata > 0 ? formatEuro(m.ivaIncassata) : '—',
      m.ivaPagata > 0 ? formatEuro(m.ivaPagata) : '—',
      m.saldoIVA !== 0 ? { content: formatEuro(m.saldoIVA), styles: { fontStyle: 'bold', textColor: m.saldoIVA >= 0 ? [37, 99, 235] : [225, 29, 72] } } : '—',
      m.versamentoIVA > 0 ? { content: formatEuro(m.versamentoIVA) + (isForecast ? ' *' : ''), styles: { fontStyle: isForecast ? 'bold' : 'normal', textColor: isForecast ? [109, 40, 217] : [217, 119, 6] } } : '—',
      m.posizionNetta !== 0 ? { content: (m.posizionNetta > 0 ? 'Da versare ' : 'Credito ') + formatEuro(Math.abs(m.posizionNetta)), styles: { fontStyle: 'bold', textColor: m.posizionNetta > 0 ? [225, 29, 72] : [15, 118, 110] } } : '—',
      isForecast ? { content: 'FORECAST', styles: { fontStyle: 'bold', textColor: [109, 40, 217], halign: 'center', fillColor: [250, 245, 255] } } : { content: 'CONSUNTIVO', styles: { fontStyle: 'normal', textColor: [71, 85, 105], halign: 'center' } }
    ]);
  });

  // Riga totali
  const totaleSaldo = riepilogo.totaleIvaIncassata - riepilogo.totaleIvaPagata;
  tableBody.push([
    { content: 'TOTALE ANNO', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: formatEuro(riepilogo.totaleIvaIncassata), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: formatEuro(riepilogo.totaleIvaPagata), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: formatEuro(totaleSaldo), styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: totaleSaldo >= 0 ? [37, 99, 235] : [225, 29, 72] } },
    { content: formatEuro(riepilogo.totaleVersato), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
    { content: (riepilogo.creditoDebitoResiduo > 0 ? 'Da versare ' : 'Credito ') + formatEuro(Math.abs(riepilogo.creditoDebitoResiduo)), styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: riepilogo.creditoDebitoResiduo > 0 ? [225, 29, 72] : [15, 118, 110] } },
    { content: '—', styles: { fillColor: [241, 245, 249], halign: 'center' } }
  ]);

  autoTable(pdf, {
    startY: currentY,
    head: [['Mese di Riferimento', 'IVA Esigibile (Attiva)', 'IVA Detraibile (Passiva)', 'Saldo Periodo', 'Versamento F24', 'Posizione Netta', 'Stato Dati']],
    body: tableBody,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { halign: 'right', cellWidth: 28 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 27 },
      6: { cellWidth: 20 }
    }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 8;

  // --- SECTION 3: NOTE TECNICHE E RIFERIMENTI REGOLAMENTARI ---
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('3. RIFERIMENTI NORMATIVI E METODOLOGIA DI COMPUTO', 15, currentY);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  
  currentY += 4;
  const noteTecnicheText = 
    `• LIQUIDAZIONE PERIODICA DELL'IVA (D.P.R. 633/1972): La determinazione periodica della posizione IVA segue le prescrizioni del D.P.R. 26 ottobre 1972, n. 633. Ai sensi del D.P.R. 100/1998 (mensili) e del D.P.R. 542/1999 (trimestrali), la liquidazione mensile impone il versamento dell'eccedenza di debito entro il giorno 16 del mese successivo. Il regime trimestrale sposta la scadenza al giorno 16 del secondo mese successivo a ciascuno dei primi tre trimestri (16 maggio, 16 agosto, 16 novembre), applicando una maggiorazione dell'1% a titolo di interessi.\n\n` +
    `• REGIME DEL REVERSE CHARGE IN EDILIZIA (ART. 17 D.P.R. 633/1972): In applicazione dell'Art. 17, comma 6, lett. a) del D.P.R. 633/1972, le prestazioni di subappalto rese nel settore edile sono soggette al meccanismo di inversione contabile. Il subappaltatore emette fattura senza addebito d'imposta, e l'appaltatore (Gruppo Visentin) integra la fattura registrando l'IVA sia a debito che a credito. Di conseguenza, i relativi flussi di cassa non includono esborsi IVA verso il subappaltatore (flusso di cassa IVA pari a 0%).\n\n` +
    `• ESCLUSIONE IVA PER CAPARRE CONFIRMATORIE (ART. 15 D.P.R. 633/1972): La caparra confirmatoria ha natura di risarcimento del danno e garanzia, priva di funzione corrispettiva. Pertanto, ai sensi dell'Art. 15 del D.P.R. 633/1972, essa è esclusa dalla base imponibile IVA ed è correttamente assoggettata all'aliquota del 0% nelle timeline previsionali e nei flussi Punta Net.\n\n` +
    `• RETRIBUZIONI DIPENDENTI E CONTRIBUTI PREVIDENZIALI: Gli stipendi erogati e i relativi versamenti previdenziali (INPS, INAIL, Cassa Edile) non integrano i presupposti di imponibilità IVA (carenza dei requisiti ex artt. 2 e 3 D.P.R. 633/1972). Tali importi sono gestiti stabilmente ad aliquota 0%.\n\n` +
    `• MODELLO DI PROIEZIONE FINANZIARIA PREVISIONALE (*): Nei mesi forecast, l'algoritmo calcola in cascata l'effetto IVA delle fatturazioni stimate e dei costi pianificati. Il debito cumulato netto residuo genera automaticamente un versamento F24 proiettato al mese successivo (m+1) o al trimestre successivo. In caso di saldo negativo (credito), questo viene registrato come credito IVA cumulato e portato in compensazione verticale sui debiti dei periodi successivi, minimizzando le uscite di cassa stimate.`;

  const splitText = pdf.splitTextToSize(noteTecnicheText, pdfW - 30);
  pdf.text(splitText, 15, currentY);

  // Footer section
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 15, pdfW - 15, pdfH - 15);

  pdf.setFontSize(6.5);
  pdf.setTextColor(148, 163, 184);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN SRL', 15, pdfH - 10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Flusso Smart 3.1 — Report tecnico di pianificazione fiscale IVA ai sensi del D.P.R. 633/1972.', 15, pdfH - 6);
  pdf.text(`Pagina 1 di 1 · Generato in ambiente protetto`, pdfW - 15, pdfH - 10, { align: 'right' });

  // Save PDF
  pdf.save(`Posizione_IVA_${anno}_${vistaPrevisionale ? 'Previsionale' : 'Consuntivo'}.pdf`);
};
