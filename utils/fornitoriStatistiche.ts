import { Fornitore, FornitoreMacroCategoria, StatisticheFornitorePuntaNet } from '../types';

// Calcoli puri per la scheda numeri fornitore e l'analisi spesa (tab Fornitori).
// Tutti gli importi sono in IMPONIBILE (fatture fornitore meno note di credito), come
// calcolati da scripts/importaFornitoriPuntaNet.mjs.

// Rate scadute da piu' di un anno e mai segnate pagate: quasi sempre pagate ma non chiuse
// in PuntaNet, quindi tenute separate e non sommate al "da pagare".
const GIORNI_SCADUTO_DA_VERIFICARE = 365;

const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function spesaAnno(stat: StatisticheFornitorePuntaNet | undefined, anno: number): number {
  return stat?.perAnno.find(r => r.anno === anno)?.imponibile ?? 0;
}

export interface RiepilogoFornitore {
  anno: number;
  spesaAnnoCorrente: number;
  spesaAnnoPrecedente: number;
  spesaTotale: number;
  fattureTotali: number;
  daPagare: number;           // rate con scadenza da oggi in poi
  scaduto: number;            // scadute nell'ultimo anno
  scadutoDaVerificare: number; // scadute da piu' di un anno
  prossimaScadenza?: { data: string; importo: number };
}

export function riepilogoFornitore(stat: StatisticheFornitorePuntaNet | undefined, oggiISO: string): RiepilogoFornitore {
  const anno = Number(oggiISO.slice(0, 4));
  const limiteVerifica = addDays(oggiISO, -GIORNI_SCADUTO_DA_VERIFICARE);
  const scadenze = stat?.scadenzeAperte ?? [];
  const future = scadenze.filter(s => s.data >= oggiISO);
  return {
    anno,
    spesaAnnoCorrente: spesaAnno(stat, anno),
    spesaAnnoPrecedente: spesaAnno(stat, anno - 1),
    spesaTotale: round2((stat?.perAnno ?? []).reduce((t, r) => t + r.imponibile, 0)),
    fattureTotali: (stat?.perAnno ?? []).reduce((t, r) => t + r.fatture, 0),
    daPagare: round2(future.reduce((t, s) => t + s.importo, 0)),
    scaduto: round2(scadenze.filter(s => s.data < oggiISO && s.data >= limiteVerifica).reduce((t, s) => t + s.importo, 0)),
    scadutoDaVerificare: round2(scadenze.filter(s => s.data < limiteVerifica).reduce((t, s) => t + s.importo, 0)),
    prossimaScadenza: future.find(s => s.importo > 0),
  };
}

export function anniDisponibili(fornitori: Fornitore[]): number[] {
  const anni = new Set<number>();
  fornitori.forEach(f => f.statistichePuntaNet?.perAnno.forEach(r => anni.add(r.anno)));
  return [...anni].sort((a, b) => b - a);
}

export interface AnalisiSpesa {
  anno: number;
  totale: number;
  fornitoriAttivi: number;
  quotaTop10: number; // 0..1
  classifica: { fornitore: Fornitore; imponibile: number; quota: number }[];
  perMacro: { macro: FornitoreMacroCategoria; imponibile: number; fornitori: number }[];
  scadenzeProssime: { fornitore: Fornitore; data: string; importo: number }[];
  daPagare30: number;
  daPagare60: number;
  daPagare90: number;
}

export function analisiSpesa(fornitori: Fornitore[], anno: number, oggiISO: string): AnalisiSpesa {
  const conSpesa = fornitori
    .map(f => ({ fornitore: f, imponibile: spesaAnno(f.statistichePuntaNet, anno) }))
    .filter(r => Math.abs(r.imponibile) >= 0.01);
  const totale = round2(conSpesa.reduce((t, r) => t + r.imponibile, 0));
  const classifica = conSpesa
    .sort((a, b) => b.imponibile - a.imponibile)
    .map(r => ({ ...r, quota: totale > 0 ? r.imponibile / totale : 0 }));
  const top10 = classifica.slice(0, 10).reduce((t, r) => t + r.imponibile, 0);

  const macroMap = new Map<FornitoreMacroCategoria, { imponibile: number; fornitori: number }>();
  for (const r of conSpesa) {
    const m = macroMap.get(r.fornitore.macroCategoria) ?? { imponibile: 0, fornitori: 0 };
    m.imponibile += r.imponibile;
    m.fornitori += 1;
    macroMap.set(r.fornitore.macroCategoria, m);
  }
  const perMacro = [...macroMap.entries()]
    .map(([macro, v]) => ({ macro, imponibile: round2(v.imponibile), fornitori: v.fornitori }))
    .sort((a, b) => b.imponibile - a.imponibile);

  const fino = (giorni: number) => addDays(oggiISO, giorni);
  const tutteLeScadenze = fornitori.flatMap(f =>
    (f.statistichePuntaNet?.scadenzeAperte ?? [])
      .filter(s => s.data >= oggiISO)
      .map(s => ({ fornitore: f, data: s.data, importo: s.importo }))
  );
  const somma = (limite: string) => round2(tutteLeScadenze.filter(s => s.data <= limite).reduce((t, s) => t + s.importo, 0));

  return {
    anno,
    totale,
    fornitoriAttivi: conSpesa.filter(r => r.imponibile > 0).length,
    quotaTop10: totale > 0 ? top10 / totale : 0,
    classifica,
    perMacro,
    scadenzeProssime: tutteLeScadenze.filter(s => s.data <= fino(60)).sort((a, b) => a.data.localeCompare(b.data)),
    daPagare30: somma(fino(30)),
    daPagare60: somma(fino(60)),
    daPagare90: somma(fino(90)),
  };
}
