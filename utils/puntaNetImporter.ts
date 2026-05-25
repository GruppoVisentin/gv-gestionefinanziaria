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
  const paroleRaw = raw.split(' ').filter(p => p.length > 2 && !['via', 'viale', 'piazza', 'corso'].includes(p));

  let bestMatch: { cantiere: string; score: number } | null = null;

  for (const c of cantieriApp) {
    const norm = normalizza(c);
    let score = 0;

    if (raw === norm) {
      score = 100;
    } else if (raw.includes(norm) || norm.includes(raw)) {
      score = 85;
    } else {
      const paroleApp = norm.split(' ').filter(p => p.length > 2);
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
  if (t.includes('sub appalti') || t.includes('subappalto')) return '[CANTIERE] Subappalti Manodopera';
  if (t.includes('fornitore materiale') || t.includes('materiale edile') || t.includes('fornitura ferro')) return '[CANTIERE] Fornitori Materiali';
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
  const entityKey = riga.entity.trim().toUpperCase().slice(0, 40);
  const regola = regoleSalvate.find(r => r.entityKey === entityKey);

  if (regola) {
    return {
      categoria: regola.categoria,
      ceType: regola.ceType,
      confidenza: 'alta',
      matchKey: entityKey,
      vatRateSuggerito: suggerisciAliquotaIVA(riga)?.aliquota ?? null,
      vatRateNota: suggerisciAliquotaIVA(riga)?.nota ?? null
    };
  }

  for (const r of REGOLE_BUILTIN) {
    if (riga.entity.toUpperCase().includes(r.pattern.toUpperCase())) {
      return {
        categoria: r.categoria,
        ceType: r.ceType,
        confidenza: r.confidenza,
        matchKey: r.pattern,
        vatRateSuggerito: suggerisciAliquotaIVA(riga)?.aliquota ?? null,
        vatRateNota: suggerisciAliquotaIVA(riga)?.nota ?? null
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
  { pattern: /imposta di bollo|commissioni banca|spese tenuta conto|canone home banking/i, aliquota: 0, nota: 'Spesa bancaria — fuori campo IVA' },
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
  { pattern: 'SUPERBETON', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'EDILSERRAJOTTO', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'PALMARINI', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'CIDIENNE', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'NEWGIPS', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'VIBETONPIAVE', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'ANDREAZZA', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'GRIGOLIN', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'ARTUSO LEGNAMI', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'FERROBETON', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'ZANUTTA', categoria: '[CANTIERE] Fornitori Materiali', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'ASOLO PAVIMENTI', categoria: '[CANTIERE] Subappalti Manodopera', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'TM DI TONIOLO', categoria: '[CANTIERE] Subappalti Manodopera', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'BERISHA', categoria: '[PERSONALE] Stipendi Dipendenti Operativi', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'NESIMOSKI SELMEDIN', categoria: '[PERSONALE] Stipendi Dipendenti Operativi', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'GAZZOLA', categoria: '[CONSULENZE] Professionisti Esterni di Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'GEOCONSULT', categoria: '[CONSULENZE] Professionisti Esterni di Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'STUDIO VISENTIN', categoria: '[CONSULENZE] Professionisti Esterni di Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'TAILORSAN', categoria: '[CANTIERE] Noleggi Attrezzature e Mezzi', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'VEGA CARBURANTI', categoria: '[CANTIERE] Carburanti', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'VELLO SRL', categoria: '[CANTIERE] Rifiuti e Macerie', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'ALTO TREVIGIANO SERVIZI', categoria: '[CANTIERE] Rifiuti e Macerie', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'TRATTORIA', categoria: '[CANTIERE] Pranzi e Trasferte Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'OSTERIA', categoria: '[CANTIERE] Pranzi e Trasferte Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'PIZZERIA', categoria: '[CANTIERE] Pranzi e Trasferte Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'RISTORANTE', categoria: '[CANTIERE] Pranzi e Trasferte Cantiere', ceType: 'costo_variabile', confidenza: 'alta' },
  { pattern: 'OFFICINA FANTIN', categoria: '[MEZZI] Riparazioni Macchinari Programmate', ceType: 'costo_fisso', confidenza: 'alta' },
  { pattern: 'TEAM UFFICIO', categoria: '[STRUTTURA] Cancelleria e Materiali Ufficio', ceType: 'costo_fisso', confidenza: 'alta' },
  { pattern: 'FELKART', categoria: '[STRUTTURA] Cancelleria e Materiali Ufficio', ceType: 'costo_fisso', confidenza: 'alta' },
  { pattern: 'DUFERCO ENERGIA', categoria: '[STRUTTURA] Utenze Sedi', ceType: 'costo_fisso', confidenza: 'alta' },
  { pattern: 'ILIAD', categoria: '[STRUTTURA] Utenze Sedi', ceType: 'costo_fisso', confidenza: 'alta' },
];
