import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { X, Upload, CheckCircle2, AlertCircle, FileSpreadsheet, 
         ChevronDown, ChevronUp, Loader2, Zap, Eye, EyeOff } from 'lucide-react';
import { Transaction, TransactionType, ImportSession } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─── COSTANTI ────────────────────────────────────────────────────

const MESI_LABEL = ['Gen','Feb','Mar','Apr','Mag','Giu',
                    'Lug','Ago','Set','Ott','Nov','Dic'];
const MESI_NOME  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

const CURRENCY = new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
});

// Colonna consuntivo entrate per mese (0-indexed)
const colEntrataCons = (m: number) => 4 + m * 5;
const colUscitaCons  = (m: number) => 6 + m * 5;

const safeParseFloat = (val: any): number => {
  if (typeof val === 'number') {
    if (!isFinite(val)) return NaN; // blocca Infinity, -Infinity e NaN da celle Excel con formule /0
    return val;
  }
  if (typeof val !== 'string') return NaN;
  let str = val.trim();
  if (str === '-' || str === '') return 0;
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    if (str.split(',').length > 2 || str.match(/,\d{3}$/)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }
  return parseFloat(str.replace(/[^\d.-]/g, ''));
};

// ─── MAPPATURA CATEGORIE EXCEL → APP ─────────────────────────────

const MAPPA_USCITE: Record<string, { categoria: string; ceType: string }> = {
  // Costi variabili cantiere
  'SUBAPPALTI MANODOPERA':        { categoria: '[CANTIERE] Subappalti Manodopera',           ceType: 'costo_variabile' },
  'SUBAPPALTI SU CANTIERI':       { categoria: '[FORNITORI] Subappalti su Cantieri',         ceType: 'costo_variabile' },
  'FORNITORI MATERIALI':          { categoria: '[CANTIERE] Fornitori Materiali',             ceType: 'costo_variabile' },
  'PROFESSIONISTI ESTERNI':       { categoria: '[CONSULENZE] Professionisti Esterni di Cantiere', ceType: 'costo_variabile' },
  'NOLEGGI':                      { categoria: '[CANTIERE] Noleggi Attrezzature e Mezzi',   ceType: 'costo_variabile' },
  'CARBURANTI':                   { categoria: '[CANTIERE] Carburanti',                      ceType: 'costo_variabile' },
  'RIFIUTI E MACERIE':            { categoria: '[CANTIERE] Rifiuti e Macerie',               ceType: 'costo_variabile' },
  'PRANZI':                       { categoria: '[CANTIERE] Pranzi e Trasferte Cantiere',    ceType: 'costo_variabile' },
  'ASSICURAZIONE CANTIERI':       { categoria: '[CANTIERE] Assicurazione Cantieri',         ceType: 'costo_variabile' },
  // Personale operativo
  'STIPENDI DIPENDENTI OPERATIVI':    { categoria: '[PERSONALE] Stipendi Dipendenti Operativi',   ceType: 'costo_variabile' },
  'CONTRIBUTI DIPENDENTI OPERATIVI':  { categoria: '[PERSONALE] Contributi Dipendenti Operativi', ceType: 'costo_variabile' },
  // Costi fissi struttura
  'STIPENDI DIPENDENTI UFFICIO':      { categoria: '[PERSONALE] Stipendi Dipendenti Ufficio',     ceType: 'costo_studio' },
  'CONTRIBUTI DIPENDENTI UFFICIO':    { categoria: '[PERSONALE] Contributi Dipendenti Ufficio',   ceType: 'costo_studio' },
  'COLLABORATORI FISSI':              { categoria: '[PERSONALE] Collaboratori Fissi',             ceType: 'costo_studio' },
  'COMPENSO AMMINISTRATORI':          { categoria: '[PERSONALE] Compenso Amministratori',        ceType: 'costo_studio' },
  'CONSULENTI OPEX20':                { categoria: '[CONSULENZE] Consulenti Fissi',              ceType: 'costo_fisso' },
  'CONSULENTI':                       { categoria: '[CONSULENZE] Consulenti Fissi',              ceType: 'costo_fisso' },
  'SOA E ISO':                        { categoria: '[CONSULENZE] SOA e ISO',                    ceType: 'costo_fisso' },
  'COMMERCIALISTA':                   { categoria: '[CONSULENZE] Commercialista',               ceType: 'costo_fisso' },
  'AFFITTI SEDI':                     { categoria: '[STRUTTURA] Affitti Sedi',                  ceType: 'costo_fisso' },
  'UTENZE SEDI':                      { categoria: '[STRUTTURA] Utenze Sedi',                   ceType: 'costo_fisso' },
  'SOFTWARE':                         { categoria: '[STRUTTURA] Software e Abbonamenti',        ceType: 'costo_fisso' },
  'CANCELLERIA':                      { categoria: '[STRUTTURA] Cancelleria e Materiali Ufficio', ceType: 'costo_fisso' },
  'ASSICURAZIONE MEZZI E BOLLI':      { categoria: '[MEZZI] Assicurazione Mezzi e Bolli',       ceType: 'costo_fisso' },
  'ASSICURAZIONI GENERALI':           { categoria: '[COMPLIANCE] Assicurazioni Generali',       ceType: 'costo_fisso' },
  'REVISIONE MACCHINARI':             { categoria: '[MEZZI] Revisione Macchinari',              ceType: 'costo_fisso' },
  'RIPARAZIONI MACCHINARI E ATTREZZATURE': { categoria: '[MEZZI] Riparazioni Macchinari Programmate', ceType: 'costo_fisso' },
  'NUOVE ATTREZZATURE':               { categoria: '[INVESTIMENTI] Acquisto Attrezzature e Macchinari', ceType: 'capex' },
  'ACQUISIZIONE TERRENI o IMMOBILI':  { categoria: '[INVESTIMENTI] Acquisto Terreni per Sviluppo', ceType: 'capex' },
  'ACQUISIZIONE TERRENI':             { categoria: '[INVESTIMENTI] Acquisto Terreni per Sviluppo', ceType: 'capex' },
  'NUOVA SOCIETA\'':                  { categoria: '[INVESTIMENTI] Investimento in Nuova Società', ceType: 'capex' },
  'CORSI DIPENDENTI':                 { categoria: '[COMPLIANCE] Corsi Dipendenti',             ceType: 'costo_fisso' },
  'VISITE MEDICHE DIPENDENTI':        { categoria: '[COMPLIANCE] Visite Mediche Dipendenti',    ceType: 'costo_fisso' },
  "PUBBLICITA' E MARKETING":          { categoria: '[MARKETING] Pubblicità e Marketing',        ceType: 'costo_fisso' },
  'VOLONTARIATO':                     { categoria: '[STRAORDINARI] Volontariato e Donazioni',   ceType: 'straordinario' },
  // Fiscale / finanziario
  'TASSE':                            { categoria: '[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)', ceType: 'costo_fisso' },
  'VERSAMENTO IVA':                   { categoria: '[FISCO] Versamento IVA',                   ceType: 'solo_cashflow' },
  'RITENUTE SU BONIFICI':             { categoria: '[FISCO] Ritenute su Bonifici (versate)',   ceType: 'solo_cashflow' },
  "RITENUTE D'ACCONTO SU PROFESSIONISTI": { categoria: "[FISCO] Ritenute d'Acconto su Professionisti", ceType: 'solo_cashflow' },
  'SANZIONI':                         { categoria: '[STRAORDINARI] Sanzioni e Penali',          ceType: 'straordinario' },
  'IMPREVISTI':                       { categoria: '[STRAORDINARI] Imprevisti Straordinari',    ceType: 'straordinario' },
  'SPESE BANCARIE':                   { categoria: '[FINANZA] Commissioni e Bolli Bancari',     ceType: 'onere_finanziario' },
  'RATE E INTERESSI FINANZIAMENTI':   { categoria: '[FINANZA] Interessi Passivi Finanziamenti', ceType: 'onere_finanziario' },
  'PRELIEVO UTILE SOCI':              { categoria: '[SOCI] Prelievo Utile / Dividendi',         ceType: 'distribuzione_utile' },
  // Fallback per righe non mappate
  'DEFAULT_COSTO_VARIABILE':          { categoria: '[CANTIERE] Fornitori Materiali',            ceType: 'costo_variabile' },
  'DEFAULT_COSTO_FISSO':              { categoria: '[STRUTTURA] Cancelleria e Materiali Ufficio', ceType: 'costo_fisso' },
};

// Righe da ESCLUDERE — non sono costi operativi
const ESCLUDI_USCITE = new Set([
  'TOTALE PAGATO', 'SALDO MESE', 'FLUSSO NETTO',
  'TOTALE', 'TOTALE USCITE', 'NOTE',
]);

// Righe entrate da escludere (finanziamenti banca — vanno inseriti a mano)
const ESCLUDI_ENTRATE_PATTERN = [
  /accredito mutuo/i, /finanziamento/i, /prestito/i,
  /apertura fido/i, /linea credito/i,
];

// ─── FUNZIONE DI PARSING ─────────────────────────────────────────

const mappaUscita = (label: string): { categoria: string; ceType: string } => {
  const key = label.trim().toUpperCase();
  // Cerca match esatto
  if (MAPPA_USCITE[key]) return MAPPA_USCITE[key];
  // Cerca match parziale
  for (const [k, v] of Object.entries(MAPPA_USCITE)) {
    if (k !== 'DEFAULT_COSTO_VARIABILE' && k !== 'DEFAULT_COSTO_FISSO' && key.includes(k)) return v;
  }
  // Fallback per categoria
  if (key.includes('STIPEND') || key.includes('CONTRIBUT')) return MAPPA_USCITE['DEFAULT_COSTO_FISSO'];
  return MAPPA_USCITE['DEFAULT_COSTO_VARIABILE'];
};

interface RigaAnteprima {
  id: string;
  anno: number;
  mese: number;
  tipo: 'INCOME' | 'EXPENSE';
  soggetto: string;
  importo: number;
  categoriaApp: string;
  ceType: string;
  includi: boolean;
  mappataAutomaticamente: boolean;
}

const parseExcelStorico = async (file: File, anniSelezionati: Set<number>): Promise<RigaAnteprima[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });

  const righe: RigaAnteprima[] = [];

  for (const anno of Array.from(anniSelezionati).sort()) {
    const sheetName = `FLUSSO DI CASSA ${anno}`;
    if (!wb.SheetNames.includes(sheetName)) continue;

    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    let inEntrate = true;
    let inUscite = false;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const label = String(row[0]).trim();
      if (!label) continue;

      const labelUpper = label.toUpperCase().trim();

      // Rileva inizio sezione uscite. Doppio trigger per robustezza: il marker "TOTALE INCASSATO"
      // OPPURE l'intestazione esatta "FORNITORI" (che apre sempre la sezione costi). Così, se un foglio
      // non ha la dicitura "TOTALE INCASSATO" (o è scritta diversamente / in cella unita), le uscite
      // non vengono più perse. Match esatto su "FORNITORI" per non scattare su un nome cliente che lo contiene.
      if (labelUpper.includes('TOTALE INCASSATO') || labelUpper === 'FORNITORI') {
        inEntrate = false;
        inUscite = true;
        continue;
      }

      // Fine uscite
      if (labelUpper.includes('TOTALE PAGATO') ||
          labelUpper.includes('SALDO MESE') ||
          labelUpper.includes('FLUSSO NETTO')) {
        inUscite = false;
        continue;
      }

      // Salta righe di intestazione
      if (['CLIENTI ', 'MESE'].includes(label)) continue;
      if (ESCLUDI_USCITE.has(label.toUpperCase())) continue;

      // ── ENTRATE ──────────────────────────────────────────────
      if (inEntrate) {
        // Salta se è un finanziamento bancario
        const isFinanziamento = ESCLUDI_ENTRATE_PATTERN.some(p => p.test(label));
        if (isFinanziamento) continue;

        for (let m = 0; m < 12; m++) {
          const rawVal = row[colEntrataCons(m)];
          const val = safeParseFloat(rawVal);
          if (isNaN(val) || val <= 0) continue;

          righe.push({
            id: uuidv4(),
            anno,
            mese: m,
            tipo: 'INCOME',
            soggetto: label,
            importo: Math.round(val * 100) / 100,
            categoriaApp: '[CANTIERE] SAL — Stato Avanzamento Lavori',
            ceType: 'ricavo_core',
            includi: true,
            mappataAutomaticamente: true,
          });
        }
      }

      // ── USCITE ───────────────────────────────────────────────
      if (inUscite) {
        const mapped = mappaUscita(label);

        for (let m = 0; m < 12; m++) {
          const rawVal = row[colUscitaCons(m)];
          const val = safeParseFloat(rawVal);
          if (isNaN(val) || val <= 0) continue;

          righe.push({
            id: uuidv4(),
            anno,
            mese: m,
            tipo: 'EXPENSE',
            soggetto: label,
            importo: Math.round(val * 100) / 100,
            categoriaApp: mapped.categoria,
            ceType: mapped.ceType,
            includi: true,
            mappataAutomaticamente: true,
          });
        }
      }
    }
  }

  return righe;
};

// ─── PROPS ───────────────────────────────────────────────────────

interface ImportStoricoModalProps {
  storicoGiaImportato: boolean;
  transazioniEsistenti?: Transaction[];
  onImport: (transactions: Transaction[], session: ImportSession) => void;
  onClose: () => void;
}

// ─── COMPONENTE ──────────────────────────────────────────────────

const ImportStoricoModal: React.FC<ImportStoricoModalProps> = ({
  storicoGiaImportato, transazioniEsistenti, onImport, onClose
}) => {
  type Step = 'upload' | 'anteprima' | 'completato';

  const [step, setStep]               = useState<Step>('upload');
  const [loading, setLoading]         = useState(false);
  const [errore, setErrore]           = useState<string | null>(null);
  const [nomeFile, setNomeFile]       = useState('');
  const [anniDisponibili, setAnniDisp] = useState<number[]>([]);
  const [anniSelezionati, setAnniSel] = useState<Set<number>>(new Set());
  const [righe, setRighe]             = useState<RigaAnteprima[]>([]);
  const [annoAperto, setAnnoAperto]   = useState<number | null>(null);
  const [importateCount, setImportate] = useState(0);
  const [duplicatiSaltati, setDuplicatiSaltati] = useState(0);
  const [mostraSoloProblemi, setMostraProblemi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileObj = useRef<File | null>(null);

  // ── Primo step: analizza il file senza importare ───────────────
  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setErrore(null);
    setNomeFile(file.name);
    fileObj.current = file;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const anni = wb.SheetNames
        .filter(s => s.startsWith('FLUSSO DI CASSA '))
        .map(s => parseInt(s.replace('FLUSSO DI CASSA ', '')))
        .filter(n => !isNaN(n) && n < 2026)  // escludi 2026
        .sort();
      setAnniDisp(anni);
      setAnniSel(new Set(anni));   // tutti selezionati di default
    } catch {
      setErrore('Impossibile leggere il file. Verifica che sia il file Excel del Flusso di Cassa.');
    }
    setLoading(false);
  }, []);

  // ── Secondo step: parse e anteprima ──────────────────────────
  const handleAnalizza = async () => {
    if (!fileObj.current || anniSelezionati.size === 0) return;
    setLoading(true);
    setErrore(null);
    try {
      const parsed = await parseExcelStorico(fileObj.current, anniSelezionati);
      setRighe(parsed);
      setAnnoAperto(Math.min(...Array.from(anniSelezionati)));
      setStep('anteprima');
    } catch (e) {
      setErrore('Errore nel parsing del file. Controlla che il formato sia quello standard del Flusso di Cassa.');
    }
    setLoading(false);
  };

  // ── Terzo step: importazione ──────────────────────────────────
  const handleImporta = () => {
    const daImportareRaw = righe.filter(r => r.includi);

    // Dedup contro lo storico già presente: evita che un re-import dello stesso Excel raddoppi i dati.
    // Chiave = anno|mese|tipo|soggetto normalizzato|importo(centesimi). Il confronto è SOLO con le
    // transazioni già importate da storico (sourceRef "Storico Excel ..."), per non scartare per errore
    // inserimenti manuali o movimenti di altri import che dovessero coincidere.
    const normDesc = (s: string) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const keyOf = (anno: number, mese: number, tipo: string, desc: string, importo: number) =>
      `${anno}|${mese}|${tipo}|${normDesc(desc)}|${Math.round(importo * 100)}`;

    const chiaviEsistenti = new Set<string>();
    (transazioniEsistenti || [])
      .filter(t => (t.sourceRef || '').startsWith('Storico Excel'))
      .forEach(t => {
        const parts = (t.date || '').split('-');
        const anno = parseInt(parts[0], 10);
        const mese = parseInt(parts[1], 10) - 1;
        if (isNaN(anno) || isNaN(mese)) return;
        chiaviEsistenti.add(keyOf(anno, mese, String(t.type), t.description, t.amount));
      });

    const daImportare = daImportareRaw.filter(r =>
      !chiaviEsistenti.has(keyOf(r.anno, r.mese, r.tipo, r.soggetto, r.importo))
    );
    const saltati = daImportareRaw.length - daImportare.length;
    setDuplicatiSaltati(saltati);

    const sessionId = uuidv4();

    const transactions: Transaction[] = daImportare.map(r => ({
      id: uuidv4(),
      date: `${r.anno}-${String(r.mese + 1).padStart(2, '0')}-28`,
      amount: r.importo,
      vatRate: undefined,   // dati storici ivati — niente separazione IVA
      type: r.tipo === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
      category: r.categoriaApp,
      description: r.soggetto,
      isForecast: false,
      ceType: r.ceType as any,
      sourceRef: `Storico Excel ${r.anno} · ${MESI_NOME[r.mese]}`,
      importSessionId: sessionId,
    }));

    // Costruisce la sessione
    const anni = Array.from(anniSelezionati).sort();
    const session: ImportSession = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      nomeFile: `Storico Excel ${anni[0]}–${anni[anni.length - 1]}`,
      transazioniImportate: transactions.length,
      periodoInizio: `${anni[0]}-01-01`,
      periodoFine: `${anni[anni.length - 1]}-12-31`,
    };

    onImport(transactions, session);
    setImportate(transactions.length);
    setStep('completato');
  };

  // ── Statistiche anteprima ─────────────────────────────────────
  const righeIncluse = righe.filter(r => r.includi);
  const totEntrate = righeIncluse.filter(r => r.tipo === 'INCOME').reduce((s, r) => s + r.importo, 0);
  const totUscite  = righeIncluse.filter(r => r.tipo === 'EXPENSE').reduce((s, r) => s + r.importo, 0);

  const toggleAnno = (anno: number) => {
    const prossimi = new Set(anniSelezionati);
    if (prossimi.has(anno)) prossimi.delete(anno);
    else prossimi.add(anno);
    setAnniSel(prossimi);
  };

  const toggleRiga = (id: string) => {
    setRighe(prev => prev.map(r => r.id === id ? { ...r, includi: !r.includi } : r));
  };

  const toggleTuttiAnno = (anno: number, includi: boolean) => {
    setRighe(prev => prev.map(r => r.anno === anno ? { ...r, includi } : r));
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
              <FileSpreadsheet size={20} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Import Storico Flusso di Cassa</h2>
              <p className="text-xs text-slate-400">
                {step === 'upload' && 'Carica il file Excel del vecchio Flusso di Cassa'}
                {step === 'anteprima' && `${righe.length} voci trovate — verifica e conferma`}
                {step === 'completato' && 'Import completato'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Barra step */}
        <div className="flex border-b border-slate-100 px-8 shrink-0">
          {(['upload', 'anteprima', 'completato'] as Step[]).map((s, i) => (
            <div key={s} className={`py-3 px-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${step === s ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-300'}`}>
              {i + 1}. {s === 'upload' ? 'File' : s === 'anteprima' ? 'Anteprima' : 'Fine'}
            </div>
          ))}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* ── STEP UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-6">

              {/* Avviso se già importato */}
              {storicoGiaImportato && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-amber-800">Storico già importato</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Risulta già presente un import storico. Se procedi, le nuove transazioni
                      si aggiungeranno alle esistenti. Usa l'annullamento in Config. se vuoi
                      ripartire da zero.
                    </p>
                  </div>
                </div>
              )}

              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all"
              >
                <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <FileSpreadsheet size={28} className="text-indigo-400" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700">
                    {nomeFile || 'Carica il file Excel del Flusso di Cassa'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    PIANIFICAZIONE_FLUSSO_DI_CASSA_ANNUALE.xlsx
                  </p>
                </div>
                {nomeFile && <CheckCircle2 size={20} className="text-indigo-500" />}
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </div>

              {/* Selezione anni */}
              {anniDisponibili.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Anni da importare
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    {anniDisponibili.map(anno => (
                      <label key={anno}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                          anniSelezionati.has(anno)
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}>
                        <input type="checkbox" checked={anniSelezionati.has(anno)}
                          onChange={() => toggleAnno(anno)} className="hidden" />
                        <span className="font-black text-sm">{anno}</span>
                        {anniSelezionati.has(anno) && <CheckCircle2 size={14} className="text-indigo-500" />}
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2">
                    Il 2026 è escluso — viene gestito dall'import Punta Net mensile.
                  </p>
                </div>
              )}

              {errore && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-600">{errore}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP ANTEPRIMA ── */}
          {step === 'anteprima' && (
            <div className="space-y-4">

              {/* KPI riassuntivi */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-emerald-50 rounded-2xl p-4 text-center border border-emerald-100">
                  <p className="text-xl font-black text-emerald-600">{CURRENCY.format(totEntrate)}</p>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">Entrate</p>
                </div>
                <div className="bg-rose-50 rounded-2xl p-4 text-center border border-rose-100">
                  <p className="text-xl font-black text-rose-600">{CURRENCY.format(totUscite)}</p>
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mt-1">Uscite</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-200">
                  <p className="text-xl font-black text-slate-700">{righeIncluse.length}</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Voci incluse</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-200">
                  <p className="text-xl font-black text-slate-400">{righe.length - righeIncluse.length}</p>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1">Escluse</p>
                </div>
              </div>

              {/* Info IVA */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertCircle size={13} className="text-blue-400 shrink-0" />
                <p className="text-[10px] text-blue-600">
                  Gli importi sono <strong>lordi (ivati)</strong> — il vecchio Excel non separa imponibile e IVA.
                  Le transazioni storiche avranno IVA non specificata, corretto per dati pre-app.
                </p>
              </div>

              {/* Toggle mostra solo non mappate */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Dettaglio per anno
                </p>
                <button onClick={() => setMostraProblemi(!mostraSoloProblemi)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                  {mostraSoloProblemi ? <Eye size={11} /> : <EyeOff size={11} />}
                  {mostraSoloProblemi ? 'Mostra tutte' : 'Solo da verificare'}
                </button>
              </div>

              {/* Accordion per anno */}
              {Array.from(anniSelezionati).sort().map(anno => {
                const righeAnno = righe.filter(r => r.anno === anno);
                const righeVis  = mostraSoloProblemi ? righeAnno : righeAnno;
                const incluse   = righeAnno.filter(r => r.includi).length;
                const totE      = righeAnno.filter(r => r.includi && r.tipo === 'INCOME').reduce((s, r) => s + r.importo, 0);
                const totU      = righeAnno.filter(r => r.includi && r.tipo === 'EXPENSE').reduce((s, r) => s + r.importo, 0);
                const isAperto  = annoAperto === anno;

                return (
                  <div key={anno} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-50"
                         onClick={() => setAnnoAperto(isAperto ? null : anno)}>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-slate-800">{anno}</span>
                        <span className="text-xs text-slate-400">{incluse} voci</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-bold text-emerald-600">+{CURRENCY.format(totE)}</span>
                        <span className="text-xs font-bold text-rose-600">−{CURRENCY.format(totU)}</span>
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); toggleTuttiAnno(anno, true); }}
                            className="text-[9px] font-black text-indigo-500 hover:text-indigo-700 px-2 py-1 bg-indigo-50 rounded-lg">
                            Tutti ✓
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleTuttiAnno(anno, false); }}
                            className="text-[9px] font-black text-slate-400 hover:text-slate-600 px-2 py-1 bg-slate-100 rounded-lg">
                            Nessuno
                          </button>
                        </div>
                        {isAperto ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      </div>
                    </div>

                    {isAperto && (
                      <div className="border-t border-slate-100 max-h-96 overflow-y-auto">
                        <table className="w-full text-left">
                          <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-100">
                            <tr>
                              <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest w-8"></th>
                              <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Mese</th>
                              <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Soggetto</th>
                              <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Categoria App</th>
                              <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Importo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {righeVis.map(r => (
                              <tr key={r.id}
                                className={`border-b border-slate-50 hover:bg-slate-50/50 ${!r.includi ? 'opacity-40' : ''}`}>
                                <td className="py-2 px-4">
                                  <input type="checkbox" checked={r.includi}
                                    onChange={() => toggleRiga(r.id)}
                                    className="w-3.5 h-3.5 rounded" />
                                </td>
                                <td className="py-2 px-4 text-[10px] text-slate-400 whitespace-nowrap">
                                  {MESI_LABEL[r.mese]}
                                </td>
                                <td className="py-2 px-4 text-xs font-bold text-slate-700 max-w-[160px] truncate">
                                  {r.soggetto}
                                </td>
                                <td className="py-2 px-4">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                    r.tipo === 'INCOME'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {r.categoriaApp.replace(/\[.*?\]\s*/, '')}
                                  </span>
                                </td>
                                <td className={`py-2 px-4 text-right font-mono text-xs font-black ${
                                  r.tipo === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                  {r.tipo === 'INCOME' ? '+' : '−'}{CURRENCY.format(r.importo)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── STEP COMPLETATO ── */}
          {step === 'completato' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-indigo-600" />
              </div>
              <p className="text-xl font-black text-slate-900">Storico importato</p>
              <p className="text-sm text-slate-500 max-w-sm">
                <span className="font-black text-indigo-600">{importateCount}</span> transazioni storiche
                aggiunte al cash flow. Le trovi nelle timeline degli anni {Array.from(anniSelezionati).sort().join(', ')}.
              </p>
              {duplicatiSaltati > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 max-w-sm">
                  <span className="font-black">{duplicatiSaltati}</span> voci già presenti dallo storico sono state
                  saltate per evitare duplicati (stesso anno, mese, soggetto e importo).
                </p>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4 max-w-sm">
                <p className="text-xs text-blue-700 leading-relaxed">
                  Se qualcosa non torna vai in <strong>Config. → Storico Import</strong> e trovi
                  la sessione "Storico Excel" — puoi annullare tutto o rimuovere singole voci.
                </p>
              </div>
              <button onClick={onClose}
                className="mt-4 px-8 py-3 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-colors">
                Chiudi
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'upload' && (
          <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 shrink-0 bg-slate-50">
            <button onClick={onClose}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50">
              Annulla
            </button>
            <button
              onClick={handleAnalizza}
              disabled={!nomeFile || anniSelezionati.size === 0 || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-xl disabled:opacity-40 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              Analizza e mostra anteprima
            </button>
          </div>
        )}

        {step === 'anteprima' && (
          <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between gap-4 shrink-0 bg-slate-50">
            <p className="text-xs text-slate-400">
              {righeIncluse.length} voci selezionate su {righe.length} totali
            </p>
            <div className="flex gap-3">
              <button onClick={() => setStep('upload')}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50">
                ← Indietro
              </button>
              <button
                onClick={handleImporta}
                disabled={righeIncluse.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-xl disabled:opacity-40 transition-colors"
              >
                <Zap size={14} />
                Importa {righeIncluse.length} transazioni storiche
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportStoricoModal;
