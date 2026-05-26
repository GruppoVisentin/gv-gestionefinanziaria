import React, { useState, useRef, useCallback } from 'react';
import {
  X, Upload, CheckCircle2, AlertCircle, HelpCircle,
  ChevronDown, Zap, ArrowRight, Database,
  Building2, Briefcase, RefreshCw, ArrowLeftRight, FileText,
  ChevronRight, ChevronUp
} from 'lucide-react';
import {
  parseBancaExcel,
  parseDettaglioFEP,
  parseDettaglioFEA,
  classificaRiga,
  rigaToTransaction,
  PuntaNetRiga,
  RigaClassificata,
  MappingConto,
  RegolaMapping,
  isDuplicato,
  codIvaToNumber,
  fuzzyMatchCantiere,
  inferisciTipoEntrata,
  mappaTipologiaACategoriaApp,
  AliquotaIVA
} from '../utils/puntaNetImporter';
import { Transaction, BankAccount, ImportSession } from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, CATEGORY_TO_CE_TYPE } from '../constants';
import * as XLSX from 'xlsx';

const formatEuro = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);

type Step = 'upload' | 'mappaConti' | 'revisione' | 'completato';

interface ImportPuntaNetModalProps {
  contiConfigurati: BankAccount[];
  regoleSalvate: RegolaMapping[];
  mappingContiSalvato: MappingConto | null;
  cantieriApp: string[];
  transazioniEsistenti: Transaction[];
  bozza: RigaClassificata[];
  fileFEP?: File | null;
  fileFEA?: File | null;
  fileFEA2?: File | null;
  onSetFileFEP?: (file: File | null) => void;
  onSetFileFEA?: (file: File | null) => void;
  onSetFileFEA2?: (file: File | null) => void;
  onAggiornaBozza: (righe: RigaClassificata[]) => void;
  onImport: (transactions: Transaction[]) => void;
  onSalvaRegole: (regole: RegolaMapping[]) => void;
  onSalvaMappingConti: (mapping: MappingConto) => void;
  onSalvaSessione: (session: ImportSession) => void;
  onClose: () => void;
}

const ImportPuntaNetModal: React.FC<ImportPuntaNetModalProps> = ({
  contiConfigurati,
  regoleSalvate,
  mappingContiSalvato,
  cantieriApp,
  transazioniEsistenti,
  bozza,
  fileFEP: initialFileFEP,
  fileFEA: initialFileFEA,
  fileFEA2: initialFileFEA2,
  onSetFileFEP,
  onSetFileFEA,
  onSetFileFEA2,
  onAggiornaBozza,
  onImport,
  onSalvaRegole,
  onSalvaMappingConti,
  onSalvaSessione,
  onClose,
}) => {
  const [step, setStep] = useState<Step>(bozza.length > 0 ? 'revisione' : 'upload');
  
  // File states (local, but initialized from props)
  const [fileBanca, setFileBanca] = useState<File | null>(null);
  const [fileFEP, setFileFEP] = useState<File | null>(initialFileFEP ?? null);
  const [fileFEA, setFileFEA] = useState<File | null>(initialFileFEA ?? null);
  const [fileFEA2, setFileFEA2] = useState<File | null>(initialFileFEA2 ?? null);

  const handleSetFileFEP = (file: File | null) => {
    setFileFEP(file);
    onSetFileFEP?.(file);
  };

  const handleSetFileFEA = (file: File | null) => {
    setFileFEA(file);
    onSetFileFEA?.(file);
  };

  const handleSetFileFEA2 = (file: File | null) => {
    setFileFEA2(file);
    onSetFileFEA2?.(file);
  };
  
  const [mappingConti, setMappingConti] = useState<MappingConto>(
    mappingContiSalvato ?? { flagB: contiConfigurati[0]?.id ?? '', flagI: contiConfigurati[0]?.id ?? '' }
  );
  
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [importateCount, setImportateCount] = useState(0);
  const [sospesCount, setSospesCount] = useState(0);
  const [duplicatiIgnorati, setDuplicatiIgnorati] = useState(0);
  
  const [showAutoClassificati, setShowAutoClassificati] = useState(false);
  const [showDuplicati, setShowDuplicati] = useState(false);

  const righe = bozza;
  const setRighe = onAggiornaBozza;

  // ─── ANALISI E CLASSIFICAZIONE ──────────────────────────────────

  const handleAnalizza = async () => {
    if (!fileBanca) return;
    setLoading(true);
    setErrore(null);

    try {
      const readFile = (file: File): Promise<XLSX.WorkBook> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const data = new Uint8Array(e.target!.result as ArrayBuffer);
            resolve(XLSX.read(data, { type: 'array', cellDates: true }));
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      };

      // PASSO 1: Parse Banca
      const wbBanca = await readFile(fileBanca);
      const movimentiBanca = parseBancaExcel(wbBanca);

      // PASSO 2 & 3: Parse Dettagli (FEP/FEA)
      let mapFEP = new Map();
      let mapFEA = new Map();
      if (fileFEP) {
        const wbFEP = await readFile(fileFEP);
        mapFEP = parseDettaglioFEP(wbFEP);
      }
      if (fileFEA) {
        const wbFEA = await readFile(fileFEA);
        mapFEA = parseDettaglioFEA(wbFEA);
      }
      if (fileFEA2) {
        const wbFEA2 = await readFile(fileFEA2);
        const mapFEA2 = parseDettaglioFEA(wbFEA2);
        for (const [key, value] of mapFEA2.entries()) {
          mapFEA.set(key, value);
        }
      }

      // PASSO 4, 5, 6, 7: Costruzione RigaClassificata
      const classificate: RigaClassificata[] = movimentiBanca.map(mov => {
        const { duplicato, livello } = isDuplicato(mov, transazioniEsistenti);
        
        let categoria: string | null = null;
        let ceType: string | null = null;
        let confidenza: 'alta' | 'media' | 'bassa' | null = null;
        let vatRateSuggerito: AliquotaIVA | null = null;
        let vatRateNota: string | null = null;
        let arricchitoDaFattura = false;
        let cantierePuntaNet = '';
        let cantiereSuggerito: string | null = null;
        let cantiereScore = 0;
        let tipoEntrata: 'sal' | 'acconto' | 'saldo' | 'immobile' | 'altro' | null = null;

        // Arricchimento FEP
        if (mov.tipoMovimento === 'FEP' && mov.numeroFattura && mapFEP.has(mov.numeroFattura)) {
          const dett = mapFEP.get(mov.numeroFattura);
          cantierePuntaNet = dett.cantiere;
          
          // Calcola l'aliquota IVA dinamicamente da imponibile e imposte della fattura
          if (dett.imponibile > 0) {
            if (dett.imposte > 0) {
              const ratio = dett.imposte / dett.imponibile;
              const percent = Math.round(ratio * 100);
              if (percent >= 20) vatRateSuggerito = 22;
              else if (percent >= 8) vatRateSuggerito = 10;
              else if (percent >= 3) vatRateSuggerito = 4;
              else vatRateSuggerito = 0;
            } else {
              vatRateSuggerito = 0;
            }
          } else {
            vatRateSuggerito = codIvaToNumber(dett.codIva);
          }
          
          // Mappa la tipologia della fattura alla categoria dell'app
          if (dett.tipologia) {
            const catMappata = mappaTipologiaACategoriaApp(dett.tipologia, 'FEP');
            if (catMappata) {
              categoria = catMappata;
              ceType = CATEGORY_TO_CE_TYPE[catMappata] ?? 'solo_cashflow';
              confidenza = 'alta';
            }
          }
          
          vatRateNota = `Da fattura FEP n. ${dett.numero}`;
          arricchitoDaFattura = true;
        }
        // Arricchimento FEA
        else if (mov.tipoMovimento === 'FEA' && mov.numeroFattura && mapFEA.has(mov.numeroFattura)) {
          const dett = mapFEA.get(mov.numeroFattura);
          cantierePuntaNet = dett.cantiere;
          
          // Calcola l'aliquota IVA dinamicamente da imponibile e totale della fattura FEA
          if (dett.imponibile > 0) {
            if (dett.totale > dett.imponibile) {
              const ratio = (dett.totale - dett.imponibile) / dett.imponibile;
              const percent = Math.round(ratio * 100);
              if (percent >= 20) vatRateSuggerito = 22;
              else if (percent >= 8) vatRateSuggerito = 10;
              else if (percent >= 3) vatRateSuggerito = 4;
              else vatRateSuggerito = 0;
            } else {
              vatRateSuggerito = 0;
            }
          } else {
            vatRateSuggerito = codIvaToNumber(dett.codIva);
          }
          
          vatRateNota = `Da fattura FEA n. ${dett.numero}/${dett.anno}`;
          arricchitoDaFattura = true;
          tipoEntrata = inferisciTipoEntrata(dett.descrizioneDettaglio);
          if (tipoEntrata) {
            const mapping: Record<string, { categoria: string; ceType: string }> = {
              sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
              acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa',   ceType: 'solo_cashflow' },
              saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa',           ceType: 'ricavo_core' },
              immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni',   ceType: 'ricavo_immobiliare' },
              altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori',   ceType: 'ricavo_altro' },
            };
            const mapped = mapping[tipoEntrata];
            if (mapped) {
              categoria = mapped.categoria;
              ceType = mapped.ceType;
              confidenza = 'alta';
            }
          }
        }

        // --- ABBINAMENTO CANTIERI INTELLIGENTE ---
        // 1. Prova dal cantiere presente nel file di dettaglio (arricchito)
        if (cantierePuntaNet) {
          const match = fuzzyMatchCantiere(cantierePuntaNet, cantieriApp);
          if (match) {
            cantiereSuggerito = match.cantiere;
            cantiereScore = match.score;
          }
        }
        
        // 2. Fallback su descrizione e entità del movimento bancario
        if (!cantiereSuggerito || cantiereScore < 50) {
          const testoBanca = `${mov.entity} ${mov.descrizione}`;
          const matchBanca = fuzzyMatchCantiere(testoBanca, cantieriApp);
          if (matchBanca && matchBanca.score > cantiereScore) {
            cantiereSuggerito = matchBanca.cantiere;
            cantiereScore = matchBanca.score;
          }
        }

        // Se non arricchito o manca categoria, usa classificazione automatica
        const auto = classificaRiga(mov, regoleSalvate);
        if (!categoria) {
          categoria = auto.categoria;
          ceType = auto.ceType;
          confidenza = auto.confidenza;
        }
        if (!vatRateSuggerito) {
          vatRateSuggerito = auto.vatRateSuggerito;
          vatRateNota = auto.vatRateNota;
        }

        return {
          riga: mov,
          categoria,
          ceType,
          confidenza,
          matchKey: auto.matchKey,
          confermata: categoria !== null && vatRateSuggerito !== null && !duplicato && (mov.tipoMovimento !== 'FEA' || tipoEntrata !== null),
          vatRateSuggerito,
          vatRateNota,
          vatRateConfermato: null,
          isDuplicato: duplicato,
          livelloDuplicato: livello,
          arricchitoDaFattura,
          cantiereSuggerito,
          cantiereScore,
          cantierePuntaNet,
          tipoEntrata
        };
      });

      setRighe(classificate);
      setStep(mappingContiSalvato ? 'revisione' : 'mappaConti');
    } catch (err) {
      console.error(err);
      setErrore('Errore durante l\'analisi dei file. Verifica il formato.');
    } finally {
      setLoading(false);
    }
  };

  // ─── HANDLERS REVISIONE ─────────────────────────────────────────

  const aggiornaCategoria = (idx: number, categoria: string) => {
    setRighe(righe.map((r, i) => {
      if (i !== idx) return r;
      const ceType = CATEGORY_TO_CE_TYPE[categoria] ?? 'solo_cashflow';
      return { ...r, categoria, ceType, confermata: true };
    }));
  };

  const aggiornaVatRate = (idx: number, vatRate: number) => {
    setRighe(righe.map((r, i) =>
      i === idx ? { ...r, vatRateConfermato: vatRate as any } : r
    ));
  };

  const aggiornaCantiere = (idx: number, cantiere: string) => {
    setRighe(righe.map((r, i) =>
      i === idx ? { ...r, cantiereSuggerito: cantiere || null } : r
    ));
  };

  const selezionaTipoEntrata = (idx: number, tipo: 'sal' | 'acconto' | 'saldo' | 'immobile' | 'altro') => {
    const mapping: Record<string, { categoria: string; ceType: string }> = {
      sal:      { categoria: '[CANTIERE] SAL — Stato Avanzamento Lavori', ceType: 'ricavo_core' },
      acconto:  { categoria: '[CANTIERE] Anticipi da Clienti su Commessa',   ceType: 'solo_cashflow' },
      immobile: { categoria: '[IMMOBILIARE] Vendita Immobili e Terreni',   ceType: 'ricavo_immobiliare' },
      saldo:    { categoria: '[CANTIERE] Saldo Finale Commessa',           ceType: 'ricavo_core' },
      altro:    { categoria: '[CANTIERE] Manutenzioni e Piccoli Lavori',   ceType: 'ricavo_altro' },
    };
    const { categoria, ceType } = mapping[tipo];
    setRighe(righe.map((r, i) =>
      i === idx ? { ...r, categoria, ceType, tipoEntrata: tipo, confermata: true } : r
    ));
  };

  const importa = () => {
    const daImportare = righe.filter(r => r.confermata && r.categoria && r.ceType && !r.isDuplicato);
    const daSospendere = righe.filter(r => (!r.confermata || !r.categoria || !r.ceType) && !r.isDuplicato);
    const duplicati = righe.filter(r => r.isDuplicato);

    const sessionId = crypto.randomUUID();
    const dates = daImportare.map(r => r.riga.data.getTime());
    const minDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
    const maxDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

    const session: ImportSession = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      nomeFile: fileBanca?.name || 'Punta Net Import',
      transazioniImportate: daImportare.length,
      periodoInizio: minDate,
      periodoFine: maxDate
    };

    // Salva nuove regole
    const nuoveRegole: RegolaMapping[] = [];
    for (const r of daImportare) {
      const entityKey = r.riga.entity.trim().toUpperCase().slice(0, 40);
      const giaEsiste = regoleSalvate.some(re => re.entityKey === entityKey);
      if (!giaEsiste && r.confidenza !== 'alta') {
        nuoveRegole.push({ entityKey, categoria: r.categoria!, ceType: r.ceType! });
      }
    }
    if (nuoveRegole.length > 0) {
      onSalvaRegole([...regoleSalvate, ...nuoveRegole]);
    }

    // Riconciliazione automatica per entrate
    const linkedForecastIds = new Set<string>();
    transazioniEsistenti.forEach(t => {
      if (!t.isForecast && t.linkedForecastId) {
        linkedForecastIds.add(t.linkedForecastId);
      }
    });

    const transactions: Transaction[] = daImportare.map(r => {
      const vatRate = r.vatRateConfermato ?? r.vatRateSuggerito ?? 0;
      // N6 fix: usa CATEGORY_TO_CE_TYPE per estrarre sempre il ceType corretto, bypassando eventuali disallineamenti nelle regole
      const finalCeType = CATEGORY_TO_CE_TYPE[r.categoria!] ?? r.ceType ?? 'solo_cashflow';
      const tx = rigaToTransaction(r.riga, r.categoria!, finalCeType, Number(vatRate), undefined, sessionId);
      // Se c'è un cantiere suggerito e confermato (o matchato), lo impostiamo
      if (r.cantiereSuggerito) {
        tx.project = r.cantiereSuggerito;
      }

      // Reconciliation for INCOME only
      if (tx.type === 'INCOME') {
        const txDate = new Date(tx.date);
        const txMonth = txDate.getMonth();
        const txYear = txDate.getFullYear();
        const txProj = tx.project?.trim() || 'Generale';
        const txCat = tx.category;

        const matchingForecast = transazioniEsistenti.find(f => {
          if (!f.isForecast || f.type !== 'INCOME') return false;
          if (linkedForecastIds.has(f.id)) return false;

          const fDate = new Date(f.date);
          if (fDate.getMonth() !== txMonth || fDate.getFullYear() !== txYear) return false;

          const fProj = f.project?.trim() || 'Generale';
          if (fProj !== txProj) return false;

          if (f.category !== txCat) return false;

          return true;
        });

        if (matchingForecast) {
          tx.linkedForecastId = matchingForecast.id;
          linkedForecastIds.add(matchingForecast.id);
        }
      }

      return tx;
    });

    onSalvaSessione(session);
    onImport(transactions);
    onAggiornaBozza(daSospendere);

    setImportateCount(daImportare.length);
    setSospesCount(daSospendere.length);
    setDuplicatiIgnorati(duplicati.length);
    setStep('completato');
  };

  // ─── STATISTICHE ─────────────────────────────────────────────
  const totale = righe.length;
  const duplicati = righe.filter(r => r.isDuplicato).length;
  const autoClassificate = righe.filter(r => !r.isDuplicato && r.categoria && r.confidenza === 'alta' && r.vatRateSuggerito !== null && (r.riga.tipoMovimento !== 'FEA' || r.tipoEntrata !== null)).length;
  const daRevisione = righe.filter(r => !r.isDuplicato && (!r.categoria || r.confidenza === 'bassa' || r.vatRateSuggerito === null || (r.riga.tipoMovimento === 'FEA' && r.tipoEntrata === null))).length;
  const confermate = righe.filter(r => r.confermata).length;

  const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center">
              <Database size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Importazione Punta Net</h2>
              <p className="text-xs text-slate-400">Sistema di riconciliazione bancaria evoluto</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all">
            <X size={18} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* ── STEP: UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">File Movimenti Banca (Obbligatorio)</p>
                <label className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 transition-all cursor-pointer ${fileBanca ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50'}`}>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFileBanca(e.target.files?.[0] ?? null)} />
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${fileBanca ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                    {fileBanca ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700">{fileBanca ? fileBanca.name : 'Seleziona Cartel1.xlsx'}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{fileBanca ? 'File caricato ✓' : 'Trascina qui o clicca per sfogliare'}</p>
                  </div>
                </label>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">File di Dettaglio (Opzionali)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${fileFEP ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleSetFileFEP(e.target.files?.[0] ?? null)} />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fileFEP ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                      <FileText size={20} />
                    </div>
                    <p className="text-[11px] font-bold text-slate-700 text-center truncate w-full" title={fileFEP ? fileFEP.name : '📤 USCITE (FEP)'}>
                      {fileFEP ? fileFEP.name : '📤 USCITE (FEP)'}
                    </p>
                  </label>

                  <label className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${fileFEA ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleSetFileFEA(e.target.files?.[0] ?? null)} />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fileFEA ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                      <FileText size={20} />
                    </div>
                    <p className="text-[11px] font-bold text-slate-700 text-center truncate w-full" title={fileFEA ? fileFEA.name : '📥 ENTRATE (FEA 1)'}>
                      {fileFEA ? fileFEA.name : '📥 ENTRATE (FEA 1)'}
                    </p>
                  </label>

                  <label className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${fileFEA2 ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}>
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleSetFileFEA2(e.target.files?.[0] ?? null)} />
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fileFEA2 ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                      <FileText size={20} />
                    </div>
                    <p className="text-[11px] font-bold text-slate-700 text-center truncate w-full" title={fileFEA2 ? fileFEA2.name : '📥 ENTRATE (FEA 2)'}>
                      {fileFEA2 ? fileFEA2.name : '📥 ENTRATE (FEA 2)'}
                    </p>
                  </label>
                </div>
              </div>

              {errore && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
                  <AlertCircle size={18} className="text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">{errore}</p>
                </div>
              )}

              <button
                disabled={!fileBanca || loading}
                onClick={handleAnalizza}
                className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-xl"
              >
                {loading ? <RefreshCw size={20} className="animate-spin" /> : <Zap size={20} />}
                Analizza e Classifica
              </button>
            </div>
          )}

          {/* ── STEP: MAPPA CONTI ── */}
          {step === 'mappaConti' && (
            <div className="space-y-6">
              <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 flex items-start gap-3">
                <HelpCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">Associa i codici conto B e I ai tuoi conti bancari configurati.</p>
              </div>
              <div className="space-y-4">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-xs font-black text-slate-500 uppercase">Conto B (Principale)</p>
                  <select value={mappingConti.flagB} onChange={e => setMappingConti(m => ({ ...m, flagB: e.target.value }))} className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold">
                    {contiConfigurati.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-xs font-black text-slate-500 uppercase">Conto I (Intesa)</p>
                  <select value={mappingConti.flagI} onChange={e => setMappingConti(m => ({ ...m, flagI: e.target.value }))} className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold">
                    {contiConfigurati.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => setStep('revisione')} className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all">
                Conferma Mapping
              </button>
            </div>
          )}

          {/* ── STEP: REVISIONE ── */}
          {step === 'revisione' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center">
                  <p className="text-xl font-black text-emerald-700">{autoClassificate}</p>
                  <p className="text-[9px] font-black text-emerald-600 uppercase">Auto ✓</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100 text-center">
                  <p className="text-xl font-black text-amber-700">{daRevisione}</p>
                  <p className="text-[9px] font-black text-amber-600 uppercase">Da fare</p>
                </div>
                <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-center">
                  <p className="text-xl font-black text-rose-700">{duplicati}</p>
                  <p className="text-[9px] font-black text-rose-600 uppercase">Duplicati</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                  <p className="text-xl font-black text-slate-700">{totale}</p>
                  <p className="text-[9px] font-black text-slate-500 uppercase">Totale</p>
                </div>
              </div>

              {/* Sezione Duplicati */}
              {duplicati > 0 && (
                <div className="space-y-2">
                  <button onClick={() => setShowDuplicati(!showDuplicati)} className="w-full flex items-center justify-between px-4 py-2 bg-rose-50 text-rose-700 rounded-xl text-xs font-black uppercase tracking-widest">
                    <span>{duplicati} Movimenti già importati</span>
                    {showDuplicati ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showDuplicati && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                      {righe.filter(r => r.isDuplicato).map((r, idx) => (
                        <div key={idx} className="bg-white border border-rose-100 rounded-xl p-3 flex items-center justify-between opacity-60">
                          <div>
                            <p className="text-[11px] font-bold text-slate-700">{r.riga.entity}</p>
                            <p className="text-[9px] text-rose-500">Livello {r.livelloDuplicato} — {r.riga.data.toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black font-mono">{formatEuro(r.riga.importo)}</span>
                            <button onClick={() => setRighe(righe.map(x => x === r ? { ...x, isDuplicato: false, confermata: false } : x))} className="text-[9px] font-black text-rose-600 hover:underline">IMPORTA UGUALE</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sezione Da Completare */}
              <div className="space-y-3">
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Movimenti da classificare ({daRevisione})</p>
                {righe.filter(r => !r.isDuplicato && (!r.categoria || r.confidenza === 'bassa' || r.vatRateSuggerito === null || (r.riga.tipoMovimento === 'FEA' && r.tipoEntrata === null))).map((r, idx) => {
                  const realIdx = righe.indexOf(r);
                  return (
                    <div key={realIdx} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate">{r.riga.entity}</p>
                          <p className="text-[10px] text-slate-500 truncate">{r.riga.descrizione}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-black font-mono ${r.riga.tipo === 'INCOME' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {r.riga.tipo === 'INCOME' ? '+' : '-'}{formatEuro(r.riga.importo)}
                          </p>
                        </div>
                      </div>

                      {/* Badge Cantiere */}
                      <div className="flex flex-wrap gap-2">
                        {r.cantierePuntaNet && (
                          <div className={`px-2 py-1 rounded-lg text-[9px] font-black flex items-center gap-1.5 ${r.cantiereScore >= 80 ? 'bg-emerald-100 text-emerald-700' : r.cantiereScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                            {r.cantiereScore >= 40 ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                            {r.cantiereSuggerito ? (r.cantiereScore >= 80 ? `✓ ${r.cantiereSuggerito}` : `≈ ${r.cantiereSuggerito} (${r.cantiereScore}%)`) : `⚠ Non abbinato: ${r.cantierePuntaNet}`}
                          </div>
                        )}
                        {r.arricchitoDaFattura && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[9px] font-black uppercase">Arricchito ✓</span>}
                      </div>

                      {/* Azioni */}
                      {r.riga.tipoMovimento === 'FEA' && r.tipoEntrata === null ? (
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => selezionaTipoEntrata(realIdx, 'sal')} className="p-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold hover:border-emerald-500 transition-all">SAL</button>
                          <button onClick={() => selezionaTipoEntrata(realIdx, 'acconto')} className="p-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold hover:border-emerald-500 transition-all">Acconto</button>
                          <button onClick={() => selezionaTipoEntrata(realIdx, 'saldo')} className="p-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold hover:border-emerald-500 transition-all">Saldo Finale</button>
                          <button onClick={() => selezionaTipoEntrata(realIdx, 'immobile')} className="p-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold hover:border-emerald-500 transition-all">Vendita Immobile</button>
                          <button onClick={() => selezionaTipoEntrata(realIdx, 'altro')} className="p-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold hover:border-emerald-500 transition-all col-span-2">Altro</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <select value={r.categoria ?? ''} onChange={e => aggiornaCategoria(realIdx, e.target.value)} className="w-full p-2 rounded-xl border border-slate-200 text-[11px] font-bold">
                            <option value="">Seleziona categoria...</option>
                            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={r.vatRateConfermato ?? r.vatRateSuggerito ?? ''} onChange={e => aggiornaVatRate(realIdx, Number(e.target.value))} className="w-full p-2 rounded-xl border border-slate-200 text-[11px] font-bold">
                            <option value="">IVA...</option>
                            <option value="0">0% (Esente)</option>
                            <option value="4">4%</option>
                            <option value="10">10%</option>
                            <option value="22">22%</option>
                          </select>
                        </div>
                      )}

                      {/* Selettore Cantiere */}
                      <div className="mt-2 space-y-1">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Abbinamento Cantiere</p>
                        <select 
                          value={r.cantiereSuggerito ?? ''} 
                          onChange={e => aggiornaCantiere(realIdx, e.target.value)} 
                          className="w-full p-2 rounded-xl border border-slate-200 text-[11px] font-bold bg-white"
                        >
                          <option value="">Nessun cantiere (Spese Generali)</option>
                          {cantieriApp.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sezione Auto-Classificati */}
              <div>
                <button onClick={() => setShowAutoClassificati(!showAutoClassificati)} className="w-full flex items-center justify-between px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest">
                  <span>{autoClassificate} Classificati automaticamente</span>
                  {showAutoClassificati ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showAutoClassificati && (
                  <div className="mt-2 space-y-2">
                    {righe.filter(r => !r.isDuplicato && r.categoria && r.confidenza === 'alta' && r.vatRateSuggerito !== null && (r.riga.tipoMovimento !== 'FEA' || r.tipoEntrata !== null)).map((r, idx) => (
                      <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-700 truncate">{r.riga.entity}</p>
                          <p className="text-[9px] text-slate-400 truncate">{r.categoria} · IVA {r.vatRateSuggerito}%</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-xs font-black font-mono text-slate-600">{formatEuro(r.riga.importo)}</p>
                          {r.arricchitoDaFattura && <span className="text-[8px] font-black text-blue-500 uppercase">Arricchito ✓</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: COMPLETATO ── */}
          {step === 'completato' && (
            <div className="py-12 flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-[32px] flex items-center justify-center text-emerald-600">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900">Ottimo lavoro!</h3>
                <p className="text-slate-500">I dati sono stati elaborati con successo.</p>
              </div>
              <div className="w-full max-w-sm grid grid-cols-1 gap-3">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-800">Transazioni aggiunte</span>
                  <span className="text-lg font-black text-emerald-600">{importateCount}</span>
                </div>
                {sospesCount > 0 && (
                  <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-800">In attesa di revisione</span>
                    <span className="text-lg font-black text-amber-600">{sospesCount}</span>
                  </div>
                )}
                {duplicatiIgnorati > 0 && (
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-500">Duplicati ignorati</span>
                    <span className="text-lg font-black text-slate-400">{duplicatiIgnorati}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-4 w-full max-w-sm pt-4">
                {sospesCount > 0 && (
                  <button onClick={() => setStep('revisione')} className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all">
                    Continua ({sospesCount})
                  </button>
                )}
                <button onClick={onClose} className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-lg">
                  Chiudi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Revisione */}
        {step === 'revisione' && (
          <div className="px-8 py-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="text-left">
                <p className="text-xs font-black text-slate-900">{confermate} confermate</p>
                <p className="text-[10px] text-slate-400">{daRevisione} da completare</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => {
                  if (window.confirm("Sei sicuro di voler annullare questa importazione in sospeso? Tutti i dati analizzati verranno persi.")) {
                    onAggiornaBozza([]);
                    setFileBanca(null);
                    handleSetFileFEP(null);
                    handleSetFileFEA(null);
                    setStep('upload');
                  }
                }} 
                className="px-4 py-2 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-all"
              >
                Annulla Import
              </button>
              <button onClick={() => setRighe(righe.map(r => ({ ...r, confermata: r.categoria !== null && !r.isDuplicato })))} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900">Conferma tutte</button>
              <button
                onClick={importa}
                disabled={confermate === 0}
                className="px-6 py-3 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-40"
              >
                Importa {confermate} transazioni
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportPuntaNetModal;
