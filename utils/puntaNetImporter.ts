import * as XLSX from 'xlsx';
import { Transaction, TransactionType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { CATEGORY_TO_CE_TYPE } from '../constants';

// ─── TIPI ────────────────────────────────────────────────────────

export interface PuntaNetRiga {
  data: Date;
  descrizione: string;
  entity: string;
  importo: number;
  tipo: 'INCOME' | 'EXPENSE';
  flagConto: 'B' | 'I';
  numeroFattura?: string;
  tipoMovimento: 'FEP' | 'FEA' | 'NEP' | 'ALTRO';
}

export interface DettFEP {
  numero: string;
  fornitore: string;
  imponibile: number;
  imposte: number;
  totale: number;
  codIva: string;
  cantiere: string;
  tipologia: string;
  categoria: string;
}

export interface DettFEA {
  numero: string;
  anno: string;
  cliente: string;
  imponibile: number;
  codIva: string;
  totale: number;
  cantiere: string;
  descrizioneDettaglio: string;
}

export interface MappingConto {
  flagB: string;
  flagI: string;
}

export interface RegolaMapping {
  entityKey: string;
  categoria: string;
  ceType: string;
}

export type AliquotaIVA = 0 | 4 | 10 | 22;

export interface RigaClassificata {
  riga: PuntaNetRiga;
  categoria: string | null;
  ceType: string | null;
  confidenza: 'alta' | 'media' | 'bassa' | null;
  matchKey: string | null;
  confermata: boolean;
  vatRateSuggerito: AliquotaIVA | null;
  vatRateNota: string | null;
  vatRateConfermato: AliquotaIVA | null;
  isDuplicato: boolean;
  livelloDuplicato: 1 | 2 | null;
  arricchitoDaFattura: boolean;
  cantiereSuggerito: string | null;
  cantiereScore: number;
  cantierePuntaNet: string;
  tipoEntrata: 'sal' | 'saldo' | 'immobile' | 'altro' | null;
}

// ─── FUNZIONI UTILI ──────────────────────────────────────────────

export const codIvaToNumber = (cod: string): AliquotaIVA => {
  if (cod === '22') return 22;
  if (cod === '10') return 10;
  if (cod === '4') return 4;
  return 0;
};

export const inferisciTipoEntrata = (desc: string): 'sal' | 'saldo' | null => {
  const d = desc.toUpperCase();
  if (d.includes('S.A.L.')) return 'sal';
  if (d.includes('SALDO')) return 'saldo';
  return null;
};

// ─── FUZZY MATCH CANTIERI ────────────────────────────────────────

export const fuzzyMatchCantiere = (
  cantierePuntaNet: string,
  cantieriApp: string[]
): { cantiere: string; score: number } | null => {
  if (!cantierePuntaNet || cantieriApp.length === 0) return null;

  const normalizza = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const raw = normalizza(cantierePuntaNet);
  const paroleEscluse = ['via', 'viale', 'piazza', 'corso', 'condominio', 'lavori', 'ristrutturazione', 'palazzina', 'comune', 'lotto', 'strada', 'residence', 'residenziale', 'edificio', 'fabbricato', 'gestione', 'costi', 'generali', 'ripartibili', 'magazzino', 'sede'];

  let paroleRaw = raw.split(' ').filter(p => p.length > 2 && !paroleEscluse.includes(p));
  if (paroleRaw.length === 0) {
    paroleRaw = raw.split(' ').filter(p => p.length > 2 && !['via', 'viale', 'piazza', 'corso'].includes(p));
  }

  let bestMatch: { cantiere: string; score: number } | null = null;

  for (const c of cantieriApp) {
    const norm = normalizza(c);
    let score = 0;

    if (raw === norm) {
      score = 100;
    } else if (raw.includes(norm) || norm.includes(raw)) {
      score = 85;
    } else {
      let paroleApp = norm.split(' ').filter(p => p.length > 2 && !paroleEscluse.includes(p));
      if (paroleApp.length === 0) {
        paroleApp = norm.split(' ').filter(p => p.length > 2 && !['via', 'viale', 'piazza', 'corso'].includes(p));
      }
      const comuni = paroleRaw.filter(p => paroleApp.includes(p));
      const totParole = Math.max(paroleRaw.length, paroleApp.length);
      score = totParole > 0 ? Math.round((comuni.length / totParole) * 100) : 0;
    }

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { cantiere: c, score };
    }
  }

  return bestMatch && bestMatch.score >= 40 ? bestMatch : null;
};

// ─── PARSER FILE BANCA (Cartel1.xlsx) ────────────────────────────

export const parseBancaExcel = (workbook: XLSX.WorkBook): PuntaNetRiga[] => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const risultati: PuntaNetRiga[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 9) continue;

    const flag = String(r[8] ?? '').trim().toUpperCase();
    if (flag !== 'B' && flag !== 'I') continue;

    const eBanca = parseFloat(String(r[6] ?? '').replace(',', '.'));
    const uBanca = parseFloat(String(r[7] ?? '').replace(',', '.'));

    const isEntrata = !isNaN(eBanca) && eBanca > 0;
    const isUscita = !isNaN(uBanca) && uBanca > 0;

    if (!isEntrata && !isUscita) continue;

    const descrizione = String(r[2] ?? '').trim();
    if (!descrizione) continue;

    let data: Date;
    try {
      const val = r[0];
      if (val instanceof Date) {
        data = val;
      } else if (typeof val === 'number') {
        data = new Date((val - 25569) * 86400 * 1000);
      } else {
        data = new Date(String(val));
      }
      if (isNaN(data.getTime())) continue;
    } catch {
      continue;
    }

    const riga: PuntaNetRiga = {
      data,
      descrizione,
      entity: estraiEntity(descrizione),
      importo: isEntrata ? eBanca : uBanca,
      tipo: isEntrata ? 'INCOME' : 'EXPENSE',
      flagConto: flag as 'B' | 'I',
      tipoMovimento: 'ALTRO'
    };

    // Classificazione tipo movimento
    if (descrizione.toUpperCase().includes('PAGAMENTO FEP') || descrizione.toUpperCase().includes('RILEVATA FEP')) {
      riga.tipoMovimento = 'FEP';
      const m = descrizione.match(/(?:[Pp]agamento|[Rr]ilevata)\s+FEP\s+n\.\s*([\w\/\-\.]+)/i);
      if (m) riga.numeroFattura = m[1].trim();
    } else if (descrizione.toUpperCase().includes('INCASSO FEA')) {
      riga.tipoMovimento = 'FEA';
      const m = descrizione.match(/[Ii]ncasso\s+FEA\s+n\.\s*(\d+)\s+(\d{4})/i);
      if (m) riga.numeroFattura = `${m[1]}/${m[2]}`;
    } else if (descrizione.toUpperCase().includes('NEP')) {
      riga.tipoMovimento = 'NEP';
    }

    risultati.push(riga);
  }

  return risultati;
};

// ─── PARSER DETTAGLIO FEP (costi_Cartel1.xlsx) ───────────────────

export const parseDettaglioFEP = (workbook: XLSX.WorkBook): Map<string, DettFEP> => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const map = new Map<string, DettFEP>();

  let current: DettFEP | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const desc = String(row[1] ?? '').trim();

    if (desc.startsWith('FEP')) {
      if (current) map.set(current.numero, current);

      const numMatch = desc.match(/^FEP\s+([\S]+)\s+del/i);
      const forMatch = desc.match(/del\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+-\s+\(Prot/i);

      if (numMatch) {
        current = {
          numero: numMatch[1].trim(),
          fornitore: forMatch ? forMatch[1].trim() : '',
          imponibile: 0,
          imposte: 0,
          totale: 0,
          codIva: '',
          cantiere: '',
          tipologia: '',
          categoria: ''
        };
      } else {
        current = null;
      }
      continue;
    }

    if (!current) continue;

    const imp = typeof row[6] === 'number' ? row[6] : 0;
    const tax = typeof row[7] === 'number' ? row[7] : 0;
    const tot = typeof row[8] === 'number' ? row[8] : 0;
    const codIva = String(row[5] ?? '').trim();

    current.imponibile += imp;
    current.imposte += tax;
    current.totale += tot;

    if (!current.codIva && codIva && codIva !== 'X99') current.codIva = codIva;
    if (!current.categoria) current.categoria = String(row[9] ?? '').trim();
    if (!current.tipologia) current.tipologia = String(row[10] ?? '').trim();
    if (!current.cantiere) current.cantiere = String(row[11] ?? '').trim();
  }

  if (current) map.set(current.numero, current);
  return map;
};

// ─── PARSER DETTAGLIO FEA (entrate_Cartel1.xlsx) ─────────────────

export const parseDettaglioFEA = (workbook: XLSX.WorkBook): Map<string, DettFEA> => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const map = new Map<string, DettFEA>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const desc = String(row[1] ?? '').trim();

    if (desc.startsWith('FEA')) {
      const match = desc.match(/^FEA\s+(\d+)\/(\d{4})\s+del/i);
      const cliMatch = desc.match(/del\s+\d{2}\/\d{2}\/\d{4}\s+(.+)$/i);

      if (match) {
        const numero = match[1];
        const anno = match[2];
        const nextRow = rows[i + 1];

        const dett: DettFEA = {
          numero,
          anno,
          cliente: cliMatch ? cliMatch[1].trim() : '',
          imponibile: typeof nextRow?.[6] === 'number' ? nextRow[6] : 0,
          codIva: String(nextRow?.[5] ?? '').trim(),
          totale: typeof nextRow?.[8] === 'number' ? nextRow[8] : 0,
          cantiere: String(nextRow?.[11] ?? '').trim(),
          descrizioneDettaglio: String(nextRow?.[1] ?? '').trim()
        };
        map.set(`${numero}/${anno}`, dett);
      }
    }
  }

  return map;
};

// ─── DEDUPLICAZIONE ──────────────────────────────────────────────

export const isDuplicato = (
  riga: PuntaNetRiga,
  esistenti: Transaction[]
): { duplicato: boolean; livello: 1 | 2 | null; transazioneEsistente?: Transaction } => {
  if (esistenti.length === 0) return { duplicato: false, livello: null };

  // Livello 1: Numero fattura
  if (riga.tipoMovimento === 'FEP' && riga.numeroFattura) {
    const trovata = esistenti.find(tx =>
      tx.type === 'EXPENSE' &&
      tx.description.toUpperCase().includes(riga.numeroFattura!.toUpperCase()) &&
      Math.abs(tx.amount - riga.importo) < 0.05
    );
    if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
  } else if (riga.tipoMovimento === 'FEA' && riga.numeroFattura) {
    const trovata = esistenti.find(tx =>
      tx.type === 'INCOME' &&
      tx.description.toUpperCase().includes('FEA') &&
      tx.description.toUpperCase().includes(riga.numeroFattura!.toUpperCase())
    );
    if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
  }

  // Livello 2: Tripla chiave
  const dataStr = riga.data.toISOString().split('T')[0];
  const importoCent = Math.round(riga.importo * 100);
  const descPrefix = riga.descrizione.toUpperCase().slice(0, 15);

  const trovata = esistenti.find(tx =>
    tx.date === dataStr &&
    Math.round(tx.amount * 100) === importoCent &&
    tx.description.toUpperCase().slice(0, 15) === descPrefix
  );

  if (trovata) return { duplicato: true, livello: 2, transazioneEsistente: trovata };

  return { duplicato: false, livello: null };
};

// ─── ESTRAI NOME ENTITÀ ──────────────────────────────────────────

export const estraiEntity = (descr: string): string => {
  let m = descr.match(/(?:Pagamento|Incasso)\s+(?:FEP|NEP)\s+n\.\s+[\w/]+\s+-\s+(.+?)\s+-\s+/i);
  if (m) return m[1].trim();
  m = descr.match(/RIF\.TO\s+(.+?)\s+-\s+/i);
  if (m) return m[1].trim();
  m = descr.match(/^.+?\s+-\s+(.+?)\s+-\s+Home banking/i);
  if (m) return m[1].trim();
  m = descr.match(/-\s+(.+?)\s+-\s+Bonifico/i);
  if (m) return m[1].trim();
  return descr.slice(0, 60);
};

// ─── MAPPA TIPOLOGIA → CATEGORIA ─────────────────────────────────

export const mappaTipologiaACategoriaApp = (
  tipologia: string,
  tipo: 'FEP' | 'FEA'
): string | null => {
  if (tipo === 'FEA') return null;
  const t = tipologia.toLowerCase();
  if (t.includes('sub appalti') || t.includes('subappalto')) return '[PERSONALE] Subappalti Manodopera';
  if (t.includes('fornitore materiale') || t.includes('materiale edile') || t.includes('fornitura ferro')) return '[FORNITORI] Fornitori Materiali';
  if (t.includes('smaltimento') || t.includes('rifiuti') || t.includes('wc') || t.includes('box')) return '[CANTIERE] Rifiuti e Macerie';
  if (t.includes('professionisti') || t.includes('professionist')) return '[CONSULENZE] Professionisti Esterni di Cantiere';
  if (t.includes('stipendi') || t.includes('stipendio')) return '[PERSONALE] Stipendi Dipendenti Operativi';
  if (t.includes('compensi amministratori')) return '[PERSONALE] Compenso Amministratori';
  if (t.includes('energia elettrica') || t.includes('utenze')) return '[STRUTTURA] Utenze Sedi';
  if (t.includes('acqua')) return '[STRUTTURA] Utenze Sedi';
  if (t.includes('pubblicità') || t.includes('promozione')) return '[MARKETING] Pubblicità e Marketing';
  if (t.includes('spese bancarie')) return '[FINANZA] Commissioni e Bolli Bancari';
  if (t.includes('pranzi')) return '[CANTIERE] Pranzi e Trasferte Cantiere';
  if (t.includes('autoricambi') || t.includes('revisione') || t.includes('riparazione')) return '[MEZZI] Riparazioni Macchinari Programmate';
  if (t.includes('servizi telefonici') || t.includes('telefon')) return '[STRUTTURA] Software e Abbonamenti';
  return null;
};

// ─── CLASSIFICAZIONE AUTOMATICA (Fallback) ───────────────────────

export const classificaRiga = (
  riga: PuntaNetRiga,
  regoleSalvate: RegolaMapping[]
): {
  categoria: string | null;
  ceType: string | null;
  confidenza: 'alta' | 'media' | 'bassa' | null;
  matchKey: string | null;
  vatRateSuggerito: AliquotaIVA | null;
  vatRateNota: string | null;
} => {
  const descLower = riga.descrizione.toLowerCase();
  const entLower = riga.entity.toLowerCase();

  // Riconoscimento automatico spese e commissioni bancarie / bolli / interessi
  if (
    /spese bonifico|spese per bonifico|spese rid|spese per rid|addebito rid|commissione|commissioni|cbill|imposta di bollo|spese tenuta conto|canone home banking|estratto conto|competenze|spese di scritturazione/i.test(descLower) ||
    /spese bonifico|spese per bonifico|spese rid|spese per rid|addebito rid|commissione|commissioni|cbill|imposta di bollo|spese tenuta conto|canone home banking|estratto conto|competenze|spese di scritturazione/i.test(entLower)
  ) {
    const isInteressi = /interessi/i.test(descLower) || /interessi/i.test(entLower);
    const categoria = isInteressi 
      ? '[FINANZA] Interessi Passivi Finanziamenti' 
      : '[FINANZA] Commissioni e Bolli Bancari';
    return {
      categoria,
      ceType: 'onere_finanziario',
      confidenza: 'alta',
      matchKey: 'automazione bancaria',
      vatRateSuggerito: 0,
      vatRateNota: 'Spesa bancaria — fuori campo IVA'
    };
  }

  // Riconoscimento automatico affitti/locazioni/canoni
  if (/affitto|locazione|canone/i.test(descLower) || /affitto|locazione|canone/i.test(entLower)) {
    const isUscita = riga.tipo === 'EXPENSE';
    const categoria = isUscita ? '[STRUTTURA] Affitti Sedi' : '[IMMOBILIARE] Affitti Attivi';
    const ceType = isUscita ? 'costo_fisso' : 'ricavo_core';
    const vatRateSuggerito = isUscita ? 22 : 10;
    const vatRateNota = isUscita ? 'Affitto passivo — aliquota 22%' : 'Affitto attivo — aliquota 10%';
    return {
      categoria,
      ceType,
      confidenza: 'alta',
      matchKey: 'automazione affitti',
      vatRateSuggerito,
      vatRateNota
    };
  }

  const entityKey = riga.entity.trim().toUpperCase().slice(0, 40);
  const regola = regoleSalvate.find(r => r.entityKey === entityKey);

  if (regola) {
    const sugIVA = suggerisciAliquotaIVA(riga);
    const vatRateSuggerito = sugIVA?.aliquota ?? suggerisciAliquotaIVADaCategoria(regola.categoria);
    const vatRateNota = sugIVA?.nota ?? (vatRateSuggerito !== null ? `Aliquota standard per categoria` : null);
    return {
      categoria: regola.categoria,
      ceType: regola.ceType,
      confidenza: 'alta',
      matchKey: entityKey,
      vatRateSuggerito,
      vatRateNota
    };
  }

  for (const r of REGOLE_BUILTIN) {
    if (riga.entity.toUpperCase().includes(r.pattern.toUpperCase())) {
      const sugIVA = suggerisciAliquotaIVA(riga);
      const vatRateSuggerito = sugIVA?.aliquota ?? suggerisciAliquotaIVADaCategoria(r.categoria);
      const vatRateNota = sugIVA?.nota ?? (vatRateSuggerito !== null ? `Aliquota standard per categoria` : null);
      return {
        categoria: r.categoria,
        ceType: r.ceType,
        confidenza: r.confidenza,
        matchKey: r.pattern,
        vatRateSuggerito,
        vatRateNota
      };
    }
  }

  const suggerimentoIVA = suggerisciAliquotaIVA(riga);
  return {
    categoria: null,
    ceType: null,
    confidenza: null,
    matchKey: null,
    vatRateSuggerito: suggerimentoIVA?.aliquota ?? null,
    vatRateNota: suggerimentoIVA?.nota ?? null
  };
};

// ─── REGOLE IVA ──────────────────────────────────────────────────

interface RegolaIVA {
  pattern: RegExp;
  aliquota: AliquotaIVA;
  nota: string;
}

const REGOLE_IVA_USCITE: RegolaIVA[] = [
  { pattern: /saldo stip|stipendi|paga|cedolino/i, aliquota: 0, nota: 'Stipendi — fuori campo IVA' },
  { pattern: /edilcassa|co\.i\.m|coim|cna |inps|inail|contributi/i, aliquota: 0, nota: 'Contributi — fuori campo IVA' },
  { pattern: /versamento iva|f24|irpef|ires|irap|acconto.*impost/i, aliquota: 0, nota: 'Versamento fiscale — fuori campo IVA' },
  { pattern: /comune di|abaco|imu|tari|tassa|tributo|bollo|camera di commercio|codice lei/i, aliquota: 0, nota: 'Tasse/tributi — fuori campo IVA' },
  { pattern: /unipol|generali|zurich|polizza|assicur|fidejussion|decennale|postuma|car condominio|normatempo/i, aliquota: 0, nota: 'Assicurazione — esente IVA art.10' },
  { pattern: /rata mutuo|quota capitale|rimborso finanziamento|solo interessi|differenzial/i, aliquota: 0, nota: 'Rata mutuo — fuori campo IVA' },
  { pattern: /imposta di bollo|spese tenuta conto|canone home banking|spese bonifico|spese rid|spese per rid|addebito rid|commissione|commissioni|cbill/i, aliquota: 0, nota: 'Spesa bancaria — fuori campo IVA' },
  { pattern: /ritenuta.*bonifico|ritenute.*bonifici/i, aliquota: 0, nota: 'Ritenuta su bonifico — fuori campo IVA' },
  { pattern: /prelievo utile|distribuzione utile|dividendo/i, aliquota: 0, nota: 'Distribuzione utile — fuori campo IVA' },
  { pattern: /volontariato|donazione|pro.loco|proloco/i, aliquota: 0, nota: 'Donazione — fuori campo IVA' },
  { pattern: /sanzione|multa|verbale.*cds/i, aliquota: 0, nota: 'Sanzione — fuori campo IVA' },
  { pattern: /labormedica|medic|visita.*lavoro|medicina.*lavoro|sanitari/i, aliquota: 4, nota: 'Prestazione sanitaria — IVA 4%' },
  { pattern: /farmaci|farmacia|presidi sanitari/i, aliquota: 4, nota: 'Materiale sanitario — IVA 4%' },
  { pattern: /edilserrajotto|superbeton|vibetonpiave|palmarini|artuso legnami|artuso impianti/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /fornaci grigolin|andreazza|carniello|vudafieri|edile pedemontana/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /feltrin t\.|cidienne|sfedil|ferrobeton|zanutta|calcestruzzi/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /mazzero|zilio nico|dpm dalla mora|betonrossi|savio manufatti/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /comin costruzioni|newgips|bellotto legnami|solsider|panalex/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /isolex|stanghellini|camini dumont|novalinea|rotho blass/i, aliquota: 10, nota: 'Materiali edili — IVA 10%' },
  { pattern: /dps srl|amr srl|rr group|sd group|bongiorno antinfortun/i, aliquota: 10, nota: 'Materiali/attrezzature cantiere — IVA 10%' },
  { pattern: /giem edile|berisha|fkf costruzioni|costruzioni nadi|sauca petru/i, aliquota: 10, nota: 'Subappalto edile — IVA 10%' },
  { pattern: /shijaku|euroedil|new edil|markedil|dm costruzioni|cielle di caon/i, aliquota: 10, nota: 'Subappalto edile — IVA 10%' },
  { pattern: /muca eqrem|nesimoski|subappalto|manodopera/i, aliquota: 10, nota: 'Subappalto edile — IVA 10%' },
  { pattern: /gr.?box|sebach|tailorsan|service ponteggi|bagni.*cantiere|wc.*cantiere/i, aliquota: 10, nota: 'Noleggio attrezzatura cantiere — IVA 10%' },
  { pattern: /vello|alto trevigiano servizi|rifiuti|macerie|smaltimento|trentin ghiaia|dal zotto|marifer|marcon/i, aliquota: 10, nota: 'Smaltimento rifiuti — IVA 10%' },
  { pattern: /trattoria|osteria|ristorante|pizzeria|albergo.*ristorante|bau maria/i, aliquota: 10, nota: 'Ristorazione — IVA 10%' },
  { pattern: /smania flavio|il filo srls|gioia snc|ma\.gi\.ca|nord ristorazione|altebas/i, aliquota: 10, nota: 'Ristorazione — IVA 10%' },
  { pattern: /asolo pavimenti|tm.*toniolo|toniolo|paviment/i, aliquota: 10, nota: 'Posa pavimenti edile — IVA 10%' },
  { pattern: /bs sistemi|bin sistemi|svar|acca software|puntanet|we tech|ots sistemi|aruba/i, aliquota: 22, nota: 'Software/abbonamento — IVA 22%' },
  { pattern: /team ufficio|felkart|cancelleria|materiale ufficio/i, aliquota: 22, nota: 'Cancelleria — IVA 22%' },
  { pattern: /enel energia|a2a energia|api reti gas|duferco energia|duferco/i, aliquota: 22, nota: 'Utenza energetica — IVA 22%' },
  { pattern: /tim spa|iliad|vodafone|windtre|telefonia|internet/i, aliquota: 22, nota: 'Telefonia/internet — IVA 22%' },
  { pattern: /oil italia|gasolio|benzina|carburante|rifornimento/i, aliquota: 22, nota: 'Carburante — IVA 22%' },
  { pattern: /marigraf|pixartprinting|gallo pubblicità|stampasi|pubblielle|grafi comunicazione|eliocartotecnica/i, aliquota: 22, nota: 'Pubblicità — IVA 22%' },
  { pattern: /officina fantin|cenpi srl|guidolin|carrozzeria|artigomme|sernagiotto srl|miozzo|glasspoint|mechanical line/i, aliquota: 22, nota: 'Riparazione mezzi — IVA 22%' },
  { pattern: /perin vittorino|tvm service|i\.p\.i\.|revisione|gommista/i, aliquota: 22, nota: 'Revisione/manutenzione mezzi — IVA 22%' },
  { pattern: /geoconsult|gazzola.*arch|gazzola srls|studio.*arch|studio.*ing|studio visentin/i, aliquota: 22, nota: 'Professionista — IVA 22%' },
  { pattern: /dametto wanda|de filippo|commercialista|notaio|avvocato|consulente/i, aliquota: 22, nota: 'Consulenza professionale — IVA 22%' },
  { pattern: /esna soa|bureau veritas|ikon srls|gestione ambienti|i bambini delle fate/i, aliquota: 22, nota: 'Formazione/certificazione — IVA 22%' },
  { pattern: /compenso amministratori|amministratori/i, aliquota: 22, nota: 'Compenso amministratore (con P.IVA) — IVA 22%' },
  { pattern: /affitto sede|canone locazione|locazione/i, aliquota: 22, nota: 'Affitto — IVA 22%' },
  { pattern: /treviso macchine|noleggio.*veicol|autonoleggio|unipol move/i, aliquota: 22, nota: 'Noleggio mezzi — IVA 22%' },
  { pattern: /interessi.*fido|interessi.*conto|interessi passivi bancari|commissioni.*fido/i, aliquota: 22, nota: 'Onere bancario — IVA 22%' },
  { pattern: /corso|formazione|addestramento|sicurezza.*lavoro/i, aliquota: 22, nota: 'Formazione — IVA 22%' },
];

const REGOLE_IVA_ENTRATE: RegolaIVA[] = [
  { pattern: /caparra/i, aliquota: 0, nota: 'Caparra confirmatoria — fuori campo IVA' },
  { pattern: /rientro.*investimento|dividendo|rimborso.*finanziamento/i, aliquota: 0, nota: 'Provento finanziario — fuori campo IVA' },
  { pattern: /sal|stato avanzamento|acconto|1.*acconto|2.*acconto|3.*acconto|4.*acconto|finiture/i, aliquota: 10, nota: 'SAL/Acconto edile residenziale — IVA 10%' },
  { pattern: /saldo|saldo finale|saldo.*commessa|ultimo.*pagamento/i, aliquota: 10, nota: 'Saldo finale commessa — IVA 10% (include recupero caparra)' },
  { pattern: /extra|lavori extra|manutenzione|piccoli lavori/i, aliquota: 10, nota: 'Lavori extra/manutenzione — IVA 10%' },
];

export const suggerisciAliquotaIVA = (
  riga: PuntaNetRiga
): { aliquota: AliquotaIVA; nota: string } | null => {
  const testo = `${riga.entity} ${riga.descrizione}`.toLowerCase();
  const regole = riga.tipo === 'INCOME' ? REGOLE_IVA_ENTRATE : REGOLE_IVA_USCITE;
  for (const regola of regole) {
    if (regola.pattern.test(testo)) {
      return { aliquota: regola.aliquota, nota: regola.nota };
    }
  }
  return null;
};

export const suggerisciAliquotaIVADaCategoria = (categoria: string): AliquotaIVA | null => {
  if ([
    '[PERSONALE] Stipendi Dipendenti Ufficio',
    '[PERSONALE] Stipendi Dipendenti Operativi',
    '[PERSONALE] Contributi Dipendenti Ufficio',
    '[PERSONALE] Contributi Dipendenti Operativi',
    '[COMPLIANCE] Assicurazioni Generali',
    '[MEZZI] Assicurazione Mezzi e Bolli',
    '[CANTIERE] Assicurazione Cantieri',
    '[FISCO] Versamento IVA',
    '[FISCO] F24 — IRPEF / IRES / IRAP',
    '[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)',
    '[FISCO] Ritenute su Bonifici (versate)',
    "[FISCO] Ritenute d'Acconto su Professionisti",
    '[FINANZA] Quota Capitale Rate Finanziamenti',
    '[FINANZA] Finanziamenti Ricevuti',
    '[FINANZA] Interessi Passivi Finanziamenti',
    '[FINANZA] Commissioni e Bolli Bancari',
    '[FINANZA] Interessi su Mutuo Cantiere',
    '[SOCI] Prelievo Utile Soci',
    '[SOCI] Ritenuta su Prelievo Soci',
    '[PERSONALE] Compenso Amministratori',
    '[STRAORDINARI] Sanzioni e Penali',
    '[STRAORDINARI] Volontariato e Donazioni',
    '[CANTIERE] Anticipi da Clienti su Commessa',
    '[CANTIERE] Caparra Confirmatoria',
  ].includes(categoria)) return 0;
  if ([
    '[COMPLIANCE] Visite Mediche Dipendenti',
  ].includes(categoria)) return 4;
  if ([
    '[CANTIERE] SAL — Stato Avanzamento Lavori',
    '[CANTIERE] Saldo Finale Commessa',
    '[CANTIERE] Manutenzioni e Piccoli Lavori',
    '[CANTIERE] Fornitori Materiali',
    '[CANTIERE] Subappalti Manodopera',
    '[CANTIERE] Noleggi Attrezzature e Mezzi',
    '[CANTIERE] Rifiuti e Macerie',
    '[CANTIERE] Pranzi e Trasferte Cantiere',
    '[IMMOBILIARE] Vendita Immobili e Terreni',
    '[IMMOBILIARE] Affitti Attivi',
    '[PERSONALE] Stipendi Dipendenti Operativi',
  ].includes(categoria)) return 10;
  return 22;
};

// ─── CONVERSIONE IN TRANSAZIONE ──────────────────────────────────

export const rigaToTransaction = (
  riga: PuntaNetRiga,
  categoria: string,
  ceType: string,
  vatRate?: number,
  sourceRef?: string,
  importSessionId?: string
): Transaction => {
  return {
    id: uuidv4(),
    date: riga.data.toISOString().split('T')[0],
    description: riga.descrizione,
    amount: riga.importo,
    type: riga.tipo === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
    category: categoria,
    ceType: ceType as any,
    vatRate: vatRate ?? 0,
    sourceRef: sourceRef ?? `Punta Net · ${riga.data.toLocaleDateString('it-IT')}`,
    importSessionId,
  };
};

// ─── REGOLE BUILTIN ──────────────────────────────────────────────

const REGOLE_BUILTIN: Array<{
  pattern: string;
  categoria: string;
  ceType: string;
  confidenza: 'alta' | 'media';
}> = [
  { pattern: "VISENTIN ODILLO E MASARO", categoria: "[STRUTTURA] Affitti Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VISENTIN LIVIO E PIOVESAN NADIA", categoria: "[STRUTTURA] Affitti Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "OFFICINA FANTIN DI FANTIN VITO", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ACI PER GIRARE CON CAMION", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "BOLLETTINO GRU INAIL", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CENPI SRL", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GUIDOLIN", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VISENTIN TARCISIO", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "AUTOPIU'", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CARROZZERIA BASSO", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ORMET", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CARROZZERIA PIAVE", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ARTIGOMME", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MENEGON VITTORIO", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "DAL BON STUDIO", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MECHANICAL LINE SOLUTIO NS", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GLASSPOINT SERVICE", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SERNAGIOTTO SRL", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PERIN VITTORINO GOMMISTA", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TVM SERVICE", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MIOZZO SRL", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "DAMETTO WANDA", categoria: "[INVESTIMENTI] Acquisto Attrezzature e Macchinari", ceType: "capex", confidenza: "alta" },
  { pattern: "COMUNE DI ALTIVOLE", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ABACO COMUNE DI CAERANO", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "COMUNE DI TREVISO", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PROLOCO ALTIVOLE E CASELLE DI ALTIVOLE", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VERSAMENTO BOLLATURA LIBRI SOCIALI", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CODICE LEI", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ABACO DI MONTEBELLUNA", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ABACO DI ROMANO D'EZZELINO", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ABACO DI VALDOBBIADENE", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "AMBIENTI", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ABACO JESOLO", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CAMERA DI COMMERCIO", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "IMU", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "COMUNE DI MONTEBELLUNA", categoria: "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "I.P.I. SRL", categoria: "[MEZZI] Revisione Macchinari", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MARIGRAF", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PIXARTPRINTING", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PUBBLICARELLO", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GALLO PUBBLICITÀ", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "STAMPASI", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "NEDERS ITALY", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TPC GROUP", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ELEGERBERTT STRASSU", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GRAFI COMUNICAZIONE", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ARUBA", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PUBBLIELLE", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GIFT CAMPAIGN", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ELIOCARTOTECNICA", categoria: "[MARKETING] Pubblicità e Marketing", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ENEL ENERGIA", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "API RETI GAS", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "A2A ENERGIA", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TIM SPA", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "DUFERCO", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TEAM UFFICIO", categoria: "[STRUTTURA] Cancelleria e Materiali Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "FELKART", categoria: "[STRUTTURA] Cancelleria e Materiali Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "BS SISTEMI", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SVAR", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "OTS SISTEMI", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "WE TECH SYSTEM", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ACCA", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PUNTANET", categoria: "[STRUTTURA] Software e Abbonamenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA CAMION MERCEDES UNIPOL", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA CAMION MAN GENERALI", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA FURGONE DAILY 7 POSTI TUA ASSICURAZIONI", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA ASSIC. ESCAVATORE", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE CAMION MERCEDES", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE FIORINO", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE JEEP", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA DAILY VECCHIO", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "RATA ANNUALE POLIZZA AMBIENTE - I.S.P.", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICUR. POLIZA INFORTUNI GV", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICUR. POLIZZA RC CANTIERI GV", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSIC. RESPONSABILITÀ VERSO TERZI", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE MAGAZZINI", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA ASSICURAT. INTESA SAN PAOLO", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SPADAVECCHIA & PARTNERS", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA CATASTROFALI", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE CATASTROFALI", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA INVESTIMENTO RISCHIO CON GENERALI", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "IKON SRLS", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GESTIONE AMBIENTI", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "LABORMEDICA", categoria: "[COMPLIANCE] Visite Mediche Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VISENTIN ANDREA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "BELLINI SIMONE", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TRONCON NICOLA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MARTIGNAGO ILARIA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "EDILCASSA VENETO", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CNA", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "COIM", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "DE FILIPPO GIOVANNI", categoria: "[PERSONALE] Collaboratori Fissi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SELMEDIN NESIMOSKI", categoria: "[PERSONALE] Collaboratori Fissi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ESNA SOA", categoria: "[CONSULENZE] SOA e ISO", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "BUREAU VERITAS", categoria: "[CONSULENZE] SOA e ISO", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "OIL ITALIA", categoria: "[CANTIERE] Carburanti", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GR BOX", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SEBACH", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TAILORSAN", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SERVICE PONTEGGI", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SERVIZIO ECOLOGICI SU WC", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IDEAL SERVICE", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VELLO", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SFEDIL", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "UNIPOL MOVE", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TREVISO MACCHINE", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA CAR CONDOMINIO SOLARE - GODEGO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA MIHALI IOAN", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA FRUSCALZO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA CAR CONDOMINIO ROSE BLU", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA CAR CONDOMINIO VILLA ELEONORA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA COND. SOLARE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA DE MARCHI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA CAR SERNAGIOTTO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA COND. CASELLE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA FELTRIN", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA GAZZOLA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA VILLA ELEONORA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA CAR ROSSANESE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FIDEJUSSIONI COND. SUNFLOWER BON + F RESTAURI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZURICH INSURANCE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ASSICURAZIONE POSTUMA GAZZOLA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA POSTUMA GAZZOLA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DEPOSITO VINCOLO POLIZZA FIDEJUSSORIA ZURICH", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NORMATEMPO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FIDEJUSSIONE SU APP.TO CECCHETTO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FIDEJUSSIONE DE ROSSI - HOP", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SPDAVECCHIA & PARTNERS", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGENZIA ASOLO GENERALI FIDEJUSSIONE LAZZARI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA FIDEJUSSORIA + CAR + POSTUMA COND. HOP", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA SERNAGIOTTO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA AGENZIA GENERALI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA ROSSANESE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AL PONTE LEVATOIO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA AL GIARDINO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "OSTERIA LA CANEVA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AI GALLI RISTORANTE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MERLO GINO TRATTORIA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA DA TONI", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA DA MASON VALENTINA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA BRISTOL", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA VECIA OSTERIA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SMANIA FLAVIO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BAU MARIA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IL FILO SRLS", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "OSTERIA GUARNIER", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ANTICA CASADA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MULINAR UDINE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NORD RISTORAZIONE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIOIA SNC UDINE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MA.GI.CA. RISTORANTE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA DA CICCIO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PIZZERIA RISTORANTE LA ROSSA BELLUNO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALBERGO RISTORANTE ALLE CROSERE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ROMA MICHELE", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA ALL'ALPINO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALTEBAS", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PIZZERIA AL GABBIANO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DAL ZOTTO", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRENTIN GHIAIA", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARIFER", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VELLO", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARCON", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CSERVENSCHI CRISTIAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FERRO EMILIO", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "KALOCI SOKOL", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MIHALI IOAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANDONÀ DENIS", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONETTO CRISTIAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NUOVO OPERAIO", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILCASSA VENETO + UDINE", categoria: "[PERSONALE] Contributi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CNA", categoria: "[PERSONALE] Contributi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COIM", categoria: "[PERSONALE] Contributi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SAUCA PETRU MARIAN", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIEM EDILE", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SHIJAKU AZEM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BERISHA BLERIM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EUROEDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NEW EDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARKEDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COSTRUZIONI NADI SRLS", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FKF COSTRUZIONI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DM COSTRUZIONI SRL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CIELLE DI CAON", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MUCA EQREM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILSERRAJOTTO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FELTRIN T.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "L'ARTIBENI DI FERRONATO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "META CHIODATRICI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PERI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SUPERBETON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "E.A. LASER", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARMI 88", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARTUSO IMPIANTI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VIBETONPIAVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CIDIENNE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BMI ITALIA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANUTTA SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PERI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CALCESTRUZZI LADANO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PALMARINI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CARNIELLO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ACCREDITO PER FORNITURA DA EDILCASSA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SAVIO MANUFATTI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPS SRL FERRAMENTA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILE PEDEMONTANA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ANDREAZZA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARTUSO LEGNAMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ACES SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EPIU' SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BETONROSSI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COMIN COSTRUZIONI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IMMOBILIARE MASSIMO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SIRIO 7 DI PIA SIMONE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SFEDIL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DUFERCO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COSSIO ATTILIO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FERROBETON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BIN SISTEMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAZZERO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PELLIZZARI BUILDING", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TORRESAN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZILIO NICO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONGIORNO ANTIFORNTUNISTICA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GEOCONSULT", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COFILOC", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "J & D FAVRETTO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DAMETTO WANDA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "KILOTUU ITALIA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "F.LLI BISOL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VUDAFIERI F.LLI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TVM SERVICE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLSIDER", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRUNATO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RGM PROVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SPURGATORI RIESE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "A.A.A.M.P. ESTINTORI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FORNACI GRIGOLIN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAVIS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPS SRL FERRAMENTA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NOVALINEA ARREDO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ISOLEX", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STANGHELLINI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "F.LLI PIZZIOLO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CAMINI DUMONT", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BELLOTTO LEGNAMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALTO TREVIGIANO SERVIZI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LA IDROFERRAMENTA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPM DALLA MORA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CORPO NAZIONALE DEI VIGILI DEL FUOCO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CAV CESTARO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SD GROUP", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ROTHO BLASS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PANALEX", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONGIORNO ANTIFORNTUNISTICA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MANGH", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NUOVA COSTRUZIONE SAS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA SRLS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NEWGIPS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FAI DA TE DI ZOLLO LUCA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DUFERCO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AMR SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RR GROUP", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ISSEPON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARREDIL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONSORIZIO PIAVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANUTTA SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONSORZIO BONIFICA PIAVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CEMENTART", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "E-DISTRIBUZIONE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ENEL ENERGIA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MUNARETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLAR SYSTEM", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LATTONERIA ROSSANESE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ASOLO PAVIMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IL FABBRO SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NART SONIA", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECORGESSO SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GALLIAZZO IVANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN & GASPARETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GEOSOLAR", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGOSTINI SERGIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AEERRE COSTRUZIONI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONTE AMBIENTI ESTERNI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FALEGNAMERIA TRENTIN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN FRANCESCO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DKH SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MASARO FABIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ROCCON SILVIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POZZOBON SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "M.N. COSTRUZIONI SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILMULI DI ZOGAJ", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TIMEXPERT", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TERMOIDRAULICA G.SC.", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CBM MARTIGNAGO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TM TONIOLO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GANEO ADRIANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BS IMPIANTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COLORDESIGN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "E.P. PONTEGGI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AZ. FLOROVIVAISTICA GIANDINO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MIFTAROSKI FIKMET", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "METOPE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TM TONIOLO MASSIMO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SERRAMENTI RUFFATO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IKON TECNOLOGY", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILMONASTIER", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PEDEMONTANA SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GURITENCO IGOR", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLIGO DAMIANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONTARIN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DAMETTO SIMONE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DM POSA SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MORO SERRANDE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CETOS SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EUROCOSTRUZIONI SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIULIANO COPERTURE SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NICOLA METAL DESIGN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LIBRA SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PAESAGGI UMBRI CONSORZIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SBRISSA SEBASTIANO GIARDINI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MORETTO SCAVI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LILLO COPERTURE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALPAC", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILE COPERTURE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PIZZOLATO JODY", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILLUX DI ABO GHAZALAH", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN COSTRUZIONI SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STORGATO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CSB CENTRO SVILUPPO BREVETTI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CUSINATO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STRADIOTTO RICCARDO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SBRISSA MICHELE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STUDIO DAL BON", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BIZZOTTO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GALLINA STEVEN", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LAPPO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RONCATO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FRANCESCHINI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CREDIT SAFE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAZZOCATO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRERA ROSSELLA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RAGIONIER FERRERI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA EDOARDO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA ALESSIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LOTTIZZAZ. AMBITO 6 SALDO RATA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STUDIO SPOLADORI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MASON GIANFILIPPO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MOUNTECH SRL STP", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "R.Z. PROGETTI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DEGA INVESTIMENTI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NORMATEMPO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FAVERO LUCA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BERTON", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SEMENZIN E SERNAGIOTTO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TORRESAN ASSOCIATI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BORDIGNON SIMONE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AVVOCATO LAZZARON", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AVVOCATI CAESOLDI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONARDI ARCH. MATTIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BALLON DAVIDE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STUDIO PIOVESAN", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GEOLOGO BERNARDI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "593 STUDIO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DE VECCHI FOTOGRAFO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NOTAIO IMPARATO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MENTI PRATICHE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ABACO COMUNI VARI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZONE INTERMEDIAZIONE IMMOBILIARE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STUDIO LEGALE PER VALUTAZIONE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AVVOCATO TALLUTO TOMMASO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PRESIDIA GROUP", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ORDINE ARCHITETTI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGENZIA IMMOBILIARE LELLIS", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRESOLIN ING. MARCO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGENZIA ACCORDI DI MARINI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GOBBO ARCHITETTO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRUN LUCA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SICURA SPA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BUREAU VERITAS ITALIA ( ISO )", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONDOMINIO CASELLE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PASETTO ALFRINO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LIBRALATO MICHELE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COMUNE DI CASTELFRANCO PER ZOGAJ", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PUNTANET", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PREVEDI PER NICOLA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ADECCO ITALIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AMMINISTRATORE LOTTIZZ. CONTEA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RETE GROUP", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ACQUISIZIONE TERRENI O IMMOBILI", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TERRENO …....VIA OSPEDALE MB", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TERRENO …....VIALE VITTORIO V. TV", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TERRENO …....", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "O VERSAMENTO CAPITALE SOCIALE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LIQUIDITA' IN CONTO CORRENTE", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
];
