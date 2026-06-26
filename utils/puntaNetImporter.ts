import * as XLSX from 'xlsx';
import { Transaction, TransactionType, Project } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { CATEGORY_TO_CE_TYPE } from '../constants';

const safeParseFloat = (val: any): number => {
  if (typeof val === 'number') return val;
  let str = String(val ?? '').trim();
  if (!str) return NaN;
  str = str.replace(/[^\d.,-]/g, ''); // Remove currency symbols, spaces, etc.
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      str = str.replace(/\./g, '');
    }
  }
  return parseFloat(str);
};

// ─── TIPI ────────────────────────────────────────────────────────

export interface ExistingTransactionIndexes {
  fepMap?: Map<string, Transaction[]>;
  feaMap?: Map<string, Transaction[]>;
  dateAmountDescMap?: Map<string, Transaction[]>;
  dateAmountTypeMap?: Map<string, Transaction[]>;
}

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
  aliquoteMiste: boolean;
  dataDocumento?: string; // YYYY-MM-DD
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
  dataDocumento?: string; // YYYY-MM-DD
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
  livelloDuplicato: 1 | 2 | 3 | null;
  arricchitoDaFattura: boolean;
  aliquoteMiste?: boolean;
  cantiereSuggerito: string | null;
  cantiereScore: number;
  cantierePuntaNet: string;
  cantiereMatchFonte: 'cliente_fea' | 'fornitore_fep' | 'nome_cantiere' | 'testo_banca' | null;
  tipoEntrata: 'sal' | 'acconto' | 'saldo' | 'immobile' | 'altro' | null;
  dataDocumento?: string | null; // YYYY-MM-DD
}

// ─── FUNZIONI UTILI ──────────────────────────────────────────────

export const codIvaToNumber = (cod: string): AliquotaIVA => {
  if (cod === '22') return 22;
  if (cod === '10') return 10;
  if (cod === '4') return 4;
  return 0;
};

export const inferisciTipoEntrata = (desc: string): 'sal' | 'acconto' | 'saldo' | null => {
  if (/S\.A\.L\.|^SAL$|\bSAL\b|STATO AVANZAMENTO/i.test(desc)) return 'sal';
  if (/\bACCONTO\b|ANTICIPO|PRIMO PAGAMENTO/i.test(desc)) return 'acconto';
  if (/\bSALDO\b|SALDO FINALE|ULTIMO PAGAMENTO|LIQUIDAZIONE/i.test(desc)) return 'saldo';
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

  return bestMatch && bestMatch.score >= 55 ? bestMatch : null;
};

// Verifica se tutte le parole significative (≥3 char) di 'a' compaiono in 'b' (qualsiasi ordine).
// Richiede almeno 2 parole significative per evitare falsi positivi con cognomi singoli comuni (es. "Rossi").
const tutteLeParolePresenti = (a: string, b: string): boolean => {
  const paroleA = a.split(' ').filter(p => p.length >= 3);
  if (paroleA.length < 2) return false;
  return paroleA.every(p => b.includes(p));
};

const paroleEscluseComuni = ['srl', 'spa', 'snc', 'sas', 'srls', 'coop', 'condominio', 'residence', 'impresa', 'lavori', 'servizi', 'studio', 'di', 'del', 'da', 'in', 'con', 'su', 'per', 'a', 'e', 'o', 'and'];

// Verifica se almeno una parola significativa e distintiva (≥3 char) di 'a' compare in 'b' come parola intera
const haParolaComuneSignificativa = (a: string, b: string): boolean => {
  const paroleA = a.split(' ').filter(p => p.length >= 3 && !paroleEscluseComuni.includes(p));
  if (paroleA.length === 0) return false;
  const paroleB = b.split(' ');
  return paroleA.some(p => paroleB.includes(p));
};

export const abbinaCantiereDaProgetto = (
  testoPuntaNet: string,
  projects: Project[],
  isExpense?: boolean
): { cantiere: string; score: number } | null => {
  if (!testoPuntaNet || projects.length === 0) return null;

  const normalizza = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const raw = normalizza(testoPuntaNet);
  if (!raw) return null;

  let bestMatch: { cantiere: string; score: number } | null = null;

  for (const p of projects) {
    const nomeCantiere = normalizza(p.name);
    const clienteCantiere = normalizza(p.client);
    const intestatariCantiere = (p.intestatari || []).map(i => normalizza(i.nome));

    // 1. Prova corrispondenza con il nome del cantiere
    const matchNome = fuzzyMatchCantiere(testoPuntaNet, [p.name]);
    if (matchNome && matchNome.score > (bestMatch?.score ?? 0)) {
      bestMatch = { cantiere: p.name, score: matchNome.score };
    }

    // Skip client and intestatari matching for expenses to avoid matching subcontractors to client projects of the same name
    if (!isExpense) {
      // 2. Prova corrispondenza con il nome del cliente principale
      //    Usa word-set matching per gestire inversione nome/cognome e fallback parziale
      if (clienteCantiere.length > 2) {
        const matchDiretto = raw.includes(clienteCantiere) || clienteCantiere.includes(raw);
        const matchParole = tutteLeParolePresenti(clienteCantiere, raw) || tutteLeParolePresenti(raw, clienteCantiere);
        const matchParziale = haParolaComuneSignificativa(clienteCantiere, raw);
        
        if (matchDiretto || matchParole || matchParziale) {
          const score = matchDiretto ? 85 : (matchParole ? 80 : 70);
          if (score > (bestMatch?.score ?? 0)) {
            bestMatch = { cantiere: p.name, score };
          }
        }
      }

      // 3. Prova corrispondenza con gli intestatari delle fatture
      //    Usa word-set matching per gestire inversione nome/cognome e fallback parziale
      for (const nomeIntestatario of intestatariCantiere) {
        if (nomeIntestatario.length > 2) {
          const matchDiretto = raw.includes(nomeIntestatario) || nomeIntestatario.includes(raw);
          const matchParole = tutteLeParolePresenti(nomeIntestatario, raw) || tutteLeParolePresenti(raw, nomeIntestatario);
          const matchParziale = haParolaComuneSignificativa(nomeIntestatario, raw);
          
          if (matchDiretto || matchParole || matchParziale) {
            const score = matchDiretto ? 80 : (matchParole ? 75 : 68);
            if (score > (bestMatch?.score ?? 0)) {
              bestMatch = { cantiere: p.name, score };
            }
          }
        }
      }
    }

    // 4. Prova corrispondenza con la location (Gap G)
    if (p.location && p.location.trim().length > 2) {
      const locNorm = normalizza(p.location);
      const matchDiretto = raw.includes(locNorm) || locNorm.includes(raw);
      const matchParole = tutteLeParolePresenti(locNorm, raw) || tutteLeParolePresenti(raw, locNorm);
      if (matchDiretto || matchParole) {
        const score = 65;
        if (score > (bestMatch?.score ?? 0)) {
          bestMatch = { cantiere: p.name, score };
        }
      }
    }
  }

  return bestMatch && bestMatch.score >= 55 ? bestMatch : null;
};

// ─── PARSER FILE BANCA (Cartel1.xlsx) ────────────────────────────

export const findHeaderIndex = (headers: string[], keywords: string[], fallback: number, searchFromRight: boolean = false): number => {
  if (searchFromRight) {
    for (let i = headers.length - 1; i >= 0; i--) {
      const h = String(headers[i] ?? '').toUpperCase();
      if (keywords.some(kw => h.includes(kw))) {
        return i;
      }
    }
  } else {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] ?? '').toUpperCase();
      if (keywords.some(kw => h.includes(kw))) {
        return i;
      }
    }
  }
  return fallback;
};

export const estraiNumeroFattura = (descrizione: string, tipoMovimento: 'FEP' | 'FEA'): string | undefined => {
  if (tipoMovimento === 'FEP') {
    const m = descrizione.match(/(?:[Pp]agamento|[Rr]ilevata)?\s*FEP\s+n\.\s*([\w\/\-\.]+)/i) ||
              descrizione.match(/FEP\s+([\w\/\-\.]+)/i);
    if (m) return m[1].trim();
  } else if (tipoMovimento === 'FEA') {
    let m = descrizione.match(/[Ii]ncasso\s+FEA\s+n\.\s*(\d+)\s+(\d{4})/i) ||
            descrizione.match(/FEA\s+n\.\s*(\d+)\/(\d{4})/i) ||
            descrizione.match(/FEA\s+(\d+)\/(\d{4})/i);
    if (m) {
      return `${m[1]}/${m[2]}`;
    }
    m = descrizione.match(/(?:[Ff]attura|[Ff]att\.?|[Nn]\.?)\s*(\d{1,4})\/(\d{4})/i);
    if (m) {
      return `${m[1]}/${m[2]}`;
    }
  }
  return undefined;
};

export const validaFileBanca = (workbook: XLSX.WorkBook): void => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error("Il file Banca selezionato è vuoto o non valido.");
  
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length === 0) throw new Error("Il file Banca selezionato non contiene righe.");

  const headers = (rows[0] ?? []).map(h => String(h ?? '').trim().toUpperCase());
  const hasFlag = headers.some(h => ['CONTO', 'B/I', 'B O I', 'FLAG', 'BANCA'].some(kw => h.includes(kw)));
  const hasEntrate = headers.some(h => ['ENTRAT', 'AVERE', 'IMPORTI ENTRATE'].some(kw => h.includes(kw)));
  const hasUscite = headers.some(h => ['USCIT', 'DARE', 'IMPORTI USCITE'].some(kw => h.includes(kw)));

  if (!hasFlag || (!hasEntrate && !hasUscite)) {
    throw new Error("Il file Banca selezionato non sembra essere nel formato corretto. Verifica che contenga i movimenti con flag conto (es. colonna Banca o B/I).");
  }
};

export const validaFileFEP = (workbook: XLSX.WorkBook): void => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error("Il file Uscite (FEP) selezionato è vuoto o non valido.");

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length === 0) throw new Error("Il file Uscite (FEP) selezionato non contiene righe.");

  const hasFEP = rows.some(row => {
    if (!row) return false;
    return row.some(cell => {
      const cellStr = String(cell ?? '').trim().toUpperCase();
      return cellStr.startsWith('FEP');
    });
  });

  if (!hasFEP) {
    throw new Error("Il file Uscite (FEP) selezionato non contiene fatture FEP valide.");
  }
};

export const validaFileFEA = (workbook: XLSX.WorkBook, label: string = "Entrate (FEA)"): void => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error(`Il file ${label} selezionato è vuoto o non valido.`);

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length === 0) throw new Error(`Il file ${label} selezionato non contiene righe.`);

  const hasFEA = rows.some(row => {
    if (!row) return false;
    return row.some(cell => {
      const cellStr = String(cell ?? '').trim().toUpperCase();
      return cellStr.startsWith('FEA') || cellStr.startsWith('EMESSA FEA') || cellStr.includes('FEA N.');
    });
  });

  if (!hasFEA) {
    throw new Error(`Il file ${label} selezionato non contiene fatture FEA valide.`);
  }
};

export const parseBancaExcel = (workbook: XLSX.WorkBook): PuntaNetRiga[] => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const risultati: PuntaNetRiga[] = [];
  if (rows.length === 0) return risultati;

  const headers = (rows[0] ?? []).map(h => String(h ?? '').trim().toUpperCase());
  const indexData = findHeaderIndex(headers, ['DATA'], 0);
  const indexDesc = findHeaderIndex(headers, ['DESCRIZIONE', 'CAUSALE'], 2);
  const indexEntrate = findHeaderIndex(headers, ['ENTRAT', 'AVERE', 'IMPORTI ENTRATE'], 6, true);
  const indexUscite = findHeaderIndex(headers, ['USCIT', 'DARE', 'IMPORTI USCITE'], 7, true);
  const indexFlag = findHeaderIndex(headers, ['CONTO', 'B/I', 'B O I', 'FLAG', 'BANCA'], 8);

  const maxIndexRequired = Math.max(indexData, indexDesc, indexEntrate, indexUscite, indexFlag);

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length <= maxIndexRequired) continue;

    const flag = String(r[indexFlag] ?? '').trim().toUpperCase();
    if (flag !== 'B' && flag !== 'I') continue;

    const eBanca = safeParseFloat(r[indexEntrate]);
    const uBanca = safeParseFloat(r[indexUscite]);

    const isEntrata = !isNaN(eBanca) && eBanca > 0;
    const isUscita = !isNaN(uBanca) && uBanca > 0;

    if (!isEntrata && !isUscita) continue;

    const descrizione = String(r[indexDesc] ?? '').trim();
    if (!descrizione) continue;

    let data: Date;
    try {
      const val = r[indexData];
      if (val instanceof Date) {
        data = val;
      } else if (typeof val === 'number') {
        data = new Date((val - 25569) * 86400 * 1000);
      } else {
        const str = String(val).trim();
        const itMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (itMatch) {
          const [_, d, m, y] = itMatch;
          data = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d)));
        } else {
          data = new Date(str);
        }
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
    const descUpper = descrizione.toUpperCase();
    if (descUpper.includes('PAGAMENTO FEP') || descUpper.includes('RILEVATA FEP')) {
      riga.tipoMovimento = 'FEP';
      riga.numeroFattura = estraiNumeroFattura(descrizione, 'FEP');
    } else if (descUpper.includes('INCASSO FEA') || descUpper.includes('FEA') || descUpper.includes('FATTURA ATTIVA')) {
      riga.tipoMovimento = 'FEA';
      riga.numeroFattura = estraiNumeroFattura(descrizione, 'FEA');
    } else if (descUpper.includes('NEP')) {
      riga.tipoMovimento = 'NEP';
      // Estrae eventuale riferimento FEP per Gap C
      const m = descrizione.match(/FEP\s+n\.\s*([\w\/\-\.]+)/i) || descrizione.match(/FEP\s+([\w\/\-\.]+)/i);
      if (m) {
        riga.numeroFattura = m[1].trim();
      }
    }

    risultati.push(riga);
  }

  return risultati;
};

// ─── PARSER DETTAGLIO FEP (costi_Cartel1.xlsx) ───────────────────

export const parseDettaglioFEP = (workbook: XLSX.WorkBook): Map<string, DettFEP> => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) return new Map();
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const map = new Map<string, DettFEP>();

  interface TempFEP extends DettFEP {
    cantieriSomme: Record<string, number>;
    tipologieSomme: Record<string, number>;
    categorieSomme: Record<string, number>;
    aliquoteSet: Set<string>;
  }

  let current: TempFEP | null = null;

  const salvaCorrente = () => {
    if (current) {
      // Trova il cantiere dominante
      let cantiereDominante = '';
      let maxCantiereImp = -Infinity;
      for (const [c, imp] of Object.entries(current.cantieriSomme)) {
        if (imp > maxCantiereImp) {
          maxCantiereImp = imp;
          cantiereDominante = c;
        }
      }
      current.cantiere = cantiereDominante;

      // Trova la tipologia dominante
      let tipologiaDominante = '';
      let maxTipologiaImp = -Infinity;
      for (const [t, imp] of Object.entries(current.tipologieSomme)) {
        if (imp > maxTipologiaImp) {
          maxTipologiaImp = imp;
          tipologiaDominante = t;
        }
      }
      current.tipologia = tipologiaDominante;

      // Trova la categoria dominante
      let categoriaDominante = '';
      let maxCategoriaImp = -Infinity;
      for (const [cat, imp] of Object.entries(current.categorieSomme)) {
        if (imp > maxCategoriaImp) {
          maxCategoriaImp = imp;
          categoriaDominante = cat;
        }
      }
      current.categoria = categoriaDominante;

      // Verifica aliquote miste
      const aliquoteSignificative = Array.from(current.aliquoteSet).filter(a => a && a !== 'X99');
      current.aliquoteMiste = aliquoteSignificative.length > 1;

      // Assegna codIva dominante o prima non vuota
      if (aliquoteSignificative.length > 0) {
        current.codIva = aliquoteSignificative[0];
      }

      // Estrai le proprietà di DettFEP da salvare
      const { cantieriSomme, tipologieSomme, categorieSomme, aliquoteSet, ...dett } = current;
      map.set(dett.numero, dett);
    }
  };

  if (rows.length === 0) return map;

  const headers = (rows[0] ?? []).map(h => String(h ?? '').trim().toUpperCase());
  let fallbackDesc = 1;
  if (!headers[1] && !headers[2]) {
    fallbackDesc = 2;
  }
  const indexDesc = findHeaderIndex(headers, ['DESCRIZIONE', 'DETTAGLIO', 'CAUSALE', 'FATTURA'], fallbackDesc);
  const indexImp = findHeaderIndex(headers, ['IMPONIBILE', 'VALORE'], 6);
  const indexTax = findHeaderIndex(headers, ['IMPOSTE', 'IVA IMPORTO', 'IMPOSTA'], 7);
  const indexTot = findHeaderIndex(headers, ['TOTALE', 'LORDO'], 8);
  const indexCodIva = findHeaderIndex(headers, ['COD. IVA', 'COD IVA', 'IVA COD', 'ALIQUOTA'], 5);
  const indexCantiere = findHeaderIndex(headers, ['CANTIERE', 'PROGETTO'], 11);
  const indexTipologia = findHeaderIndex(headers, ['TIPOLOGIA', 'TIPO SPESA'], 10);
  const indexCategoria = findHeaderIndex(headers, ['CATEGORIA', 'VOCE'], 9);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const desc = String(row[indexDesc] ?? '').trim();

    if (desc.startsWith('FEP')) {
      salvaCorrente();

      const numMatch = desc.match(/^FEP\s+([\S]+)/i);
      const forMatch = desc.match(/del\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+-\s+\(Prot/i);

      if (numMatch) {
        let dataDocumento: string | undefined = undefined;
        const dateMatch = desc.match(/del\s+(\d{2})\/(\d{2})\/(\d{4})/i);
        if (dateMatch) {
          dataDocumento = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }

        current = {
          numero: numMatch[1].trim(),
          fornitore: forMatch ? forMatch[1].trim() : '',
          imponibile: 0,
          imposte: 0,
          totale: 0,
          codIva: '',
          cantiere: '',
          tipologia: '',
          categoria: '',
          aliquoteMiste: false,
          dataDocumento,
          cantieriSomme: {},
          tipologieSomme: {},
          categorieSomme: {},
          aliquoteSet: new Set<string>()
        };
      } else {
        current = null;
      }
      continue;
    }

    if (!current) continue;

    const imp = safeParseFloat(row[indexImp]);
    const tax = safeParseFloat(row[indexTax]);
    const tot = safeParseFloat(row[indexTot]);
    const codIva = String(row[indexCodIva] ?? '').trim();
    const cantiere = String(row[indexCantiere] ?? '').trim();
    const tipologia = String(row[indexTipologia] ?? '').trim();
    const categoria = String(row[indexCategoria] ?? '').trim();

    current.imponibile += (imp || 0);
    current.imposte += (tax || 0);
    current.totale += (tot || 0);

    if (codIva && codIva !== 'X99') {
      current.aliquoteSet.add(codIva);
    }

    if (cantiere) {
      current.cantieriSomme[cantiere] = (current.cantieriSomme[cantiere] ?? 0) + imp;
    }
    if (tipologia) {
      current.tipologieSomme[tipologia] = (current.tipologieSomme[tipologia] ?? 0) + imp;
    }
    if (categoria) {
      current.categorieSomme[categoria] = (current.categorieSomme[categoria] ?? 0) + imp;
    }
  }

  salvaCorrente();
  return map;
};

// ─── PARSER DETTAGLIO FEA (entrate_Cartel1.xlsx) ─────────────────
// Versione multi-riga: aggrega TUTTE le righe di dettaglio per fattura
// (in precedenza leggeva solo la prima riga successiva all'intestazione).

export const parseDettaglioFEA = (workbook: XLSX.WorkBook): Map<string, DettFEA> => {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) return new Map();
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const map = new Map<string, DettFEA>();

  // Usiamo una macchina a stati: quando troviamo un'intestazione FEA creiamo
  // un record corrente e accumuliamo tutte le righe di dettaglio successive
  // finché non troviamo la prossima intestazione FEA o la fine del file.
  let current: (DettFEA & { _key: string }) | null = null;

  const salvaCorrente = () => {
    if (current) {
      const { _key, ...dett } = current;
      map.set(_key, dett);
    }
  };

  if (rows.length === 0) return map;

  const headers = (rows[0] ?? []).map(h => String(h ?? '').trim().toUpperCase());
  let fallbackDesc = 1;
  if (!headers[1] && !headers[2]) {
    fallbackDesc = 2;
  }
  const indexDesc = findHeaderIndex(headers, ['DESCRIZIONE', 'DETTAGLIO', 'CAUSALE', 'FATTURA'], fallbackDesc);
  const indexImp = findHeaderIndex(headers, ['IMPONIBILE', 'VALORE'], 6);
  const indexTot = findHeaderIndex(headers, ['TOTALE', 'LORDO'], 8);
  const indexCodIva = findHeaderIndex(headers, ['COD. IVA', 'COD IVA', 'IVA COD', 'ALIQUOTA'], 5);
  const indexCantiere = findHeaderIndex(headers, ['CANTIERE', 'PROGETTO'], 11);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const desc = String(row[indexDesc] ?? '').trim();

    const isFeaHeader = desc.match(/^FEA\s+\d+\/\d{4}/i) || 
                        desc.match(/^Emessa\s+FEA\s+n\.\s*(\d+)\s+(\d{4})/i) ||
                        desc.match(/^FEA\s+n\.\s*(\d+)\/(\d{4})/i);

    // Riga intestazione FEA: "FEA 12/2025 del DD/MM/YYYY NomeCliente" or "Emessa FEA..."
    if (isFeaHeader) {
      salvaCorrente();

      let match = desc.match(/^FEA\s+(\d+)\/(\d{4})/i);
      let cliMatch = desc.match(/del\s+\d{2}\/\d{2}\/\d{4}\s+(.+)$/i);
      
      if (!match) {
        match = desc.match(/^Emessa\s+FEA\s+n\.\s*(\d+)\s+(\d{4})/i);
        if (match) {
          const yearIndex = desc.indexOf(match[2]) + match[2].length;
          cliMatch = [null, desc.slice(yearIndex).trim()];
        }
      }
      
      if (!match) {
        match = desc.match(/^FEA\s+n\.\s*(\d+)\/(\d{4})/i);
        if (match) {
          const slashIndex = desc.indexOf('/') + 5;
          cliMatch = [null, desc.slice(slashIndex).trim()];
        }
      }

      if (match) {
        let dataDocumento: string | undefined = undefined;
        const dateMatch = desc.match(/del\s+(\d{2})\/(\d{2})\/(\d{4})/i);
        if (dateMatch) {
          dataDocumento = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }

        const indexBancaConto = findHeaderIndex(headers, ['BANCA', 'CONTO', 'B/I'], -1);
        const isPrimaNota = indexBancaConto !== -1;
        const indexAmount = findHeaderIndex(headers, ['IMPORTO', 'ENTRATE', 'ENTRAT', 'VALORE', 'TOTALE'], 5);
        const rowAmount = isPrimaNota ? safeParseFloat(row[indexAmount]) : 0;
        current = {
          _key: `${match[1]}/${match[2]}`,
          numero: match[1],
          anno: match[2],
          cliente: cliMatch ? cliMatch[1].trim() : '',
          imponibile: rowAmount,
          codIva: '',
          totale: rowAmount,
          cantiere: '',
          descrizioneDettaglio: isPrimaNota ? desc : '',
          dataDocumento
        };
        if (isPrimaNota) {
          salvaCorrente();
          current = null;
        }
      } else {
        current = null;
      }
    } else if (current) {
      // Riga di dettaglio: accumula valori
      const imp = safeParseFloat(row[indexImp]);
      const tot = safeParseFloat(row[indexTot]);
      const codIva = String(row[indexCodIva] ?? '').trim();
      const cantiere = String(row[indexCantiere] ?? '').trim();
      const dettaglio = String(row[indexDesc] ?? '').trim();

      current.imponibile += (imp || 0);
      current.totale += (tot || 0);
      // Prima aliquota IVA non vuota e non placeholder
      if (!current.codIva && codIva && codIva !== 'X99') current.codIva = codIva;
      // Primo cantiere non vuoto
      if (!current.cantiere && cantiere) current.cantiere = cantiere;
      // Accumula descrizione dettaglio (per keyword SAL/ACCONTO/SALDO)
      if (dettaglio) {
        current.descrizioneDettaglio = current.descrizioneDettaglio
          ? `${current.descrizioneDettaglio} | ${dettaglio}`
          : dettaglio;
      }
    }
  }

  salvaCorrente();
  return map;
};

// ─── DEDUPLICAZIONE ──────────────────────────────────────────────

export const isDuplicato = (
  riga: PuntaNetRiga,
  esistenti: Transaction[],
  indexes?: ExistingTransactionIndexes
): { duplicato: boolean; livello: 1 | 2 | 3 | null; transazioneEsistente?: Transaction } => {
  if (esistenti.length === 0) return { duplicato: false, livello: null };

  const dataStr = riga.data.toISOString().split('T')[0];
  const importoCent = Math.round(riga.importo * 100);

  // Livello 1: Numero fattura
  if (riga.tipoMovimento === 'FEP' && riga.numeroFattura) {
    const fepNumUpper = riga.numeroFattura.toUpperCase();
    if (indexes?.fepMap) {
      const list = indexes.fepMap.get(fepNumUpper) || [];
      const trovata = list.find(tx =>
        tx.type === 'EXPENSE' &&
        tx.description.toUpperCase().includes(fepNumUpper) &&
        Math.abs(tx.amount - riga.importo) < 0.05
      );
      if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
    } else {
      const trovata = esistenti.find(tx =>
        tx.type === 'EXPENSE' &&
        tx.description.toUpperCase().includes(fepNumUpper) &&
        Math.abs(tx.amount - riga.importo) < 0.05
      );
      if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
    }
  } else if (riga.tipoMovimento === 'FEA' && riga.numeroFattura) {
    const feaNumUpper = riga.numeroFattura.toUpperCase();
    if (indexes?.feaMap) {
      const list = indexes.feaMap.get(feaNumUpper) || [];
      const trovata = list.find(tx =>
        tx.type === 'INCOME' &&
        tx.description.toUpperCase().includes('FEA') &&
        tx.description.toUpperCase().includes(feaNumUpper) &&
        Math.abs(tx.amount - riga.importo) < 0.05
      );
      if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
    } else {
      const trovata = esistenti.find(tx =>
        tx.type === 'INCOME' &&
        tx.description.toUpperCase().includes('FEA') &&
        tx.description.toUpperCase().includes(feaNumUpper) &&
        Math.abs(tx.amount - riga.importo) < 0.05
      );
      if (trovata) return { duplicato: true, livello: 1, transazioneEsistente: trovata };
    }
  }

  // Livello 2: Tripla chiave
  const descPrefix = riga.descrizione.toUpperCase().slice(0, 15);
  if (indexes?.dateAmountDescMap) {
    const key = `${dataStr}|${importoCent}|${descPrefix}`;
    const list = indexes.dateAmountDescMap.get(key) || [];
    if (list.length > 0) {
      return { duplicato: true, livello: 2, transazioneEsistente: list[0] };
    }
  } else {
    const trovata = esistenti.find(tx =>
      tx.date === dataStr &&
      Math.round(tx.amount * 100) === importoCent &&
      tx.description.toUpperCase().slice(0, 15) === descPrefix
    );
    if (trovata) return { duplicato: true, livello: 2, transazioneEsistente: trovata };
  }

  // Livello 3: Solo importo + data, per transazioni ALTRO, solo se esiste già una transazione Punta Net in quel giorno (Gap J)
  if (riga.tipoMovimento === 'ALTRO') {
    const type = riga.tipo === 'INCOME' ? 'INCOME' : 'EXPENSE';
    if (indexes?.dateAmountTypeMap) {
      const key = `${dataStr}|${importoCent}|${type}`;
      const list = indexes.dateAmountTypeMap.get(key) || [];
      const trovataL3 = list.find(tx => tx.sourceRef?.startsWith('Punta Net'));
      if (trovataL3) return { duplicato: true, livello: 3, transazioneEsistente: trovataL3 };
    } else {
      const trovataL3 = esistenti.find(tx =>
        tx.date === dataStr &&
        Math.round(tx.amount * 100) === importoCent &&
        tx.type === type &&
        tx.sourceRef?.startsWith('Punta Net')
      );
      if (trovataL3) return { duplicato: true, livello: 3, transazioneEsistente: trovataL3 };
    }
  }

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
  if (t.includes('sub appalti su cantier') || t.includes('subappalti su cantier') || t.includes('subappalto su cantier') || t.includes('sub app alto su cantier') || t.includes('subappalti cantier')) {
    return '[FORNITORI] Subappalti su Cantieri';
  }
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

const matchesPattern = (text: string, pattern: string): boolean => {
  const normalizza = (s: string) =>
    s.toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const t = normalizza(text);
  const p = normalizza(pattern);
  if (!t.includes(p)) return false;
  // Per pattern molto corti (es. < 5 caratteri), richiediamo che sia una parola intera
  if (p.length < 5) {
    const escaped = p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp('\\b' + escaped + '\\b', 'i');
    return regex.test(t);
  }
  return true;
};

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
    /spese bonifico|spese per bonifico|spese rid|spese per rid|addebito rid|spese per sepa|spese sepa|commissione|commissioni|cbill|imposta di bollo|spese tenuta conto|canone home banking|estratto conto|competenze|spese di scritturazione/i.test(descLower) ||
    /spese bonifico|spese per bonifico|spese rid|spese per rid|addebito rid|spese per sepa|spese sepa|commissione|commissioni|cbill|imposta di bollo|spese tenuta conto|canone home banking|estratto conto|competenze|spese di scritturazione/i.test(entLower)
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

  // Automazione Edilcassa (Ufficio vs Operativi)
  if (/edilcassa/i.test(descLower) || /edilcassa/i.test(entLower)) {
    const isOperativi = /udine|\+ udine/i.test(descLower) || /udine|\+ udine/i.test(entLower);
    return {
      categoria: isOperativi ? '[PERSONALE] Contributi Dipendenti Operativi' : '[PERSONALE] Contributi Dipendenti Ufficio',
      ceType: isOperativi ? 'costo_variabile' : 'costo_fisso',
      confidenza: 'alta',
      matchKey: 'automazione edilcassa',
      vatRateSuggerito: 0,
      vatRateNota: 'Contributi Edilcassa — esente IVA'
    };
  }

  // Automazione Generica Contributi (INPS/F24)
  if (/contributi/i.test(descLower) || /contributi/i.test(entLower)) {
    const isUfficio = /ufficio|socio|soci/i.test(descLower) || /ufficio|socio|soci/i.test(entLower);
    return {
      categoria: isUfficio ? '[PERSONALE] Contributi Dipendenti Ufficio' : '[PERSONALE] Contributi Dipendenti Operativi',
      ceType: isUfficio ? 'costo_fisso' : 'costo_variabile',
      confidenza: 'alta',
      matchKey: 'automazione contributi',
      vatRateSuggerito: 0,
      vatRateNota: 'Contributi previdenziali — esente IVA'
    };
  }


  // Automazione Mutui, Rate, Interessi e Derivati
  if (/mutuo|finanziamento|contratt.*derivat|differenzial.*tass/i.test(descLower) || /mutuo|finanziamento|contratt.*derivat|differenzial.*tass/i.test(entLower)) {
    const isInteressi = /interess|solo interess|differenzial|commission/i.test(descLower) || /interess|solo interess|differenzial|commission/i.test(entLower);
    return {
      categoria: isInteressi ? '[FINANZA] Interessi Passivi Finanziamenti' : '[FINANZA] Quota Capitale Rate Finanziamenti',
      ceType: isInteressi ? 'onere_finanziario' : 'solo_cashflow',
      confidenza: 'alta',
      matchKey: 'automazione mutuo/finanziamento',
      vatRateSuggerito: 0,
      vatRateNota: 'Movimento finanziario — fuori campo IVA'
    };
  }

  // Automazione Ritenute Fiscali su Bonifici (Entrate/Uscite)
  if (/ritenuta fiscale su bonifico|ritenuta su bonifico|dedotta ritenuta/i.test(descLower) || /ritenuta fiscale su bonifico|ritenuta su bonifico|dedotta ritenuta/i.test(entLower)) {
    return {
      categoria: riga.tipo === 'INCOME' ? '[FISCO] Ritenute Subite su Incassi' : '[FISCO] Ritenute su Bonifici (versate)',
      ceType: 'solo_cashflow',
      confidenza: 'alta',
      matchKey: 'automazione ritenute su bonifico',
      vatRateSuggerito: 0,
      vatRateNota: 'Ritenuta su bonifico — fuori campo IVA'
    };
  }


  // Automazione Carburanti / Gasolio
  if (/gasolio|carburant/i.test(descLower) || /gasolio|carburant/i.test(entLower)) {
    return {
      categoria: '[CANTIERE] Carburanti',
      ceType: 'costo_variabile',
      confidenza: 'alta',
      matchKey: 'automazione carburanti',
      vatRateSuggerito: 22,
      vatRateNota: 'Carburante — aliquota 22%'
    };
  }

  // Automazione Assicurazioni e Polizze (Mezzi vs Cantieri vs Generali)
  if (/unipol|generali|zurich|polizza|assicur/i.test(descLower) || /unipol|generali|zurich|polizza|assicur/i.test(entLower)) {
    const isMezzi = /escavatore|terna|furgone|camion|daily|mercedes|jeep|veicolo|mezzi|mezzo|auto|tg/i.test(descLower) || /escavatore|terna|furgone|camion|daily|mercedes|jeep|veicolo|mezzi|mezzo|auto|tg/i.test(entLower);
    const isCantiere = /cantiere|cantieri|postuma|decennale|car/i.test(descLower) || /cantiere|cantieri|postuma|decennale|car/i.test(entLower);
    let categoria = '[COMPLIANCE] Assicurazioni Generali';
    let ceType = 'costo_fisso';
    if (isMezzi) {
      categoria = '[MEZZI] Assicurazione Mezzi e Bolli';
    } else if (isCantiere) {
      categoria = '[CANTIERE] Assicurazione Cantieri';
      ceType = 'costo_variabile';
    }
    return {
      categoria,
      ceType,
      confidenza: 'alta',
      matchKey: 'automazione assicurazioni',
      vatRateSuggerito: 0,
      vatRateNota: 'Polizza assicurativa — esente IVA art.10'
    };
  }

  // Automazione Albo Gestori Ambientali
  if (/albo gestori|gestori ambientali/i.test(descLower) || /albo gestori|gestori ambientali/i.test(entLower)) {
    return {
      categoria: '[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)',
      ceType: 'costo_fisso',
      confidenza: 'alta',
      matchKey: 'automazione albo gestori',
      vatRateSuggerito: 0,
      vatRateNota: 'Bollettino albo gestori — esente IVA'
    };
  }

  // Automazione Lottizzazioni
  if (/lottizz/i.test(descLower) || /lottizz/i.test(entLower)) {
    return {
      categoria: '[CONSULENZE] Professionisti Esterni di Cantiere',
      ceType: 'costo_variabile',
      confidenza: 'alta',
      matchKey: 'automazione lottizzazione',
      vatRateSuggerito: 22,
      vatRateNota: 'Prestazione professionale — aliquota 22%'
    };
  }

  // Automazione Risarcimenti Danni e Rimborsi Assicurativi
  if (/risarcimento danni/i.test(descLower) || /risarcimento danni/i.test(entLower)) {
    return {
      categoria: '[STRAORDINARI] Imprevisti Straordinari',
      ceType: 'costo_fisso',
      confidenza: 'alta',
      matchKey: 'automazione risarcimento danni',
      vatRateSuggerito: 0,
      vatRateNota: 'Risarcimento danni — esente IVA'
    };
  }
  if (/accredito.*assicurazion/i.test(descLower) || /accredito.*assicurazion/i.test(entLower)) {
    return {
      categoria: '[RIMBORSI] Rimborsi Assicurativi',
      ceType: 'ricavo_altro',
      confidenza: 'alta',
      matchKey: 'automazione rimborsi assicurativi',
      vatRateSuggerito: 0,
      vatRateNota: 'Rimborso da assicurazione — fuori campo IVA'
    };
  }

  // Ricariche Prepagate e Arrotondamenti
  if (/ricarica prepagata/i.test(descLower) || /ricarica prepagata/i.test(entLower)) {
    return {
      categoria: 'Altro / Non Classificato',
      ceType: 'solo_cashflow',
      confidenza: 'alta',
      matchKey: 'automazione ricarica prepagata',
      vatRateSuggerito: 0,
      vatRateNota: 'Giroconto / Ricarica prepagata'
    };
  }
  if (/arrotondamento/i.test(descLower) || /arrotondamento/i.test(entLower)) {
    return {
      categoria: '[FINANZA] Commissioni e Bolli Bancari',
      ceType: 'onere_finanziario',
      confidenza: 'alta',
      matchKey: 'automazione arrotondamento',
      vatRateSuggerito: 0,
      vatRateNota: 'Arrotondamento centesimi'
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

  // Ordina le regole BUILTIN per lunghezza del pattern decrescente per far vincere i pattern più specifici
  const regoleOrdinate = [...REGOLE_BUILTIN].sort((a, b) => b.pattern.length - a.pattern.length);

  for (const r of regoleOrdinate) {
    if (matchesPattern(riga.entity, r.pattern)) {
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
  { pattern: /imposta di bollo|spese tenuta conto|canone home banking|spese bonifico|spese rid|spese per rid|addebito rid|spese per sepa|spese sepa|commissione|commissioni|cbill/i, aliquota: 0, nota: 'Spesa bancaria — fuori campo IVA' },
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
    '[CANTIERE] Caparra Confirmatoria',
  ].includes(categoria)) return 0;
  if ([
    '[COMPLIANCE] Visite Mediche Dipendenti',
  ].includes(categoria)) return 4;
  if ([
    '[CANTIERE] SAL — Stato Avanzamento Lavori',
    '[CANTIERE] Saldo Finale Commessa',
    '[CANTIERE] Manutenzioni e Piccoli Lavori',
    '[PERSONALE] Subappalti Manodopera',
    '[FORNITORI] Subappalti su Cantieri',
    '[CANTIERE] Pranzi e Trasferte Cantiere',
    '[IMMOBILIARE] Vendita Immobili e Terreni',
    '[IMMOBILIARE] Affitti Attivi',
    '[CANTIERE] Anticipi da Clienti su Commessa',
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
  importSessionId?: string,
  invoiceDate?: string
): Transaction => {
  const rate = vatRate ?? 0;
  const netAmount = riga.importo / (1 + rate / 100);
  return {
    id: uuidv4(),
    date: riga.data.toISOString().split('T')[0],
    description: riga.descrizione,
    amount: Math.round(netAmount * 100) / 100,
    type: riga.tipo === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
    category: categoria,
    ceType: ceType as any,
    vatRate: rate,
    sourceRef: sourceRef ?? `Punta Net · ${riga.data.toLocaleDateString('it-IT')}`,
    importSessionId,
    invoiceDate
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
  { pattern: "OFFICINA FANTIN", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
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
  { pattern: "MECHANICAL LINE SOLUTIONS", categoria: "[MEZZI] Riparazioni Macchinari Programmate", ceType: "costo_fisso", confidenza: "alta" },
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
  { pattern: "NASATO FEDERICA", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "OSTERIA ANTICA PESA DI CECCHETTO ALESSAN", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA ALL'ALPINO DI CORRO' RENATO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TRATTORIA DA CICCIO S.N.C. DI SPADETTO", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VECIA OSTERIA DEI MORINI S.N.C. DI MASON", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
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
  { pattern: "FIDEJUSSIONI COND. SUNFLOWER BON", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZURICH INSURANCE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ASSICURAZIONE POSTUMA GAZZOLA", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DEPOSITO VINCOLO POLIZZA FIDEJUSSORIA ZURICH", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NORMATEMPO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FIDEJUSSIONE SU APP.TO CECCHETTO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FIDEJUSSIONE DE ROSSI - HOP", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGENZIA ASOLO GENERALI FIDEJUSSIONE LAZZARI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POLIZZA FIDEJUSSORIA + CAR + POSTUMA COND. HOP", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA SERNAGIOTTO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA AGENZIA GENERALI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECENNALE POSTUMA ROSSANESE", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SALDO POLIZZA RCT/O CANTIERI", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SALDO PROROGA POLIZZA CAR", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZOGAJ CASTELFRANCO V.TO", categoria: "[CANTIERE] Assicurazione Cantieri", ceType: "costo_variabile", confidenza: "alta" },
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
  { pattern: "POLIZZA ASSIC. AMBIENTALE CON I.S.P.", categoria: "[COMPLIANCE] Assicurazioni Generali", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA CAMION MERCEDES UNIPOL", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA CAMION MAN GENERALI", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA FURGONE DAILY 7 POSTI TUA ASSICURAZIONI", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA ASSIC. ESCAVATORE", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE CAMION MERCEDES", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE FIORINO", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ASSICURAZIONE JEEP", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POLIZZA DAILY VECCHIO", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CAMION MERCEDES BENZ + CONDUCENTE", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ESCAVATORE TERNA TG ACJ212 - UNIPOLSAI", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SALDO POLIZZA FURGONE PEUGEOT BOXER", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SALDO POLIZZA RCA GENERALI ASSIC.", categoria: "[MEZZI] Assicurazione Mezzi e Bolli", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "IKON SRLS", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "IKON S.R.L.S.", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GESTIONE AMBIENTI", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "CNA FORMAZIONE SRL", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "LABORMEDICA", categoria: "[COMPLIANCE] Visite Mediche Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "LABOR MEDICA SRL", categoria: "[COMPLIANCE] Visite Mediche Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "STUDIO VISENTIN S.R.L", categoria: "[CONSULENZE] Commercialista", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MARTINOIA MARCO", categoria: "[CONSULENZE] Consulenti Fissi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "PANETTA GIOVANNA", categoria: "[CONSULENZE] Consulenti Fissi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "GEOCONSULT", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GEOCONSULT S.R.L.", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
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
  { pattern: "GAZZOLA EDOARDO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA ALESSIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA ARCH. ALESSIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BALDUCCI MARCO ANTONIO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRESSAN STEFANO ANDREA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LAZZARON ALESSANDRO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IPI INGEGNERIA PER L'INDUSTRIA S.R.L.", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ESNA SOCIETA' ORGANISMO DI ATTESTAZIONE", categoria: "[CONSULENZE] SOA e ISO", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VISENTIN ANDREA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "BELLINI SIMONE", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "TRONCON NICOLA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "MARTIGNAGO ILARIA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "SANTIN MATTIA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "CSERVENSCHI CRISTIAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FERRO EMILIO", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "KALOCI SOKOL", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MIHALI IOAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANDONÀ DENIS", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANDONA' DENIS", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONETTO CRISTIAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CO.I.M. CONSORZIO TRA IMPRESE MONTEBELLUNA", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "EDILCASSA VENETO + UDINE", categoria: "[PERSONALE] Contributi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NESIMOSKI SELMEDIN", categoria: "[PERSONALE] Collaboratori Fissi", ceType: "costo_studio", confidenza: "alta" },
  { pattern: "SAUCA PETRU MARIAN", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIEM EDILE", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SHIJAKU AZEM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BERISHA BLERIM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EUROEDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NEW EDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARKEDIL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARKEDIL S.R.L.", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COSTRUZIONI NADI SRLS", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FKF COSTRUZIONI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FKF COSTRUZIONI DI FEJZULOSKI KUJTIM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DM COSTRUZIONI SRL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CIELLE DI CAON", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MUCA EQREM", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TIMEXPERT S.A.S.DI TIMIS SANDU ADRIAN", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "WOOD TOP DI PILOTTO DARIO", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EUROCOSTRUZIONI SRLS", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAKNES SRL", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FEJZULOSKI EDIP", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "S.S. COSTRUZIONI E RESTAURI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SEFE COSTRUZIONI E RESTAURI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILSERRAJOTTO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILSERRAJOTTO  S.R.L.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FELTRIN T.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FELTRIN TARCISIO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "L'ARTIBENI DI FERRONATO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SUPERBETON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SUPERBETON SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARTUSO IMPIANTI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VIBETONPIAVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VIBETONPIAVE S.R.L.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CIDIENNE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CIDIENNE SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BMI ITALIA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZANUTTA SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CALCESTRUZZI LADANO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PALMARINI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CARNIELLO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CARNIELLO SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SAVIO MANUFATTI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPS SRL FERRAMENTA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPS S.R.L. SEMPLIFICATA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILE PEDEMONTANA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ANDREAZZA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ANDREAZZA SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARTUSO LEGNAMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARTUSO LEGNAMI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ACES SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BETONROSSI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COMIN COSTRUZIONI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SFEDIL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FERROBETON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BIN SISTEMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BIN SISTEMI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAZZERO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PELLIZZARI BUILDING", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PELLIZZARI BUILDING S.R.L.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TORRESAN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ZILIO NICO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONGIORNO ANTIFORNTUNISTICA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COFILOC", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "J & D FAVRETTO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "F.LLI BISOL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VUDAFIERI F.LLI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLSIDER", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRUNATO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RGM PROVE", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "A.A.A.M.P. ESTINTORI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "A.A.M.A.P. DI BRIOTTO ROBERTO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FORNACI GRIGOLIN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NOVALINEA ARREDO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ISOLEX", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STANGHELLINI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CAMINI DUMONT", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BELLOTTO LEGNAMI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALTO TREVIGIANO SERVIZI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALTO TREVIGIANO SERVIZI SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LA IDROFERRAMENTA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPM DALLA MORA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DMP DALLA MORA PREFABBRICATI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SD GROUP", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ROTHO BLASS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PANALEX", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AMR SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RR GROUP", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ARREDIL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CEMENTART", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NEWGIPS", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NEWGIPS TREVISO EDILIZIA SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PERI SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GHIAIE PONTE ROSSO SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SCHOECK ITALIA GMBH", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EPIU' SRL", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "F.LLI PIZZIOLO S.R.L.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DANIEL FABIO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "UNIPOLTECH S.P.A.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DUFERCO ENERGIA SPA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ENEL ENERGIA S.P.A.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALLIANZ FONDO PENSIONE DI MATTIA SANTIN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MUNARETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MUNARETTO PAVIMENTI S.A.S.", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLAR SYSTEM", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LATTONERIA ROSSANESE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LATTONERIA ROSSANESE SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ASOLO PAVIMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ASOLO PAVIMENTI SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IL FABBRO SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NART SONIA", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DECORGESSO SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GALLIAZZO IVANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN & GASPARETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN & GASPARETTO ELETTROIMPIANTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GEOSOLAR", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AGOSTINI SERGIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AEERRE COSTRUZIONI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONTE AMBIENTI ESTERNI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FALEGNAMERIA TRENTIN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "FALEGNAMERIA F.LLI TRENTIN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN FRANCESCO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DKH SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MASARO FABIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ROCCON SILVIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "POZZOBON SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "M.N. COSTRUZIONI SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILMULI DI ZOGAJ", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TERMOIDRAULICA G.SC.", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "G.SC. DI GATTO TARCISIO, SCREMIN VASCO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CBM MARTIGNAGO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TM TONIOLO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TM DI TONIOLO MASSIMO E C SNC", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TM TONIOLO MASSIMO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GANEO ADRIANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BS IMPIANTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "COLORDESIGN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "E.P. PONTEGGI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BONETTO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MIFTAROSKI FIKMET", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "METOPE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SERRAMENTI RUFFATO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IKON TECNOLOGY", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILMONASTIER", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PEDEMONTANA SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PEDEMONTANA SERRAMENTI SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SOLIGO DAMIANO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONTARIN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CONTARIN MAURO E C. S.A.S.", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DAMETTO SIMONE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DM POSA SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MORO SERRANDE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CETOS SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIULIANO COPERTURE SRLS", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NICOLA METAL DESIGN", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NICOLA METAL DESIGN S.R.L.", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LIBRA SERRAMENTI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PAESAGGI UMBRI CONSORZIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SBRISSA SEBASTIANO GIARDINI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MORETTO SCAVI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LILLO COPERTURE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALPAC", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALPAC S.R.L. UNIPERSONALE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILE COPERTURE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PIZZOLATO JODY", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDILLUX DI ABO GHAZALAH", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN COSTRUZIONI SRL", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STORGATO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
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
  { pattern: "ABACO COMUNI VARI", categoria: "[CANTIERE] Oneri Comunali, Abaco e Occupazioni", ceType: "costo_variabile", confidenza: "alta" },
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
  { pattern: "PREVEDI PER NICOLA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ADECCO ITALIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "AMMINISTRATORE LOTTIZZ. CONTEA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "RETE GROUP", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ACQUISIZIONE TERRENI O IMMOBILI", categoria: "[INVESTIMENTI] Acquisto Terreni per Sviluppo", ceType: "capex", confidenza: "alta" },
  { pattern: "TERRENO …....VIA OSPEDALE MB", categoria: "[INVESTIMENTI] Acquisto Terreni per Sviluppo", ceType: "capex", confidenza: "alta" },
  { pattern: "TERRENO …....VIALE VITTORIO V. TV", categoria: "[INVESTIMENTI] Acquisto Terreni per Sviluppo", ceType: "capex", confidenza: "alta" },
  { pattern: "TERRENO …....", categoria: "[INVESTIMENTI] Acquisto Terreni per Sviluppo", ceType: "capex", confidenza: "alta" },
  { pattern: "O VERSAMENTO CAPITALE SOCIALE", categoria: "[INVESTIMENTI] Investimento in Nuova Società", ceType: "capex", confidenza: "alta" },
  { pattern: "LIQUIDITA' IN CONTO CORRENTE", categoria: "[FINANZA] Commissioni e Bolli Bancari", ceType: "onere_finanziario", confidenza: "alta" },
  { pattern: "FEJZULOSKI EDIP", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LONDERO MARIO", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "S.S. COSTRUZIONI E RESTAURI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ONGARATO CRISTIAN", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MASSIMO RECINZIONI", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DANIEL FABIO", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARTINOIA MARCO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BALDUCCI MARCO ANTONIO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "STUDIO VISENTIN S.R.L", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "Osteria Antica Pesa", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IPI INGEGNERIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ALLIANZ FONDO PENSIONE", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "SEFE COSTRUZIONI", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "BRESSAN STEFANO ANDREA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "WOOD TOP", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MAKNES", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "MARENGON", categoria: "[INVESTIMENTI] Acquisto Attrezzature e Macchinari", ceType: "capex", confidenza: "alta" },
  { pattern: "DE LAGE LANDEN", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SCHOECK", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TVM RENT", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "LAZZARON ALESSANDRO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "PANETTA GIOVANNA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GHIAIE PONTE ROSSO", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IDEALSERVICE", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "ISEPPON", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "IKON S.R.L.S.", categoria: "[COMPLIANCE] Corsi Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "POSA PAV", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "A.A.M.A.P.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GIEM SRLS", categoria: "[PERSONALE] Subappalti Manodopera", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SANTIN MATTIA", categoria: "[PERSONALE] Stipendi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MIAHLI IOAN", categoria: "[PERSONALE] Stipendi Dipendenti Operativi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VECIA OSTERIA DEI MORINI", categoria: "[CANTIERE] Pranzi e Trasferte Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NESIMOSKI SELMEDIN", categoria: "[PERSONALE] Collaboratori Fissi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "VISENTIN RONNY", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "I BAMBINI DELLE FATE", categoria: "[STRAORDINARI] Volontariato e Donazioni", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "ESNA SOCIETA' ORGANISMO", categoria: "[CONSULENZE] SOA e ISO", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "TREVISO EDILIZIA", categoria: "[CANTIERE] Noleggi Attrezzature e Mezzi", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DPS S.R.L.", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "G.SC. DI GATTO TARCISIO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GAZZOLA ARCH. ALESSIA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "SERVIZI ECOLOGICI IMEC", categoria: "[CANTIERE] Rifiuti e Macerie", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "Labor Medica", categoria: "[COMPLIANCE] Visite Mediche Dipendenti", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "Falegnameria F.lli Trentin", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "iliad", categoria: "[STRUTTURA] Utenze Sedi", ceType: "costo_fisso", confidenza: "alta" },
  { pattern: "MORETTO GIUSEPPE", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "NASATO FEDERICA", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "EDIL MULI", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "GRIGOLIN", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "DALLA MORA", categoria: "[FORNITORI] Fornitori Materiali", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "TONIOLO MASSIMO", categoria: "[FORNITORI] Subappalti su Cantieri", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "VISENTIN MARCO", categoria: "[CONSULENZE] Professionisti Esterni di Cantiere", ceType: "costo_variabile", confidenza: "alta" },
  { pattern: "CO.I.M.", categoria: "[PERSONALE] Contributi Dipendenti Ufficio", ceType: "costo_fisso", confidenza: "alta" },
];
