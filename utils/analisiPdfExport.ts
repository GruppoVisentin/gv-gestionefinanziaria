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
  vistaPrevFiscale?: boolean;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  nero:      [15,  23,  42]  as [number,number,number], // slate-900
  slate700:  [51,  65,  85]  as [number,number,number],
  slate600:  [71,  85,  105] as [number,number,number],
  slate400:  [148,163,184]   as [number,number,number],
  slate200:  [226,232,240]   as [number,number,number],
  slate50:   [248,250,252]   as [number,number,number],
  emerald:   [16, 185,129]   as [number,number,number],
  emeraldLt: [209,250,229]   as [number,number,number],
  blue:      [59, 130,246]   as [number,number,number],
  blueLt:    [219,234,254]   as [number,number,number],
  amber:     [245,158, 11]   as [number,number,number],
  amberLt:   [254,243,199]   as [number,number,number],
  rose:      [239, 68, 68]   as [number,number,number],
  roseLt:    [254,226,226]   as [number,number,number],
  white:     [255,255,255]   as [number,number,number],
};

// ─── Threshold helpers ────────────────────────────────────────────────────────
type Fascia = 'ottimo' | 'buono' | 'attenzione' | 'critico';

const fasciaColor = (f: Fascia): [number,number,number] =>
  f === 'ottimo' ? C.emerald : f === 'buono' ? C.blue : f === 'attenzione' ? C.amber : C.rose;

const fasciaLtColor = (f: Fascia): [number,number,number] =>
  f === 'ottimo' ? C.emeraldLt : f === 'buono' ? C.blueLt : f === 'attenzione' ? C.amberLt : C.roseLt;

const fasciaLabel = (f: Fascia) =>
  f === 'ottimo' ? '● OTTIMO' : f === 'buono' ? '● BUONO' : f === 'attenzione' ? '▲ ATTENZIONE' : '✖ CRITICO';

// KPI thresholds
const fasciaPrimoMargine = (v: number): Fascia =>
  v >= 0.15 ? 'ottimo' : v >= 0.10 ? 'buono' : v >= 0.05 ? 'attenzione' : 'critico';
const fasciaEbitda = (v: number): Fascia =>
  v >= 0.10 ? 'ottimo' : v >= 0.07 ? 'buono' : v >= 0.04 ? 'attenzione' : 'critico';
const fasciaUtileNetto = (v: number): Fascia =>
  v >= 0.06 ? 'ottimo' : v >= 0.04 ? 'buono' : v >= 0.02 ? 'attenzione' : 'critico';
const fasciaIncidenzaStudio = (v: number): Fascia =>
  v < 0.15 ? 'ottimo' : v < 0.20 ? 'buono' : v < 0.25 ? 'attenzione' : 'critico';
const fasciaIncidenzaFissi = (v: number): Fascia =>
  v < 0.08 ? 'ottimo' : v < 0.12 ? 'buono' : v < 0.15 ? 'attenzione' : 'critico';
const fasciaBep = (fatturato: number, bep: number): Fascia =>
  fatturato >= bep ? 'ottimo' : fatturato >= bep * 0.8 ? 'attenzione' : 'critico';
const fasciaCompenso = (compenso: number, utile: number): Fascia => {
  if (utile <= 0) return 'critico';
  const r = compenso / utile;
  return r <= 0.30 ? 'ottimo' : r <= 0.50 ? 'buono' : r <= 0.80 ? 'attenzione' : 'critico';
};

// Narrative commentaries per fascia
const commentoPrimoMargine = (v: number, f: Fascia): string => {
  const vf = (v * 100).toFixed(1);
  if (f === 'ottimo') return `Il Primo Margine del ${vf}% è eccellente. L'azienda riesce a trattenere oltre il 15% del fatturato dopo aver coperto i costi diretti di cantiere. Questo livello garantisce un'ampia capacità di assorbire i costi fissi di struttura e generare utile.`;
  if (f === 'buono') return `Il Primo Margine del ${vf}% è in linea con i target di settore. La gestione dei costi diretti è solida, ma è consigliabile monitorare i subappalti e i materiali per non scendere sotto la soglia del 10%, che rappresenta il limite di sostenibilità operativa.`;
  if (f === 'attenzione') return `Il Primo Margine del ${vf}% è al di sotto del target ottimale. I costi diretti di cantiere (manodopera, materiali, subappalti) stanno erodendo la marginalità. Si raccomanda una revisione dei costi di approvvigionamento e una verifica della competitività delle tariffe applicate.`;
  return `Il Primo Margine del ${vf}% è in zona critica. La struttura dei costi diretti supera il 95% del fatturato, rendendo impossibile la copertura dei costi fissi. È urgente una revisione radicale del pricing e/o una rinegoziazione con i subappaltatori principali.`;
};

const commentoEbitda = (v: number, f: Fascia): string => {
  const vf = (v * 100).toFixed(1);
  if (f === 'ottimo') return `L'EBITDA del ${vf}% certifica un'ottima capacità operativa dell'azienda. Dopo aver coperto tutti i costi fissi (struttura e studio), l'impresa genera un margine operativo lordo solido, base indispensabile per finanziare ammortamenti, oneri finanziari e investimenti futuri.`;
  if (f === 'buono') return `L'EBITDA del ${vf}% è sostenibile e in linea con il settore edilizio. La struttura operativa è efficiente, ma vi è margine di miglioramento nel contenimento dei costi fissi di struttura. Si raccomanda di monitorare trimestralmente l'andamento per evitare scivolamenti verso la fascia di attenzione.`;
  if (f === 'attenzione') return `L'EBITDA del ${vf}% segnala una tensione tra marginalità lorda e costi fissi di struttura. La capacità di generare cassa operativa è ridotta. Si consiglia una revisione delle spese generali non strategiche (affitti, utenze, consulenze) e un'accelerazione della fatturazione.`;
  return `L'EBITDA del ${vf}% è insufficiente a coprire gli ammortamenti e gli oneri finanziari, generando un risultato ante imposte negativo. È necessario intervenire con urgenza su entrambi i lati del conto economico: incremento dei ricavi e taglio strutturale dei costi fissi.`;
};

const commentoUtile = (v: number, f: Fascia): string => {
  const vf = (v * 100).toFixed(1);
  if (f === 'ottimo') return `L'Utile Netto del ${vf}% è un risultato eccellente per il settore. L'azienda crea valore in modo consistente, con una redditività che consente sia la remunerazione dei soci che il reinvestimento per la crescita aziendale.`;
  if (f === 'buono') return `L'Utile Netto del ${vf}% è positivo e in linea con le aspettative del settore edilizio. La remunerazione del capitale investito è soddisfacente. Ottimizzare la gestione fiscale e ridurre gli oneri finanziari potrebbe portare questo indice in fascia ottima.`;
  if (f === 'attenzione') return `L'Utile Netto del ${vf}% è modesto rispetto al rischio d'impresa sostenuto. La marginalità residua è fragile: eventuali ritardi nei pagamenti, contenziosi o cali di fatturato potrebbero portare in perdita. Si raccomanda un confronto con il commercialista per ottimizzare il carico fiscale.`;
  return `L'Utile Netto del ${vf}% è insufficiente. Il rischio d'impresa non è adeguatamente remunerato. È necessario rivedere la struttura di costo complessiva, valutare una ristrutturazione del debito finanziario e verificare la congruità del piano di investimenti.`;
};

const commentoIncidenzaStudio = (v: number, f: Fascia): string => {
  const vf = (v * 100).toFixed(1);
  if (f === 'ottimo') return `L'incidenza dello studio del ${vf}% sul fatturato è contenuta ed efficiente. Il personale tecnico e amministrativo è calibrato correttamente rispetto al volume d'affari. Questa struttura agile consente elevata flessibilità operativa.`;
  if (f === 'buono') return `L'incidenza dello studio del ${vf}% è nella norma per un'impresa edile strutturata. Il rapporto tra personale tecnico/amministrativo e fatturato è sostenibile, ma è opportuno monitorarlo al crescere del volume d'affari per evitare inefficienze.`;
  if (f === 'attenzione') return `L'incidenza dello studio del ${vf}% è elevata rispetto al fatturato attuale. Il personale di struttura pesa significativamente sui margini. Occorre valutare se il volume d'affari pianificato è sufficiente a giustificare questa struttura, oppure se sono necessari interventi di ottimizzazione.`;
  return `L'incidenza dello studio del ${vf}% è eccessiva e rappresenta un rischio strutturale. I costi del personale di studio assorbono una quota insostenibile del fatturato. Sono necessarie azioni immediate: riorganizzazione interna, riduzione delle ore non produttive o incremento significativo del fatturato.`;
};

const commentoIncidenzaFissi = (v: number, f: Fascia): string => {
  const vf = (v * 100).toFixed(1);
  if (f === 'ottimo') return `I costi fissi di struttura (${vf}% del fatturato) sono contenuti e ottimali. L'azienda ha una base di costi fissi snella che garantisce flessibilità e resilienza anche in caso di flessioni del mercato.`;
  if (f === 'buono') return `I costi fissi di struttura incidono per il ${vf}% sul fatturato, un livello sostenibile. La struttura operativa è dimensionata correttamente, anche se esiste margine per ottimizzare alcune voci (es. canoni di locazione, utenze, software).`;
  if (f === 'attenzione') return `I costi fissi di struttura al ${vf}% del fatturato sono elevati. In caso di rallentamento del mercato o di ritardi nella fatturazione, questa incidenza può rapidamente trasformarsi in una perdita operativa. Si consiglia una revisione analitica delle singole voci di costo fisso.`;
  return `I costi fissi al ${vf}% del fatturato sono insostenibili nel lungo periodo. La struttura aziendale è sovradimensionata rispetto al volume d'affari. È necessario avviare un piano di ristrutturazione dei costi, con priorità ai contratti di locazione, alle utenze e alle consulenze ricorrenti.`;
};

const commentoCompenso = (compenso: number, utile: number, f: Fascia): string => {
  const ratio = utile > 0 ? (compenso / utile * 100).toFixed(1) : 'N/D';
  if (f === 'ottimo') return `Il compenso soci (${formatEuro(compenso)}) rappresenta il ${ratio}% dell'utile netto, un livello ottimale. La remunerazione della proprietà è calibrata per lasciare risorse sufficienti per il reinvestimento e la crescita aziendale.`;
  if (f === 'buono') return `Il compenso soci (${formatEuro(compenso)}) assorbe il ${ratio}% dell'utile netto, un livello sostenibile. Si consiglia di verificare periodicamente che la crescita del compenso non superi proporzionalmente la crescita dell'utile.`;
  if (f === 'attenzione') return `Il compenso soci (${formatEuro(compenso)}) assorbe il ${ratio}% dell'utile netto, un livello che lascia poche risorse per il reinvestimento. Si raccomanda di allineare la remunerazione dei soci all'effettiva capacità di generare cassa, specialmente nei periodi di bassa liquidità.`;
  return `Il compenso soci (${formatEuro(compenso)}) assorbe il ${ratio}% dell'utile netto, rendendo di fatto azzerata la capacità di autofinanziamento. È urgente riconsiderare i prelievi della proprietà in funzione della reale redditività aziendale.`;
};

// ─── Layout helpers ───────────────────────────────────────────────────────────
const addHeader = (doc: jsPDF, title: string, anno: number) => {
  const pw = doc.internal.pageSize.width;
  doc.setFillColor(...C.nero);
  doc.rect(0, 0, pw, 38, 'F');
  // Accent bar
  doc.setFillColor(...C.emerald);
  doc.rect(0, 38, pw, 2, 'F');

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GRUPPO VISENTIN S.R.L.', 15, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 15, 27);

  doc.setFontSize(9);
  doc.text(`Anno ${anno}`, pw - 15, 16, { align: 'right' });
  doc.text(`Report del ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}`, pw - 15, 27, { align: 'right' });
};

const addFooter = (doc: jsPDF) => {
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;
  const pages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...C.slate200);
    doc.line(15, ph - 18, pw - 15, ph - 18);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.slate600);
    doc.text('GRUPPO VISENTIN S.R.L.', 15, ph - 11);
    doc.setFont('helvetica', 'normal');
    doc.text('Analisi & Indici di Struttura — Documento Riservato ad Uso Interno', pw / 2, ph - 11, { align: 'center' });
    doc.text(`Pag. ${i} / ${pages}`, pw - 15, ph - 11, { align: 'right' });
  }
};

const sectionTitle = (doc: jsPDF, text: string, y: number): number => {
  const pw = doc.internal.pageSize.width;
  doc.setFillColor(...C.slate50);
  doc.setDrawColor(...C.slate200);
  doc.roundedRect(15, y - 5, pw - 30, 12, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.nero);
  doc.text(text.toUpperCase(), 20, y + 3);
  return y + 14;
};

const narrativeBlock = (doc: jsPDF, text: string, y: number, maxW: number): number => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...C.slate600);
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, 15, y);
  return y + lines.length * 5 + 3;
};

const kpiRow = (
  doc: jsPDF,
  label: string,
  consuntivo: string,
  previsionale: string,
  fascia: Fascia,
  y: number,
  pw: number
): number => {
  const rowH = 10;
  const col1 = 15, col2 = 85, col3 = 130, col4 = 165;
  const w1 = 65, w2 = 40, w3 = 30, w4 = pw - col4 - 15;

  // Fascia badge bg
  doc.setFillColor(...fasciaLtColor(fascia));
  doc.rect(col4, y - 7, w4, rowH, 'F');
  doc.setFillColor(...C.white);
  doc.rect(col1, y - 7, w1 + w2 + w3, rowH, 'F');
  doc.setDrawColor(...C.slate200);
  doc.line(col1, y + 3, pw - 15, y + 3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.nero);
  doc.text(label, col1 + 2, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.nero);
  doc.text(consuntivo, col2 + w2 / 2, y, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.slate600);
  doc.text(previsionale, col3 + w3 / 2, y, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...fasciaColor(fascia));
  doc.text(fasciaLabel(fascia), col4 + w4 / 2, y, { align: 'center' });

  return y + rowH;
};

const kpiTableHeader = (doc: jsPDF, y: number, pw: number): number => {
  const col1 = 15, col2 = 85, col3 = 130, col4 = 165;
  const w2 = 40, w3 = 30, w4 = pw - col4 - 15;

  doc.setFillColor(...C.slate700);
  doc.rect(col1, y - 6, pw - 30, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.white);
  doc.text('INDICATORE', col1 + 2, y - 0.5);
  doc.text('CONSUNTIVO YTD', col2 + w2 / 2, y - 0.5, { align: 'center' });
  doc.text('PREVISIONALE', col3 + w3 / 2, y - 0.5, { align: 'center' });
  doc.text('VALUTAZIONE', col4 + w4 / 2, y - 0.5, { align: 'center' });
  return y + 7;
};

const commentBox = (doc: jsPDF, fascia: Fascia, label: string, commento: string, y: number, pw: number): number => {
  const col = fasciaColor(fascia);
  const colLt = fasciaLtColor(fascia);
  const boxW = pw - 30;
  const lines = doc.splitTextToSize(commento, boxW - 22);
  const boxH = lines.length * 4.5 + 14;

  doc.setFillColor(...colLt);
  doc.setDrawColor(...col);
  doc.roundedRect(15, y, boxW, boxH, 2, 2, 'FD');

  // Left accent bar
  doc.setFillColor(...col);
  doc.rect(15, y, 3, boxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...col);
  doc.text(label, 22, y + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...C.slate700);
  doc.text(lines, 22, y + 13);

  return y + boxH + 5;
};

// ─── Main export ──────────────────────────────────────────────────────────────
export const exportAnalisiPDF = (data: AnalisiPdfData) => {
  const { anno, rates, metrics, resCantiere, resImmobiliare, resOrario, previsioneFiscale, vistaPrevFiscale } = data;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pw = doc.internal.pageSize.width;
  const ph = doc.internal.pageSize.height;

  // Pre-compute fasce
  const fPrimoMargine = fasciaPrimoMargine(metrics.primoMarginePercent);
  const fEbitda       = fasciaEbitda(metrics.ebitdaPercent);
  const fUtile        = fasciaUtileNetto(metrics.utileNettoPercent);
  const fStudio       = fasciaIncidenzaStudio(rates.incidenzaStudioFatturato);
  const fFissi        = fasciaIncidenzaFissi(rates.incidenzaFissiFatturato);
  const fBep          = fasciaBep(metrics.fatturato, metrics.breakEven);
  const fCompenso     = fasciaCompenso(rates.compensoSoci, metrics.utileNettoTot);

  const hasData = metrics.fatturato > 0;

  // ── COPERTINA ──────────────────────────────────────────────────────────────
  // Dark cover
  doc.setFillColor(...C.nero);
  doc.rect(0, 0, pw, ph, 'F');

  // Accent stripe
  doc.setFillColor(...C.emerald);
  doc.rect(0, ph / 2 - 2, pw, 4, 'F');

  // Logo area
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...C.white);
  doc.text('GRUPPO VISENTIN', pw / 2, 70, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.slate400);
  doc.text('S.R.L. — Impresa Edile', pw / 2, 82, { align: 'center' });

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.emerald);
  doc.text('ANALISI & INDICI DI STRUTTURA', pw / 2, 115, { align: 'center' });

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.white);
  doc.text(`Report Annuale — Esercizio ${anno}`, pw / 2, 128, { align: 'center' });

  // Summary box on cover
  const bx = 25, by = 155, bw = pw - 50, bh = 50;
  doc.setFillColor(255, 255, 255, 10);
  doc.setDrawColor(255, 255, 255, 30);
  doc.roundedRect(bx, by, bw, bh, 4, 4, 'D');

  const summaryItems = [
    { label: 'Fatturato YTD',    value: hasData ? formatEuro(metrics.fatturato) : 'N/D' },
    { label: 'EBITDA %',         value: hasData ? formatPercent(metrics.ebitdaPercent) : 'N/D' },
    { label: 'Utile Netto %',    value: hasData ? formatPercent(metrics.utileNettoPercent) : 'N/D' },
    { label: 'Punto di Pareggio', value: hasData ? formatEuro(metrics.breakEven) : 'N/D' },
  ];
  summaryItems.forEach((item, i) => {
    const x = bx + 10 + i * (bw / 4);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.slate400);
    doc.text(item.label.toUpperCase(), x, by + 14);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.white);
    doc.text(item.value, x, by + 25);
  });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...C.slate400);
  doc.text(
    `Documento riservato ad uso interno — Generato il ${new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    pw / 2, ph - 20, { align: 'center' }
  );

  // ── PAG. 2: EXECUTIVE SUMMARY ──────────────────────────────────────────────
  doc.addPage();
  addHeader(doc, 'EXECUTIVE SUMMARY — QUADRO ECONOMICO', anno);
  let y = 50;

  y = sectionTitle(doc, '1. Sintesi della Situazione Economica', y);

  // Determine overall health narrative
  const positivi  = [fPrimoMargine, fEbitda, fUtile, fBep].filter(f => f === 'ottimo' || f === 'buono').length;
  const critici   = [fPrimoMargine, fEbitda, fUtile, fBep].filter(f => f === 'critico').length;
  let overallText = '';
  if (!hasData) {
    overallText = `Non sono presenti transazioni consuntive per l'anno ${anno}. Il report riporta i soli dati previsionali disponibili. Si raccomanda di caricare i dati contabili dell'anno corrente per abilitare l'analisi completa.`;
  } else if (critici >= 2) {
    overallText = `L'analisi del conto economico per l'esercizio ${anno} evidenzia una situazione di criticità su più fronti. Con ${critici} indicatori principali in zona critica, l'azienda si trova in una fase che richiede interventi correttivi tempestivi e strutturati. La priorità deve essere il recupero della marginalità operativa attraverso un'azione combinata su ricavi e contenimento dei costi.`;
  } else if (positivi >= 3) {
    overallText = `L'andamento economico dell'esercizio ${anno} è complessivamente positivo. La maggior parte degli indicatori chiave si posiziona in fascia ottima o buona, confermando la solidità della struttura aziendale e l'efficacia della gestione operativa. L'attenzione deve rimanere alta per consolidare i risultati e prevenire scivolamenti nelle fasce di attenzione.`;
  } else {
    overallText = `L'andamento economico dell'esercizio ${anno} mostra un quadro misto, con alcuni indicatori positivi e altri che richiedono monitoraggio. La gestione operativa è sostenibile ma non ancora ottimale: esistono margini di miglioramento significativi, in particolare nella struttura dei costi fissi e nell'ottimizzazione della marginalità.`;
  }
  y = narrativeBlock(doc, overallText, y, pw - 30);
  y += 4;

  // KPI summary table with fasce
  y = sectionTitle(doc, '2. Quadro Riepilogativo degli Indici Chiave', y);

  const oneriFatturato = rates.fatturato > 0 ? rates.totaleOneriFin / rates.fatturato : 0;

  y = kpiTableHeader(doc, y, pw);
  if (hasData) {
    y = kpiRow(doc, '1. Fatturato YTD',        formatEuro(metrics.fatturato),                formatEuro(rates.fatturatoPrev || 0),         fBep,          y, pw);
    y = kpiRow(doc, '2. Primo Margine %',       formatPercent(metrics.primoMarginePercent),   formatPercent(rates.primoMarginePercent || 0 ), fPrimoMargine, y, pw);
    y = kpiRow(doc, '3. EBITDA %',              formatPercent(metrics.ebitdaPercent),         formatPercent(0),                             fEbitda,       y, pw);
    y = kpiRow(doc, '4. Utile Netto %',         formatPercent(metrics.utileNettoPercent),     formatPercent(0),                             fUtile,        y, pw);
    y = kpiRow(doc, '5. Punto di Pareggio',     formatEuro(metrics.breakEven),                formatEuro(0),                                fBep,          y, pw);
    y = kpiRow(doc, '6. Incidenza Studio %',    formatPercent(rates.incidenzaStudioFatturato), formatPercent(rates.incidenzaStudioFatturatoPrev || 0), fStudio, y, pw);
    y = kpiRow(doc, '7. Incidenza Fissi %',     formatPercent(rates.incidenzaFissiFatturato), formatPercent(rates.incidenzaFissiFatturatoPrev || 0), fFissi, y, pw);
    y = kpiRow(doc, '8. Compenso Soci',         formatEuro(rates.compensoSoci),               formatEuro(0),                                fCompenso,     y, pw);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...C.slate400);
    doc.text('Nessun dato consuntivo disponibile per l\'anno selezionato.', 20, y + 5);
    y += 15;
  }
  y += 6;

  // Overhead rates summary
  if (y > ph - 60) { doc.addPage(); addHeader(doc, 'EXECUTIVE SUMMARY (segue)', anno); y = 50; }
  y = sectionTitle(doc, '3. Tassi di Overhead per i Preventivi', y);
  const narrativaOverhead = `I tassi di overhead rappresentano la percentuale che ogni euro di costo diretto deve coprire per i costi fissi di struttura. Il tasso overhead totale consuntivo è ${formatPercent(rates.overheadRateCompleto)} (previsionale: ${formatPercent(rates.overheadRateCompletoPrev || 0)}), da applicare sistematicamente in ogni preventivo di cantiere e immobiliare per garantire la copertura della struttura aziendale e la generazione di utile.`;
  y = narrativeBlock(doc, narrativaOverhead, y, pw - 30);

  autoTable(doc, {
    startY: y,
    head: [['Tasso Overhead', 'Consuntivo', 'Previsionale', 'Interpretazione']],
    body: [
      ['Overhead Rate Studio', formatPercent(rates.overheadRateStudio), formatPercent(rates.overheadRateStudioPrev || 0), 'Costo studio su ogni € di costi diretti'],
      ['Overhead Rate Struttura Fissa', formatPercent(rates.overheadRateFissi), formatPercent(rates.overheadRateFissiPrev || 0), 'Costi fissi operativi su costi diretti'],
      ['Overhead Rate Totale ★', formatPercent(rates.overheadRateCompleto), formatPercent(rates.overheadRateCompletoPrev || 0), 'DA USARE IN TUTTI I PREVENTIVI'],
    ],
    theme: 'grid',
    headStyles: { fillColor: C.slate700, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 8.5, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 55 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 30 },
      2: { halign: 'center', cellWidth: 30 },
      3: { fontSize: 7.5, textColor: C.slate600 as [number,number,number] },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 2) {
        data.cell.styles.fillColor = C.slate50;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Oneri finanziari note
  if (rates.totaleOneriFin > 0) {
    const noteOneri = `Gli oneri finanziari ammontano a ${formatEuro(rates.totaleOneriFin)} (${formatPercent(oneriFatturato)} del fatturato). Questo costo riduce direttamente l'utile netto e va considerato nelle proiezioni di redditività. Si consiglia di valutare periodicamente le condizioni dei finanziamenti in essere per ottimizzare il costo del debito.`;
    y = narrativeBlock(doc, '⚠ Oneri Finanziari: ' + noteOneri, y, pw - 30);
  }

  // ── PAG. 3: ANALISI DETTAGLIATA KPI ───────────────────────────────────────
  doc.addPage();
  addHeader(doc, 'ANALISI DETTAGLIATA — I 7+1 NUMERI SACRI', anno);
  y = 50;

  y = sectionTitle(doc, 'Analisi Approfondita dei KPI di Performance', y);

  const narrativaIntro = `I "7+1 Numeri Sacri" sono gli indicatori fondamentali del controllo di gestione di Gruppo Visentin. Ciascuno misura un aspetto critico della salute economica e finanziaria dell'azienda. La valutazione è condotta confrontando il dato consuntivo YTD (anno in corso) con le soglie di settore e con il budget previsionale. Per ogni indicatore viene fornita un'analisi qualitativa e, dove necessario, un'indicazione operativa.`;
  y = narrativeBlock(doc, narrativaIntro, y, pw - 30);
  y += 3;

  if (hasData) {
    // KPI 1 — Fatturato
    if (y > ph - 80) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 1 — Fatturato YTD', y);
    const mesiTr = rates.mesiTrascorsi || 12;
    const proiezioneFatt = metrics.fatturato * (12 / mesiTr);
    const narratFatt = `Il fatturato consuntivo YTD ammonta a ${formatEuro(metrics.fatturato)}, rilevato su ${mesiTr} ${mesiTr === 1 ? 'mese' : 'mesi'} di attività. La proiezione lineare a 12 mesi stima un fatturato annuo di ${formatEuro(proiezioneFatt)}. ${metrics.fatturato >= metrics.breakEven ? `Il fatturato supera già il punto di pareggio (${formatEuro(metrics.breakEven)}), confermando la sostenibilità operativa dell'esercizio.` : `Il fatturato si trova ancora al di sotto del punto di pareggio (${formatEuro(metrics.breakEven)}): mancano ${formatEuro(metrics.breakEven - metrics.fatturato)} per raggiungere il break-even contabile.`}`;
    y = narrativeBlock(doc, narratFatt, y, pw - 30);

    autoTable(doc, {
      startY: y,
      body: [
        ['Fatturato Consuntivo YTD', formatEuro(metrics.fatturato)],
        [`Proiezione Lineare 12 mesi (su ${mesiTr} mesi rilevati)`, formatEuro(proiezioneFatt)],
        ['Punto di Pareggio (Contabile)', formatEuro(metrics.breakEven)],
        ['Punto di Pareggio (Cassa)', formatEuro(metrics.breakEvenCassa)],
        ['Scostamento dal BEP Contabile', metrics.fatturato >= metrics.breakEven ? `+${formatEuro(metrics.fatturato - metrics.breakEven)} (RAGGIUNTO)` : `-${formatEuro(metrics.breakEven - metrics.fatturato)} (da colmare)`],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110, fillColor: C.slate50 as [number,number,number] },
        1: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fBep, `Valutazione Punto di Pareggio: ${fasciaLabel(fBep)}`,
      metrics.fatturato >= metrics.breakEven
        ? `Il fatturato YTD supera il punto di pareggio. L'azienda opera in territorio di utile. Occorre ora massimizzare la marginalità delle commesse rimanenti e accelerare la fatturazione dei SAL in pipeline.`
        : `Il fatturato non ha ancora raggiunto il punto di pareggio. Ogni euro di ricavo aggiuntivo ha un'importanza critica. Si raccomanda di prioritizzare la chiusura dei contratti più redditizi e di accelerare la fatturazione delle commesse in corso.`,
      y, pw);

    // KPI 2 — Primo Margine
    if (y > ph - 80) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 2 — Primo Margine (Margine Lordo sui Costi Diretti)', y);
    y = narrativeBlock(doc, commentoPrimoMargine(metrics.primoMarginePercent, fPrimoMargine), y, pw - 30);
    autoTable(doc, {
      startY: y,
      body: [
        ['Fatturato',            formatEuro(metrics.fatturato)],
        ['(-) Costi Variabili / Diretti', formatEuro(metrics.fatturato - metrics.primoMargineTot)],
        ['= Primo Margine (€)', formatEuro(metrics.primoMargineTot)],
        ['Primo Margine (%)',    formatPercent(metrics.primoMarginePercent)],
        ['Soglia Ottima',       '≥ 15%'],
        ['Soglia Minima',       '≥ 10% (sotto = critico)'],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110, fillColor: C.slate50 as [number,number,number] },
        1: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fPrimoMargine, `Valutazione Primo Margine: ${fasciaLabel(fPrimoMargine)}`,
      fPrimoMargine === 'ottimo' || fPrimoMargine === 'buono'
        ? `La marginalità sui costi diretti è solida. Mantenere la disciplina nei capitolati e nei contratti di subappalto per preservare questo livello nel corso dell'anno.`
        : `La bassa marginalità sui costi diretti è il segnale più preoccupante: occorre rivedere immediatamente la struttura dei costi di cantiere (manodopera, materiali, noli) e verificare la congruità del pricing.`,
      y, pw);

    // KPI 3 — EBITDA
    if (y > ph - 90) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 3 — EBITDA % (Margine Operativo Lordo)', y);
    y = narrativeBlock(doc, commentoEbitda(metrics.ebitdaPercent, fEbitda), y, pw - 30);
    autoTable(doc, {
      startY: y,
      body: [
        ['Primo Margine (€)',         formatEuro(metrics.primoMargineTot)],
        ['(-) Costi Fissi di Struttura', formatEuro(rates.totaleOverheadCompleto || 0)],
        ['= EBITDA (€)',              formatEuro(metrics.ebitdaTot)],
        ['EBITDA (%)',                formatPercent(metrics.ebitdaPercent)],
        ['Soglia Ottima',            '≥ 10%'],
        ['Soglia Minima',            '≥ 7% (sotto = attenzione)'],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110, fillColor: C.slate50 as [number,number,number] },
        1: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fEbitda, `Valutazione EBITDA: ${fasciaLabel(fEbitda)}`,
      commentoEbitda(metrics.ebitdaPercent, fEbitda), y, pw);

    // KPI 4 — Utile Netto
    if (y > ph - 90) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 4 — Utile Netto % (Redditività Finale)', y);
    y = narrativeBlock(doc, commentoUtile(metrics.utileNettoPercent, fUtile), y, pw - 30);
    autoTable(doc, {
      startY: y,
      body: [
        ['EBITDA (€)',                formatEuro(metrics.ebitdaTot)],
        ['(-) Ammortamenti',          formatEuro(metrics.ebitdaTot - metrics.ebitTot)],
        ['(-) Oneri Finanziari Netti', formatEuro(rates.totaleOneriFin || 0)],
        ['= Utile Netto (€)',         formatEuro(metrics.utileNettoTot)],
        ['Utile Netto (%)',           formatPercent(metrics.utileNettoPercent)],
        ['Soglia Ottima',            '≥ 6%'],
        ['Soglia Minima',            '≥ 4% (sotto = attenzione)'],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110, fillColor: C.slate50 as [number,number,number] },
        1: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fUtile, `Valutazione Utile Netto: ${fasciaLabel(fUtile)}`,
      commentoUtile(metrics.utileNettoPercent, fUtile), y, pw);

    // KPI 6 & 7 — Incidenze
    if (y > ph - 90) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 6 & 7 — Incidenza Studio e Struttura Fissa', y);
    y = narrativeBlock(doc, commentoIncidenzaStudio(rates.incidenzaStudioFatturato, fStudio), y, pw - 30);
    y += 2;
    y = narrativeBlock(doc, commentoIncidenzaFissi(rates.incidenzaFissiFatturato || 0, fFissi), y, pw - 30);

    autoTable(doc, {
      startY: y,
      head: [['Voce', 'Importo (€)', 'Incidenza %', 'Soglia Ottima', 'Valutazione']],
      body: [
        ['Costi Studio (Personale Ufficio/Tecnici)', formatEuro(rates.totaleCostiStudio), formatPercent(rates.incidenzaStudioFatturato), '≤ 15%', fasciaLabel(fStudio)],
        ['Costi Struttura Fissa (Affitti, Utenze…)', formatEuro(rates.totaleOverheadPuro || 0), formatPercent(rates.incidenzaFissiFatturato || 0), '≤ 8%', fasciaLabel(fFissi)],
        ['Overhead Totale', formatEuro(rates.totaleOverheadCompleto), formatPercent(rates.incidenzaCompletaFatturato), '≤ 23%', ''],
      ],
      theme: 'grid',
      headStyles: { fillColor: C.slate700, textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'center', fontStyle: 'bold' },
        3: { halign: 'center', fontSize: 7.5, textColor: C.slate600 as [number,number,number] },
        4: { halign: 'center', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fStudio, `Valutazione Incidenza Studio: ${fasciaLabel(fStudio)}`,
      commentoIncidenzaStudio(rates.incidenzaStudioFatturato, fStudio), y, pw);
    y = commentBox(doc, fFissi, `Valutazione Costi Fissi: ${fasciaLabel(fFissi)}`,
      commentoIncidenzaFissi(rates.incidenzaFissiFatturato || 0, fFissi), y, pw);

    // KPI 8 — Compenso Soci
    if (y > ph - 80) { doc.addPage(); addHeader(doc, 'ANALISI KPI (segue)', anno); y = 50; }
    y = sectionTitle(doc, 'KPI 8 — Compenso Soci (Remunerazione della Proprietà)', y);
    y = narrativeBlock(doc, commentoCompenso(rates.compensoSoci, metrics.utileNettoTot, fCompenso), y, pw - 30);
    autoTable(doc, {
      startY: y,
      body: [
        ['Compenso Soci (Costo Studio)',  formatEuro(rates.compensoSoci)],
        ['Utile Netto Totale',            formatEuro(metrics.utileNettoTot)],
        ['Incidenza Compenso su Utile',   metrics.utileNettoTot > 0 ? formatPercent(rates.compensoSoci / metrics.utileNettoTot) : 'N/D (utile negativo)'],
        ['Soglia Ottima',                '≤ 30% dell\'utile netto'],
        ['Soglia di Attenzione',         '> 50% — rischio autofinanziamento'],
      ],
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 110, fillColor: C.slate50 as [number,number,number] },
        1: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    y = commentBox(doc, fCompenso, `Valutazione Compenso Soci: ${fasciaLabel(fCompenso)}`,
      commentoCompenso(rates.compensoSoci, metrics.utileNettoTot, fCompenso), y, pw);
  } else {
    y = narrativeBlock(doc, 'Nessun dato consuntivo disponibile per l\'anno selezionato. Caricare le transazioni per abilitare l\'analisi dei 7+1 Numeri Sacri.', y, pw - 30);
  }

  // ── PAG. N: CALCOLATORI PREVENTIVO ────────────────────────────────────────
  doc.addPage();
  addHeader(doc, 'CALCOLATORI PREVENTIVI', anno);
  y = 50;

  y = sectionTitle(doc, '4. Calcolatore Preventivo Cantiere', y);
  const narrativaCantiere = `Il calcolatore cantiere applica il tasso di overhead totale (${formatPercent(rates.overheadRateCompleto)}) ai costi diretti inseriti, determinando il prezzo minimo da offrire al cliente per garantire la copertura di tutti i costi fissi e il margine di utile target. Questo valore è il prezzo floor al di sotto del quale l'offerta genera una perdita strutturale.`;
  y = narrativeBlock(doc, narrativaCantiere, y, pw - 30);

  autoTable(doc, {
    startY: y,
    head: [['Componente di Costo / Prezzo', 'Importo (€)']],
    body: [
      ['Costi Diretti Inseriti', formatEuro(resCantiere.costoDiretto || 0)],
      ['(+) Quota Overhead Studio', formatEuro(resCantiere.quotaStudio || 0)],
      ['(+) Quota Overhead Struttura Fissa', formatEuro(resCantiere.quotaFissi || 0)],
      ['= Totale Costi Coperti', formatEuro((resCantiere.costoDiretto || 0) + (resCantiere.quotaStudio || 0) + (resCantiere.quotaFissi || 0))],
      ['(+) Margine di Utile Target', `${resCantiere.margineTarget ? (resCantiere.margineTarget * 100).toFixed(1) : 0}% → ${formatEuro(resCantiere.quotaMargine || 0)}`],
      ['★ PREZZO MINIMO DA OFFRIRE', formatEuro(resCantiere.prezzoMinimo || 0)],
      ['Coefficiente di Ricarico', `${(resCantiere.coefficienteRicarico || 0).toFixed(3)}x sui costi diretti`],
    ],
    theme: 'grid',
    headStyles: { fillColor: C.slate700, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 110 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 5) {
        data.cell.styles.fillColor = C.nero;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  y = sectionTitle(doc, '5. Calcolatore Preventivo Immobiliare', y);
  const narrativaImm = `Il calcolatore immobiliare valuta la sostenibilità economica di un'operazione di sviluppo immobiliare, incorporando il costo del terreno, i costi di costruzione e i correlati (progettazione, oneri, commercializzazione), oltre all'overhead di struttura. Il prezzo di vendita minimo garantisce il recupero di tutti i costi e il margine target sull'operazione.`;
  y = narrativeBlock(doc, narrativaImm, y, pw - 30);

  autoTable(doc, {
    startY: y,
    head: [['Voce Operazione Immobiliare', 'Importo (€)']],
    body: [
      ['Costo Acquisizione Terreno', formatEuro(resImmobiliare.costoTerreno || 0)],
      ['Costi di Costruzione', formatEuro(resImmobiliare.costoCostruzione || 0)],
      ['Costi Correlati (Oneri, Progett., Comm.)', formatEuro(resImmobiliare.costiCorrelati || 0)],
      ['(+) Overhead di Struttura', formatEuro(resImmobiliare.quotaOverhead || 0)],
      ['= Totale Costi Operazione', formatEuro(resImmobiliare.totaleCostiOperazione || 0)],
      ['(+) Margine Target Operazione', formatEuro(resImmobiliare.margineEuro || 0)],
      ['★ PREZZO DI VENDITA MINIMO', formatEuro(resImmobiliare.prezzoVenditaMinimo || 0)],
      ['ROI Operazione', formatPercent(resImmobiliare.roiOperazione || 0)],
    ],
    theme: 'grid',
    headStyles: { fillColor: C.slate700, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 110 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 6) {
        data.cell.styles.fillColor = C.nero;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // ── PAG. N+1: PREVISIONE FISCALE ──────────────────────────────────────────
  if (y > ph - 100) { doc.addPage(); addHeader(doc, 'PREVISIONE FISCALE', anno); y = 50; }
  else {
    const tipoVista = vistaPrevFiscale ? 'Previsionale Forecast' : 'Consuntivo YTD';
    y = sectionTitle(doc, `6. Previsione Fiscale Stimata (${tipoVista})`, y);
  }

  const narrativaFiscale = vistaPrevFiscale
    ? `La previsione fiscale è calcolata includendo sia il consuntivo YTD che le proiezioni/forecast per l'esercizio ${anno}. Fornisce una stima dell'onere fiscale complessivo prospettico. La base imponibile IRES è determinata sull'EBIT proiettato al netto delle variazioni di rimanenze stimabili; la base IRAP sul valore della produzione prospettico al netto dei costi deducibili stimati. I valori sono stime semplificate a scopo di pianificazione finanziaria.`
    : `La previsione fiscale è calcolata sul risultato consuntivo YTD e fornisce una stima dell'onere fiscale complessivo per l'esercizio ${anno}. La base imponibile IRES è determinata sull'EBIT al netto delle variazioni di rimanenze; la base IRAP sul valore della produzione al netto dei costi deducibili. I valori sono stime semplificate che non sostituiscono l'elaborazione del commercialista, ma consentono una pianificazione della liquidità per le scadenze fiscali.`;
  y = narrativeBlock(doc, narrativaFiscale, y, pw - 30);

  autoTable(doc, {
    startY: y,
    head: [['Voce Fiscale', 'IRES (24%)', 'IRAP (3,9%)']],
    body: [
      ['Base Imponibile', formatEuro(previsioneFiscale.baseImponibileIRES), formatEuro(previsioneFiscale.baseImponibileIRAP)],
      ['Imposta Stimata', formatEuro(previsioneFiscale.iresStimata), formatEuro(previsioneFiscale.irapStimata)],
      ['Acconto Giugno (40%)', formatEuro(previsioneFiscale.iresStimata * 0.4), formatEuro(previsioneFiscale.irapStimata * 0.4)],
      ['Acconto Novembre (60%)', formatEuro(previsioneFiscale.iresStimata * 0.6), formatEuro(previsioneFiscale.irapStimata * 0.6)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42] as [number,number,number], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: C.slate50 as [number,number,number] },
      1: { halign: 'right', fontStyle: 'bold' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: y,
    body: [
      ['TOTALE IMPOSTE STIMATE (IRES + IRAP)', formatEuro(previsioneFiscale.totaleImposteStimate)],
      ['F24 già versati nell\'anno', formatEuro(previsioneFiscale.impostePagate)],
      [previsioneFiscale.residuoDaVersare > 0 ? 'Residuo da Versare' : 'Credito / In Linea', formatEuro(previsioneFiscale.residuoDaVersare)],
      ['★ Utile Netto Stimato Dopo Imposte', formatEuro(previsioneFiscale.utileDopoImposte)],
    ],
    theme: 'grid',
    styles: { fontSize: 9.5, cellPadding: 4.5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: C.slate50 as [number,number,number], cellWidth: 110 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      if (data.row.index === 3) {
        data.cell.styles.fillColor = C.nero;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...C.slate400);
  const disclaimer = 'Nota: I calcoli fiscali sono stime semplificate. Non includono: deduzioni ACE, perdite pregresse, variazioni permanenti/temporanee, deduzioni IRAP per contratti a tempo indeterminato (cuneo IRAP). Verificare sempre con il commercialista prima di qualsiasi versamento.';
  const dLines = doc.splitTextToSize(disclaimer, pw - 30);
  doc.text(dLines, 15, y);

  // ── PAGINA AUDIT STRATEGICO DEI COSTI (Aggiunta) ───────────────────────────
  doc.addPage();
  addHeader(doc, 'AUDIT STRATEGICO E CONGRUITÀ COSTI', anno);
  y = 50;

  y = sectionTitle(doc, '7. Audit di Congruità dei Costi (Benchmark Nord-Est)', y);
  
  const auditIntro = `L'audit analizza la sostenibilità delle macrocategorie di spesa rispetto alla taglia dell'azienda (PMI Edile con 5-15 collaboratori e fatturato di circa € 4.5M). I dati evidenziano un modello operativo flessibile ma esposto a rischi sul margine di contribuzione industriale.`;
  y = narrativeBlock(doc, auditIntro, y, pw - 30);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Macrocategoria', 'Incidenza GV (%)', 'Benchmark Settore', 'Valutazione e Azioni Raccomandate']],
    body: [
      ['Costi Variabili (Diretti)', '80.11%', '25% - 30% (Margin)', '🔴 Sotto media. Alta dipendenza da subappalti e fluttuazioni prezzi.'],
      ['Incidenza Subappalti', '45.24%', '25% - 35%', '⚠️ Elevata. Terzializzazione spinta: riduce i fissi ma erode il margine.'],
      ['Personale Interno', '6.98%', '15% - 20%', '🟢 Ottima efficienza. Struttura molto leggera, basso rischio di inattività.'],
      ['Costi Studio / Soci', '8.46%', '8% - 12%', '🟢 Congruo. Compenso soci (4.3%) allineato con le prassi di mercato.'],
      ['Overhead Struttura Fissa', '2.42%', '6% - 10%', '🟢 Eccellente. Struttura snella che compensa la pressione del primo margine.'],
      ['Oneri Finanziari', '0.43%', '1.5% - 2.5%', '🟢 Ottimo. Basso indebitamento generativo ed eccellente gestione di cassa.'],
    ],
    theme: 'grid',
    headStyles: { fillColor: C.slate700, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    styles: { fontSize: 8, cellPadding: 3.5 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 25 },
      2: { halign: 'center', cellWidth: 30 },
      3: { fontSize: 7.5, textColor: C.slate600 as [number,number,number] },
    }
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  y = sectionTitle(doc, '8. Azioni Correttive Strategiche Suggerite', y);
  
  const azioniTesto = `1. TARGET PRICING ED ACQUISTI: Negoziare contratti quadro annuali con fornitori di materiali (ferro, cemento) per bloccare le tariffe. Nei contratti di subappalto, vincolare i fornitori a prezzi chiusi non revisionabili per proteggere la marginalità (attualmente all'80.11% di costi diretti).\n\n2. GESTIONE DEI SUBAPPALTI: Creare un albo di rating interno per monitorare ritardi e varianti che erodono il profitto residuo delle commesse.\n\n3. ALLINEAMENTO CASH FLOW: Sincronizzare le dilazioni di pagamento fornitori/subappalti (90 giorni d.f.) con i termini di incasso dei SAL attivi (60 giorni d.f.) per ottimizzare la tesoreria senza ricorrere ad anticipi bancari onerosi.\n\n4. EFFICIENZA BANCHE: Rinegoziare le commissioni fisse di massimo scoperto e i costi per il rilascio di fideiussioni e garanzie d'appalto.`;
  y = narrativeBlock(doc, azioniTesto, y, pw - 30);

  addFooter(doc);
  doc.save(`Analisi_Indici_GV_${anno}.pdf`);
};
