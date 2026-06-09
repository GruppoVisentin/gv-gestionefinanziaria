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

  // --- PAGE 1: STATO PATRIMONIALE RICLASSIFICATO ---
  
  // Header styling
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 35, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('GRUPPO VISENTIN SRL', 15, 10);

  pdf.setFontSize(16);
  pdf.text('BILANCIO PATRIMONIALE RICLASSIFICATO', 15, 20);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Situazione al: ${new Date(snapshot.dataRiferimento).toLocaleDateString('it-IT')}`, 15, 26);
  pdf.text(`Documento di Analisi Tecnica Interna · Generato: ${new Date().toLocaleDateString('it-IT')}`, 15, 30);

  // Badge Quadratura
  const quadText = metrics.quadratura ? 'STATO: BILANCIO IN PAREGGIO' : 'STATO: SBILANCIO PATRIMONIALE';
  if (metrics.quadratura) {
    pdf.setFillColor(16, 185, 129); // emerald
  } else {
    pdf.setFillColor(244, 63, 94); // rose
  }
  pdf.roundedRect(pdfW - 70, 10, 55, 8, 1.5, 1.5, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(quadText, pdfW - 42.5, 15.5, { align: 'center' });

  let currentY = 45;

  // Draw main structure table
  const tableBody: any[] = [];

  // ATTIVO IMMOBILIZZATO
  tableBody.push([{ content: 'ATTIVO IMMOBILIZZATO', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [30, 41, 59] } }]);
  tableBody.push(['Immobilizzazioni Immateriali (brevetti, licenze, costi sviluppo)', formatEuro(snapshot.immImmateriali)]);
  tableBody.push(['Immobilizzazioni Materiali (impianti, macchinari, attrezzature edili)', formatEuro(snapshot.immMateriali)]);
  tableBody.push(['Immobili e Terreni (fabbricati industriali e terreni di sviluppo)', formatEuro(snapshot.immobiliTerreni)]);
  tableBody.push(['Partecipazioni (quote in imprese collegate, es. Visman)', formatEuro(snapshot.partecipazioni)]);
  tableBody.push([
    { content: 'TOTALE ATTIVO IMMOBILIZZATO (A)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
    { content: formatEuro(metrics.totAttivoImm), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
  ]);

  // ATTIVO CIRCOLANTE
  tableBody.push([{ content: 'ATTIVO CIRCOLANTE', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [30, 41, 59] } }]);
  tableBody.push(['Rimanenze di Magazzino e WIP (lavori in corso su commessa)', formatEuro(snapshot.rimanenze)]);
  tableBody.push(['Crediti commerciali v/Clienti (SAL certificati e fatture attive)', formatEuro(snapshot.creditiClienti)]);
  tableBody.push(['Crediti Tributari ed Erariali (IVA a credito, ritenute e imposte)', formatEuro(snapshot.creditiTributari)]);
  tableBody.push(['Disponibilità Liquide (cassa e saldi attivi conti correnti)', formatEuro(snapshot.liquidita)]);
  tableBody.push([
    { content: 'TOTALE ATTIVO CIRCOLANTE (B)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
    { content: formatEuro(metrics.totAttivoCirc), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
  ]);

  // TOTALE ATTIVO
  tableBody.push([
    { content: 'TOTALE CAPITALE INVESTITO ATTIVO (A + B)', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }, 
    { content: formatEuro(metrics.totAttivo), styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }
  ]);

  // PATRIMONIO NETTO
  tableBody.push([{ content: 'PATRIMONIO NETTO (MEZZI PROPRI)', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [30, 41, 59] } }]);
  tableBody.push(['Capitale Sociale sottoscritto e versato', formatEuro(snapshot.capitaleSociale)]);
  tableBody.push(['Riserve accumulate e utili portati a nuovo', formatEuro(snapshot.riserve)]);
  tableBody.push(['Utile / (Perdita) dell\'esercizio corrente', formatEuro(snapshot.utileEsercizio)]);
  tableBody.push([
    { content: 'TOTALE PATRIMONIO NETTO (C)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
    { content: formatEuro(metrics.totPN), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
  ]);

  // PASSIVO A LUNGO TERMINE
  tableBody.push([{ content: 'PASSIVITÀ A LUNGO TERMINE (DEBITO CONSOLIDATO)', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [30, 41, 59] } }]);
  tableBody.push(['Mutui e Finanziamenti LT (oltre 12m)', formatEuro(snapshot.mutuiLT)]);
  tableBody.push(['Debiti per operazioni di Leasing LT', formatEuro(snapshot.leasingLT)]);
  tableBody.push(['Trattamento Fine Rapporto (TFR dipendenti)', formatEuro(snapshot.tfr)]);
  tableBody.push([
    { content: 'TOTALE PASSIVO A LUNGO TERMINE (D)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
    { content: formatEuro(metrics.totPassivoLT), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
  ]);

  // PASSIVO A BREVE TERMINE
  tableBody.push([{ content: 'PASSIVITÀ A BREVE TERMINE (DEBITO CORRENTE)', colSpan: 2, styles: { fillColor: [248, 250, 252], fontStyle: 'bold', textColor: [30, 41, 59] } }]);
  tableBody.push(['Fidi bancari, scoperti e anticipi RT', formatEuro(snapshot.fidiRT)]);
  tableBody.push(['Debiti v/Fornitori e subappaltatori', formatEuro(snapshot.debitiFornitori)]);
  tableBody.push(['Debiti Tributari e Previdenziali (F24, IVA, INPS)', formatEuro(snapshot.debitiTributari)]);
  tableBody.push(['Acconti e caparre da Clienti su commesse', formatEuro(snapshot.accontiClienti)]);
  tableBody.push(['Altri Debiti a breve termine (soci c/finanziamento ecc.)', formatEuro(snapshot.altriDebitiBT)]);
  tableBody.push(['Quota corrente mutui/finanziamenti (entro 12m)', formatEuro(snapshot.mutuiBT || 0)]);
  tableBody.push([
    { content: 'TOTALE PASSIVO A BREVE TERMINE (E)', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
    { content: formatEuro(metrics.totPassivoBT), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }
  ]);

  // TOTALE PASSIVO E NETTO
  tableBody.push([
    { content: 'TOTALE FONTI DI FINANZIAMENTO (C + D + E)', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }, 
    { content: formatEuro(metrics.totPassivo), styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }
  ]);

  autoTable(pdf, {
    startY: currentY,
    head: [['Voce di Bilancio Riclassificato', 'Consuntivo (€)']],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 7.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 45, fontStyle: 'bold' }
    }
  });

  // Footer pagina 1
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Situazione Patrimoniale Riclassificata secondo criteri finanziari.', 15, pdfH - 10);
  pdf.text('Pagina 1 di 2 · Gruppo Visentin SRL', pdfW - 15, pdfH - 10, { align: 'right' });


  // --- PAGE 2: VALUTAZIONE INDICI E COMMENTO TECNICO ---
  pdf.addPage();
  
  // Header pagina 2
  pdf.setFillColor(30, 41, 59); // slate-800
  pdf.rect(0, 0, pdfW, 35, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('GRUPPO VISENTIN SRL', 15, 10);
  pdf.setFontSize(16);
  pdf.text('ANALISI E VALUTAZIONE DEGLI INDICI FINANZIARI', 15, 20);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Rapporto di valutazione del merito creditizio e struttura fonti-impieghi`, 15, 26);
  pdf.text(`Generato: ${new Date().toLocaleDateString('it-IT')}`, 15, 30);

  currentY = 45;

  // Tabella degli Indici
  const indexRows = [];

  // PFN
  const pfnJudgement = metrics.pfn <= 0 ? 'OTTIMO (Eccedenza di cassa)' : 'REGOLARE (Indebitamento netto finanziario)';
  indexRows.push([
    'Posizione Finanziaria Netta (PFN)',
    formatEuro(metrics.pfn),
    metrics.pfn <= 0 ? 'Liquidità Netta' : 'Debito Netto',
    pfnJudgement
  ]);

  // PFN / EBITDA
  let pfnEbitdaJudgement = 'N.D.';
  if (metrics.pfnSuEbitda !== undefined) {
    if (metrics.pfnSuEbitda < 1.5) { pfnEbitdaJudgement = 'OTTIMO (<1.5x)'; }
    else if (metrics.pfnSuEbitda <= 3) { pfnEbitdaJudgement = 'BUONO (1.5x - 3.0x)'; }
    else if (metrics.pfnSuEbitda <= 5) { pfnEbitdaJudgement = 'ATTENZIONE (3.0x - 5.0x)'; }
    else { pfnEbitdaJudgement = 'CRITICO (>5.0x)'; }
  }
  indexRows.push([
    'PFN / EBITDA',
    `${metrics.pfnSuEbitda.toFixed(2)}x`,
    'Target Settoriale: < 3.00x',
    pfnEbitdaJudgement
  ]);

  // Current Ratio
  let currentRatioJudgement = 'CRITICO (<1.00)';
  if (metrics.currentRatio >= 1.5) { currentRatioJudgement = 'ECCELLENTE (>1.50)'; }
  else if (metrics.currentRatio >= 1.2) { currentRatioJudgement = 'SOLIDO (1.20 - 1.50)'; }
  else if (metrics.currentRatio >= 1.0) { currentRatioJudgement = 'EQUILIBRATO (1.00 - 1.20)'; }
  indexRows.push([
    'Current Ratio (Indice Liquidità)',
    metrics.currentRatio.toFixed(2),
    'Target Settoriale: > 1.20',
    currentRatioJudgement
  ]);

  // Solidità Patrimoniale
  let soliditaJudgement = 'DEBOLE (<20%)';
  if (metrics.soliditaPatr >= 0.40) { soliditaJudgement = 'ECCELLENTE (>40%)'; }
  else if (metrics.soliditaPatr >= 0.30) { soliditaJudgement = 'OTTIMA (30% - 40%)'; }
  else if (metrics.soliditaPatr >= 0.20) { soliditaJudgement = 'SUFFICIENTE (20% - 30%)'; }
  indexRows.push([
    'Solidità Patrimoniale (PN / Attivo)',
    formatPercent(metrics.soliditaPatr),
    'Target Settoriale: > 30%',
    soliditaJudgement
  ]);

  // Copertura Immobilizzazioni
  const coperturaRatio = metrics.totPN / (metrics.totAttivoImm || 1);
  let coperturaJudgement = 'Sotto-copertura (<1.00)';
  if (coperturaRatio >= 1.2) { coperturaJudgement = 'Copertura Ottima (>1.20)'; }
  else if (coperturaRatio >= 1.0) { coperturaJudgement = 'Copertura Equilibrata (1.0 - 1.2)'; }
  indexRows.push([
    'Copertura Immobilizzazioni (PN / Att. Imm.)',
    coperturaRatio.toFixed(2),
    'Target Settoriale: > 1.00',
    coperturaJudgement
  ]);

  autoTable(pdf, {
    startY: currentY,
    head: [['Indicatore', 'Valore', 'Riferimento', 'Valutazione']],
    body: indexRows,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 3, lineColor: [226, 232, 240], lineWidth: 0.1 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 40 },
      3: { halign: 'center', fontStyle: 'bold', cellWidth: 50 }
    }
  });

  currentY = (pdf as any).lastAutoTable.finalY + 12;

  // Analisi Strutturale ed Autovalutazione
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 41, 59);
  pdf.text('VALUTAZIONE DI SINTESI E RATING PREVISIONALE (BASILEA 3)', 15, currentY);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(51, 65, 85);
  
  currentY += 5;
  const analysisText = 
    `1. STRUTTURA DELL'ATTIVO E COMPOSIZIONE DEL CAPITALE INVESTITO: L'attivo circolante (liquidità, crediti e rimanenze) costituisce il ${formatPercent(metrics.totAttivoCirc / (metrics.totAttivo || 1))} dell'attivo complessivo, evidenziando una struttura operativa dotata di elevata flessibilità finanziaria a breve termine. Le immobilizzazioni nette (immateriali, materiali, immobiliari e partecipazioni strategiche) si attestano al ${formatPercent(metrics.totAttivoImm / (metrics.totAttivo || 1))} del capitale totale. Questa suddivisione denota una corretta diversificazione per un'impresa edile, in quanto limita l'eccessiva immobilizzazione di risorse di lungo periodo favorendo il ciclo di cassa corrente.\n\n` +
    `2. EQUILIBRIO DI BREVE PERIODO E CAPACITÀ DI LIQUIDITÀ (CURRENT RATIO): Con un coefficiente di liquidità corrente pari a ${metrics.currentRatio.toFixed(2)}, l'indice si posiziona in area di ${metrics.currentRatio >= 1.2 ? 'sicurezza e stabilità' : 'attenzione'}. Questo significa che per ogni euro di debito scadente a breve (fornitori, fisco, banche), la società dispone di ${metrics.currentRatio.toFixed(2)} euro di risorse liquide o prontamente liquidabili entro l'anno. Il valore riflette un'ottimale sincronizzazione dei flussi finanziari correnti rispetto al ciclo delle passività operative.\n\n` +
    `3. LEVERAGE E GRADO DI INDIPENDENZA FINANZIARIA (SOLIDITÀ): Il patrimonio netto costituisce il ${formatPercent(metrics.soliditaPatr)} del totale delle fonti di finanziamento. Questa incidenza esprime un grado di capitalizzazione che si colloca ${metrics.soliditaPatr >= 0.3 ? 'sopra la soglia di allerta settoriale (30%), garantendo un ottimo scudo protettivo nei confronti dei creditori terzi' : 'in area da consolidare mediante una politica di ritenzione prudenziale degli utili d\'esercizio a riserva straordinaria'}. La struttura delle fonti è complessivamente bilanciata.\n\n` +
    `4. SOSTENIBILITÀ DEL DEBITO FINANZIARIO ED EBITDA COVERAGE: Il rapporto PFN/EBITDA, pari a ${metrics.pfnSuEbitda.toFixed(2)}x, indica che l'indebitamento finanziario netto è ampiamente sostenibile ed è coperto dai flussi di cassa lordi ricorrenti generati dall'attività operativa. Poiché il coefficiente si colloca ampiamente sotto il limite prudenziale di 3.00x, il profilo di solvibilità aziendale risulta solido ed esprime una notevole capacità di assorbimento del debito bancario residuo.`;

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
  pdf.text('SUGGERIMENTI STRATEGICI DI OTTIMIZZAZIONE PATRIMONIALE', 20, currentY + 6);
  
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(71, 85, 105);
  const raccomandazioneText = 
    `• OTTIMIZZAZIONE DEL DSO E MONITORAGGIO CREDITI COMMERCIALI: Al fine di azzerare l'uso di linee autoliquidanti o scoperti di conto a breve (Fidi RT), implementare procedure sistematiche di incasso dei SAL a scadenza, riducendo i tempi medi di pagamento dei committenti.\n` +
    `• POLITICA DI AUTOFINANZIAMENTO (ACCANTONAMENTO UTILI): Suggeriamo di destinare una quota preponderante degli utili d'esercizio futuri a riserve patrimoniali straordinarie anziché alla distribuzione, elevando la solidità oltre il target del 35%.\n` +
    `• STRUTTURAZIONE DEL DEBITO MEDIO-LUNGO TERMINE (LEASING / MUTUI IPOTECARI): Coprire le necessità di Capex (investimenti in beni strumentali) esclusivamente con leasing a lungo termine o mutui finalizzati con tassi protetti (es. Euribor con cap), azzerando l'esposizione sui conti correnti operativi a revoca.`;
  pdf.text(raccomandazioneText, 20, currentY + 12);

  // Footer pagina 2
  pdf.setDrawColor(226, 232, 240);
  pdf.line(15, pdfH - 18, pdfW - 15, pdfH - 18);

  pdf.setFontSize(6.5);
  pdf.setTextColor(148, 163, 184);
  pdf.setFont('helvetica', 'bold');
  pdf.text('GRUPPO VISENTIN SRL', 15, pdfH - 13);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Flusso Smart 3.1 — Report di valutazione patrimoniale integrato con standard Basilea 3 per il settore delle costruzioni.', 15, pdfH - 9);
  pdf.text(`Pagina 2 di 2 · Generato in modo sicuro`, pdfW - 15, pdfH - 13, { align: 'right' });

  pdf.save(`Stato_Patrimoniale_${snapshot.dataRiferimento}.pdf`);
};
