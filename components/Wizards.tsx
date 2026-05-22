import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Save, 
  Calendar, 
  Settings, 
  Building2, 
  Calculator,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  ArrowRight,
  Info,
  Layout
} from 'lucide-react';
import { 
  Transaction, 
  TransactionType, 
  CEType, 
  TipologiaCantiere, 
  CantierePrev, 
  VoceCostoTipologia, 
  FaseDistribuzione 
} from '../types';
import { 
  VARIABLE_COST_CATEGORIES, 
  CATEGORY_TO_CE_TYPE, 
  CURRENCY_FORMATTER 
} from '../constants';
import TipologiaGantt from './TipologiaGantt';

// ─── UTILS ───────────────────────────────────────────────────────

const generateId = () => Math.random().toString(36).substr(2, 9);

const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

// ─── YEAR START WIZARD ───────────────────────────────────────────

interface YearStartWizardProps {
  transactions: Transaction[];
  onSave: (newTransactions: Transaction[]) => void;
  onClose: () => void;
}

export const YearStartWizard: React.FC<YearStartWizardProps> = ({ transactions, onSave, onClose }) => {
  const [step, setStep] = useState(1);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [proposedTransactions, setProposedTransactions] = useState<Partial<Transaction>[]>([]);

  // Step 1: Check existing forecasts
  const categorieGiaImportate = useMemo(() => 
    new Set(
      transactions
        .filter(tx => tx.isForecast && new Date(tx.date).getFullYear() === targetYear)
        .map(tx => tx.category)
    ),
    [transactions, targetYear]
  );

  const existingForecastsCount = useMemo(() => 
    transactions.filter(tx => tx.isForecast && new Date(tx.date).getFullYear() === targetYear).length,
    [transactions, targetYear]
  );

  const handleStart = () => {
    const prevYear = targetYear - 1;
    const esclusi: CEType[] = ['onere_finanziario', 'ammortamento'];
    
    const historical = transactions.filter(tx => {
      const d = new Date(tx.date);
      return !tx.isForecast && 
             d.getFullYear() === prevYear && 
             tx.ceType && 
             !esclusi.includes(tx.ceType) &&
             !categorieGiaImportate.has(tx.category);
    });

    const proposed = historical.map(tx => {
      const d = new Date(tx.date);
      const newDate = new Date(targetYear, d.getMonth(), d.getDate()).toISOString().split('T')[0];
      return {
        id: generateId(),
        date: newDate,
        amount: tx.amount,
        vatRate: tx.vatRate ?? 0,
        type: tx.type,
        category: tx.category,
        description: tx.description,
        ceType: tx.ceType,
        isForecast: true
      };
    });

    setProposedTransactions(proposed as Partial<Transaction>[]);
    setStep(2);
  };

  const handleUpdateProposed = (id: string, field: string, value: any) => {
    setProposedTransactions(prev => prev.map(tx => {
      if (tx.id === id) {
        if (field === 'month') {
          const d = new Date(tx.date!);
          const newDate = new Date(targetYear, value, d.getDate()).toISOString().split('T')[0];
          return { ...tx, date: newDate };
        }
        return { ...tx, [field]: value };
      }
      return tx;
    }));
  };

  const handleRemoveProposed = (id: string) => {
    setProposedTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  const handleAddManual = () => {
    const newTx: Partial<Transaction> = {
      id: generateId(),
      date: new Date(targetYear, 0, 1).toISOString().split('T')[0],
      amount: 0,
      vatRate: 22,
      type: TransactionType.EXPENSE,
      category: "[CONSULENZE] Commercialista",
      description: "Nuovo Previsionale Manuale",
      ceType: 'costo_fisso',
      isForecast: true
    };
    setProposedTransactions(prev => [newTx, ...prev]);
  };

  const totalsByCeType = useMemo(() => {
    const totals: Record<string, number> = {};
    proposedTransactions.forEach(tx => {
      const type = tx.ceType || 'altro';
      totals[type] = (totals[type] || 0) + (tx.amount || 0);
    });
    return totals;
  }, [proposedTransactions]);

  const handleConfirm = () => {
    onSave(proposedTransactions as Transaction[]);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Calendar className="text-slate-900" />
              Wizard Inizio Anno: Costi Fissi
            </h2>
            <p className="text-xs text-slate-500 font-medium">Generazione automatica previsionali da storico</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="max-w-md mx-auto space-y-6 py-8">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex gap-3">
                <Info className="text-slate-500 shrink-0" size={20} />
                <p className="text-sm text-slate-700">
                  Questo wizard copierà tutti i costi fissi (stipendi ufficio, affitti, utenze) 
                  dall'anno precedente come previsionali per l'anno selezionato.
                  <br /><br />
                  <strong className="text-slate-900">Nota:</strong> Oneri finanziari (rate) e ammortamenti sono esclusi poiché calcolati automaticamente dai finanziamenti registrati in Gestisci.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Anno Target</label>
                <select 
                  value={targetYear} 
                  onChange={e => setTargetYear(parseInt(e.target.value))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {[targetYear - 1, targetYear, targetYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {existingForecastsCount > 0 && (
                <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 flex gap-3">
                  <AlertTriangle className="text-slate-500 shrink-0" size={20} />
                  <p className="text-sm text-slate-700">
                    Attenzione: esistono già <strong>{existingForecastsCount}</strong> previsionali per il {targetYear}. 
                    Il wizard aggiungerà solo le categorie mancanti.
                  </p>
                </div>
              )}

              <button 
                onClick={handleStart}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                Analizza Storico {targetYear - 1}
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3 text-amber-800 text-[11px] font-medium leading-relaxed">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                  I previsionali sotto riportati sono derivati dallo storico. Le rate dei mutui e gli ammortamenti non sono inclusi in questo elenco 
                  perché sono generati dinamicamente dal sistema Cash Flow sulla base dei finanziamenti attivi in Gestisci.
                </p>
              </div>

              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800">Revisione Proposte ({proposedTransactions.length})</h3>
                <button 
                  onClick={handleAddManual}
                  className="text-xs font-bold text-slate-600 hover:text-slate-700 flex items-center gap-1 bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={14} /> Aggiungi voce manuale
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase">Categoria</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase">Mese</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase text-right">Importo</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase text-center">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedTransactions.map(tx => (
                      <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="py-2 px-4">
                          <div className="text-[11px] font-bold text-slate-700 truncate max-w-[250px]">{tx.category}</div>
                          <div className="text-[9px] text-slate-400 truncate max-w-[250px]">{tx.description}</div>
                        </td>
                        <td className="py-2 px-4">
                          <select 
                            value={new Date(tx.date!).getMonth()} 
                            onChange={e => handleUpdateProposed(tx.id!, 'month', parseInt(e.target.value))}
                            className="text-[11px] bg-transparent border-none p-0 font-medium text-slate-600 outline-none"
                          >
                            {MONTHS_SHORT.map((m, i) => <option key={i} value={i}>{m}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-4 text-right">
                          <input 
                            type="number" 
                            value={tx.amount} 
                            onChange={e => handleUpdateProposed(tx.id!, 'amount', parseFloat(e.target.value) || 0)}
                            className="w-24 text-right text-[11px] font-mono font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-slate-500"
                          />
                        </td>
                        <td className="py-2 px-4 text-center">
                          <button 
                            onClick={() => handleRemoveProposed(tx.id!)}
                            className="p-1.5 text-slate-300 hover:text-slate-900 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-4">
                <div className="space-y-1 text-center border-r border-slate-200">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Costi Fissi</span>
                  <div className="text-sm font-bold text-slate-700">{CURRENCY_FORMATTER.format(totalsByCeType['costo_fisso'] || 0)}</div>
                </div>
                <div className="space-y-1 text-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Costi Studio</span>
                  <div className="text-sm font-bold text-slate-700">{CURRENCY_FORMATTER.format(totalsByCeType['costo_studio'] || 0)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          {step === 2 && (
            <button 
              onClick={() => setStep(1)}
              className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Indietro
            </button>
          )}
          <div className="flex-1" />
          {step === 2 && (
            <button 
              onClick={handleConfirm}
              className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
            >
              <CheckCircle2 size={18} />
              Conferma e Genera Previsionali
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── SV-B: TIPOLOGIE CANTIERE MANAGER ────────────────────────────

interface TipologiaManagerProps {
  tipologie: TipologiaCantiere[];
  onSave: (t: TipologiaCantiere) => void;
  onDelete: (id: string) => void;
  isAuthorized: boolean;
  variableCategories: string[];
}

export const TipologiaManager: React.FC<TipologiaManagerProps> = ({ tipologie, onSave, onDelete, isAuthorized, variableCategories }) => {
  const [isEditing, setIsEditing] = useState<TipologiaCantiere | null>(null);
  const [isGanttOpen, setIsGanttOpen] = useState<TipologiaCantiere | null>(null);

  const handleNew = () => {
    setIsEditing({
      id: generateId(),
      nome: '',
      vociAttive: []
    });
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-amber-100 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black text-amber-900 flex items-center gap-2">
            <Building2 className="text-amber-600" />
            Tipologie Cantiere
          </h3>
          <p className="text-xs text-amber-600/70">Definisci regole di distribuzione costi per tipo di lavoro</p>
        </div>
        {isAuthorized && (
          <button 
            onClick={handleNew}
            className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus size={16} /> Nuova Tipologia
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {tipologie.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-slate-400 italic text-sm">Nessuna tipologia definita.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Crea una tipologia (es. "Palazzina Completa"), poi usa il tasto 
              <span className="font-black text-amber-600"> 📊 Piano Distribuzione</span> per 
              impostare graficamente come si distribuiscono i costi mese per mese.
            </p>
          </div>
        ) : (
          tipologie.map(t => (
            <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
              <div>
                <div className="font-bold text-slate-800">{t.nome}</div>
                <div className="text-[10px] text-slate-500">{t.vociAttive.length} voci di costo attive</div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsGanttOpen(t)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-black hover:bg-amber-600 transition-all shadow-sm"
                  title="Apri il piano grafico di distribuzione costi nel tempo"
                >
                  <Layout size={14} />
                  📊 Piano Distribuzione
                </button>
                <button 
                  onClick={() => setIsEditing(t)}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <Settings size={18} />
                </button>
                <button 
                  onClick={() => onDelete(t.id)}
                  className="p-2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isEditing && (
        <TipologiaForm 
          tipologia={isEditing} 
          onSave={(t) => { onSave(t); setIsEditing(null); }} 
          onClose={() => setIsEditing(null)} 
          variableCategories={variableCategories}
        />
      )}

      {isGanttOpen && (
        <TipologiaGantt
          tipologia={isGanttOpen}
          durataProgetto={12}
          importiStimati={{}}
          onSave={(t) => { onSave(t); setIsGanttOpen(null); }}
          onClose={() => setIsGanttOpen(null)}
          variableCategories={variableCategories}
        />
      )}
    </div>
  );
};

const TipologiaForm: React.FC<{ tipologia: TipologiaCantiere, onSave: (t: TipologiaCantiere) => void, onClose: () => void, variableCategories: string[] }> = ({ tipologia, onSave, onClose, variableCategories }) => {
  const [nome, setNome] = useState(tipologia.nome);
  const [descrizione, setDescrizione] = useState(tipologia.descrizione || '');
  const [vociAttive, setVociAttive] = useState<VoceCostoTipologia[]>(tipologia.vociAttive);

  const toggleVoce = (categoria: string) => {
    const exists = vociAttive.find(v => v.categoria === categoria);
    if (exists) {
      setVociAttive(prev => prev.filter(v => v.categoria !== categoria));
    } else {
      setVociAttive(prev => [...prev, {
        categoria,
        ceType: CATEGORY_TO_CE_TYPE[categoria] || 'costo_variabile',
        fasi: [{ id: generateId(), meseInizio: 1, meseFine: 1, percentuale: 100 }]
      }]);
    }
  };

  const updateFase = (cat: string, faseId: string, field: keyof FaseDistribuzione, value: any) => {
    setVociAttive(prev => prev.map(v => {
      if (v.categoria === cat) {
        return {
          ...v,
          fasi: v.fasi.map(f => f.id === faseId ? { ...f, [field]: value } : f)
        };
      }
      return v;
    }));
  };

  const addFase = (cat: string) => {
    setVociAttive(prev => prev.map(v => {
      if (v.categoria === cat) {
        const ultimaFase = v.fasi[v.fasi.length - 1];
        let meseInizio = 1;
        if (ultimaFase && ultimaFase.meseFine !== undefined) {
          const mFStr = ultimaFase.meseFine;
          const mF = typeof mFStr === 'string' ? parseInt(mFStr, 10) : mFStr;
          const startOffset = (mF > 0 ? mF - 1 : mF) + 1;
          meseInizio = startOffset >= 0 ? startOffset + 1 : startOffset;
        }
        const endOffset = (meseInizio > 0 ? meseInizio - 1 : meseInizio) + 1;
        const meseFine = endOffset >= 0 ? endOffset + 1 : endOffset;

        return {
          ...v,
          fasi: [...v.fasi, { id: generateId(), meseInizio, meseFine, percentuale: 0 }]
        };
      }
      return v;
    }));
  };

  const removeFase = (cat: string, faseId: string) => {
    setVociAttive(prev => prev.map(v => {
      if (v.categoria === cat) {
        return {
          ...v,
          fasi: v.fasi.filter(f => f.id !== faseId)
        };
      }
      return v;
    }));
  };

  const isValid = useMemo(() => {
    if (!nome) return false;
    for (const v of vociAttive) {
      const sum = v.fasi.reduce((s, f) => s + f.percentuale, 0);
      if (sum !== 100) return false;
    }
    return true;
  }, [nome, vociAttive]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-amber-100 flex justify-between items-center bg-amber-50">
          <h2 className="text-xl font-black text-amber-900">{tipologia.id ? 'Modifica' : 'Nuova'} Tipologia Cantiere</h2>
          <button onClick={onClose} className="p-2 hover:bg-amber-200 rounded-full transition-colors text-amber-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-amber-500 uppercase ml-1">Nome Tipologia</label>
              <input 
                type="text" 
                value={nome} 
                onChange={e => setNome(e.target.value)}
                placeholder="es. Palazzina Completa"
                className="w-full p-3 bg-amber-50/50 border border-amber-200 rounded-xl font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-amber-300"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-amber-500 uppercase ml-1">Descrizione</label>
              <input 
                type="text" 
                value={descrizione} 
                onChange={e => setDescrizione(e.target.value)}
                placeholder="Opzionale"
                className="w-full p-3 bg-amber-50/50 border border-amber-200 rounded-xl font-medium text-amber-900 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-amber-300"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider">Voci di Costo e Regole di Distribuzione</h3>
            <div className="space-y-3">
              {[
                "[PERSONALE] Subappalti Manodopera",
                "[FORNITORI] Fornitori Materiali",
                "[FORNITORI] Subappalti su Cantieri",
                "[CONSULENZE] Professionisti Esterni di Cantiere",
                "[CANTIERE] Assicurazione Cantieri",
                "[INVESTIMENTI] Acquisto Terreni per Sviluppo",
                "[INVESTIMENTI] Investimento in Nuova Società",
                "[CANTIERE] Mediazione Agenzia",
                "[FINANZA] Interessi su Mutuo Cantiere"
              ].map(cat => {
                const activeVoce = vociAttive.find(v => v.categoria === cat);
                const sumPct = activeVoce?.fasi.reduce((s, f) => s + f.percentuale, 0) || 0;
                
                return (
                  <div key={cat} className={`border rounded-2xl transition-all ${activeVoce ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100 bg-white'}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={!!activeVoce} 
                          onChange={() => toggleVoce(cat)}
                          className="w-5 h-5 rounded-lg border-amber-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className={`text-sm font-bold ${activeVoce ? 'text-amber-900' : 'text-slate-400'}`}>{cat}</span>
                      </div>
                      {activeVoce && (
                        <div className={`text-[10px] font-black px-2 py-1 rounded-full ${sumPct === 100 ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-600'}`}>
                          {sumPct}% TOTALE
                        </div>
                      )}
                    </div>

                    {activeVoce && (
                      <div className="px-4 pb-4 space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          {activeVoce.fasi.map((f, idx) => (
                            <div key={f.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-amber-100 shadow-sm">
                              <div className="text-[10px] font-black text-amber-400 w-12 uppercase">Fase {idx + 1}</div>
                              <div className="flex-1 flex items-center gap-2">
                                <span className="text-[10px] text-amber-400 font-bold">DAL</span>
                                <input 
                                  type="text" 
                                  value={f.meseInizio === undefined ? '' : f.meseInizio} 
                                  onChange={e => {
                                      const valStr = e.target.value;
                                      if (valStr === '' || valStr === '-') {
                                          updateFase(cat, f.id, 'meseInizio', valStr as any);
                                      } else {
                                          const val = parseInt(valStr, 10);
                                          if (!isNaN(val) && val !== 0) updateFase(cat, f.id, 'meseInizio', val);
                                      }
                                  }}
                                  className="w-12 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-center text-amber-900"
                                />
                                <span className="text-[10px] text-amber-400 font-bold">AL</span>
                                <input 
                                  type="text" 
                                  value={f.meseFine === undefined ? '' : f.meseFine} 
                                  onChange={e => {
                                      const valStr = e.target.value;
                                      if (valStr === '' || valStr === '-') {
                                          updateFase(cat, f.id, 'meseFine', valStr as any);
                                      } else {
                                          const val = parseInt(valStr, 10);
                                          if (!isNaN(val) && val !== 0) updateFase(cat, f.id, 'meseFine', val);
                                      }
                                  }}
                                  className="w-12 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-center text-amber-900"
                                />
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                <span className="text-[10px] text-amber-400 font-bold">QUOTA</span>
                                <input 
                                  type="number" 
                                  value={f.percentuale} 
                                  onChange={e => updateFase(cat, f.id, 'percentuale', parseInt(e.target.value) || 0)}
                                  className="w-16 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-center text-amber-900"
                                />
                                <span className="text-[10px] text-amber-400 font-bold">%</span>
                              </div>
                              <button 
                                onClick={() => removeFase(cat, f.id)}
                                className="p-1.5 text-amber-300 hover:text-amber-600 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={() => addFase(cat)}
                          className="text-[10px] font-black text-amber-600 hover:text-amber-700 flex items-center gap-1"
                        >
                          <Plus size={12} /> Aggiungi Fase
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-amber-100 bg-amber-50 flex justify-end">
          <button 
            onClick={() => onSave({ id: tipologia.id, nome, descrizione, vociAttive })}
            disabled={!isValid}
            className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 ${isValid ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
          >
            <Save size={18} />
            Salva Tipologia
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SV-B: WIZARD CANTIERI PREVISIONALI ──────────────────────────

interface CantiereWizardProps {
  tipologie: TipologiaCantiere[];
  cantieriPrev: CantierePrev[];
  onSaveCantiere: (c: CantierePrev) => void;
  onDeleteCantiere: (id: string) => void;
  onGenerateTransactions: (c: CantierePrev) => void;
  onDeleteGenerated: (c: CantierePrev) => void;
  onClose: () => void;
}

export const CantiereWizard: React.FC<CantiereWizardProps> = ({ 
  tipologie, 
  cantieriPrev, 
  onSaveCantiere, 
  onDeleteCantiere, 
  onGenerateTransactions,
  onDeleteGenerated,
  onClose 
}) => {
  const [step, setStep] = useState(1);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [isAdding, setIsAdding] = useState<CantierePrev | null>(null);

  const filteredCantieri = useMemo(() => 
    cantieriPrev.filter(c => new Date(c.dataInizio).getFullYear() === targetYear),
    [cantieriPrev, targetYear]
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Building2 className="text-slate-900" />
              Pianificazione Cantieri Previsionali {targetYear}
            </h2>
            <p className="text-xs text-slate-500 font-medium">Gestisci i cantieri futuri e genera i flussi di cassa stimati</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-slate-100 rounded-xl p-1">
                <button onClick={() => setTargetYear(prev => prev - 1)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ChevronLeft size={16} /></button>
                <span className="px-4 font-black text-slate-800">{targetYear}</span>
                <button onClick={() => setTargetYear(prev => prev + 1)} className="p-2 hover:bg-white rounded-lg transition-all text-slate-600"><ChevronRight size={16} /></button>
              </div>
            </div>
            <button 
              onClick={() => setIsAdding({ id: generateId(), nome: '', tipologiaId: '', dataInizio: `${targetYear}-01-01`, costiStimati: {}, previsionaliGenerati: false })}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm"
            >
              <PlusCircle size={16} /> Aggiungi Cantiere Previsto
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredCantieri.length === 0 ? (
              <div className="p-12 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-3xl">
                Nessun cantiere pianificato per il {targetYear}.
              </div>
            ) : (
              filteredCantieri.map(c => {
                const tipologia = tipologie.find(t => t.id === c.tipologiaId);
                const totalCosti = Object.values(c.costiStimati).reduce((s, v) => s + v, 0);
                
                return (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-3xl p-5 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${c.previsionaliGenerati ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <Building2 size={24} />
                      </div>
                      <div>
                        <div className="font-black text-slate-900 text-lg">{c.nome}</div>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <span className="text-slate-600">{tipologia?.nome || 'Nessuna Tipologia'}</span>
                          <span>•</span>
                          <span>Inizio: {new Date(c.dataInizio).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span>
                          <span>•</span>
                          <span className="text-slate-900">Totale: {CURRENCY_FORMATTER.format(totalCosti)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex gap-1 mr-2">
                        <button onClick={() => setIsAdding(c)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Settings size={18} /></button>
                        <button onClick={() => onDeleteCantiere(c.id)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><Trash2 size={18} /></button>
                      </div>
                      
                      {c.previsionaliGenerati ? (
                        <button 
                          onClick={() => { if(window.confirm('Rigenerare i previsionali? Quelli esistenti per questo cantiere verranno eliminati.')) onDeleteGenerated(c); }}
                          className="bg-slate-100 text-slate-900 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all border border-slate-200 flex items-center gap-2"
                        >
                          <CheckCircle2 size={16} /> Rigenera Flussi
                        </button>
                      ) : (
                        <button 
                          onClick={() => onGenerateTransactions(c)}
                          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Calculator size={16} /> Genera Flussi
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {isAdding && (
        <CantierePrevForm 
          cantiere={isAdding} 
          tipologie={tipologie} 
          onSave={(c) => { onSaveCantiere(c); setIsAdding(null); }} 
          onClose={() => setIsAdding(null)} 
        />
      )}
    </div>
  );
};

const CantierePrevForm: React.FC<{ cantiere: CantierePrev, tipologie: TipologiaCantiere[], onSave: (c: CantierePrev) => void, onClose: () => void }> = ({ cantiere, tipologie, onSave, onClose }) => {
  const [nome, setNome] = useState(cantiere.nome);
  const [tipologiaId, setTipologiaId] = useState(cantiere.tipologiaId);
  const [dataInizio, setDataInizio] = useState(cantiere.dataInizio);
  const [costiStimati, setCostiStimati] = useState<Record<string, number>>(cantiere.costiStimati);

  const selectedTipologia = useMemo(() => tipologie.find(t => t.id === tipologiaId), [tipologie, tipologiaId]);

  const handleUpdateCosto = (cat: string, val: number) => {
    setCostiStimati(prev => ({ ...prev, [cat]: val }));
  };

  const isValid = nome && tipologiaId && dataInizio;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-black text-slate-900">{cantiere.id ? 'Modifica' : 'Nuovo'} Cantiere Previsionale</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nome Cantiere</label>
              <input 
                type="text" 
                value={nome} 
                onChange={e => setNome(e.target.value)}
                placeholder="es. Palazzina Via Roma"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tipologia</label>
              <select 
                value={tipologiaId} 
                onChange={e => setTipologiaId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-500"
              >
                <option value="">-- Seleziona --</option>
                {tipologie.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Data Inizio</label>
              <input 
                type="date" 
                value={dataInizio} 
                onChange={e => setDataInizio(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
          </div>

          {selectedTipologia ? (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Costi Totali Stimati per Voce</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedTipologia.vociAttive.map(v => (
                  <div key={v.categoria} className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 truncate mr-2">{v.categoria}</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="number" 
                        value={costiStimati[v.categoria] || ''} 
                        onChange={e => handleUpdateCosto(v.categoria, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-24 p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-right outline-none focus:ring-2 focus:ring-slate-500"
                      />
                      <span className="text-xs font-bold text-slate-400">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 italic text-sm">Seleziona una tipologia per inserire i costi.</div>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={() => onSave({ ...cantiere, nome, tipologiaId, dataInizio, costiStimati })}
            disabled={!isValid}
            className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 ${isValid ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
          >
            <Save size={18} />
            Salva Cantiere
          </button>
        </div>
      </div>
    </div>
  );
};
