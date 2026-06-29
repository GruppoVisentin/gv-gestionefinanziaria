import React, { useMemo, useState } from 'react';
import { Transaction } from '../types';
import { CheckCircle, AlertTriangle, Trash2, X } from 'lucide-react';

interface DiagnosticModalProps {
  transactions: Transaction[];
  onClose: () => void;
  onFixDuplicates: (cleanedTransactions: Transaction[]) => void;
}

interface Anomaly {
  id: string;
  type: 'DUPLICATE' | 'INVALID_AMOUNT' | 'MISSING_CAT' | 'VAT_MATH';
  message: string;
  tx: Transaction;
}

export const DiagnosticModal: React.FC<DiagnosticModalProps> = ({ transactions, onClose, onFixDuplicates }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'details'>('summary');
  
  const actuals = useMemo(() => transactions.filter(t => !t.isForecast), [transactions]);

  const anomalies = useMemo(() => {
    const list: Anomaly[] = [];
    const seen = new Set<string>();

    actuals.forEach(t => {
      // 1. Amount check
      if (t.amount <= 0) {
        list.push({
          id: t.id,
          type: 'INVALID_AMOUNT',
          message: `Importo nullo o negativo: € ${t.amount}`,
          tx: t
        });
      }

      // 2. Category check
      if (!t.category || t.category.trim() === '') {
        list.push({
          id: t.id,
          type: 'MISSING_CAT',
          message: 'Categoria non assegnata',
          tx: t
        });
      }

      // 3. Duplicate check
      const fingerprint = `${t.date}|${t.amount}|${t.description.trim()}|${t.type}`;
      if (seen.has(fingerprint)) {
        list.push({
          id: t.id,
          type: 'DUPLICATE',
          message: `Movimento duplicato rilevato`,
          tx: t
        });
      } else {
        seen.add(fingerprint);
      }
    });

    return list;
  }, [actuals]);

  const duplicates = useMemo(() => anomalies.filter(a => a.type === 'DUPLICATE'), [anomalies]);

  const handleResolveDuplicates = () => {
    const seen = new Set<string>();
    const cleaned = transactions.filter(t => {
      if (t.isForecast) return true;
      const fingerprint = `${t.date}|${t.amount}|${t.description.trim()}|${t.type}`;
      if (seen.has(fingerprint)) {
        return false; // delete duplicate
      }
      seen.add(fingerprint);
      return true;
    });
    onFixDuplicates(cleaned);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Diagnostica Database</h3>
            <p className="text-xs text-slate-500">Controllo integrità e deduplica dei dati consuntivi</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex px-8 border-b border-slate-100 shrink-0 bg-slate-50/50">
          <button 
            onClick={() => setActiveTab('summary')}
            className={`py-4 text-xs font-bold border-b-2 mr-6 transition-all ${activeTab === 'summary' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            Riepilogo Stato
          </button>
          <button 
            onClick={() => setActiveTab('details')}
            className={`py-4 text-xs font-bold border-b-2 transition-all ${activeTab === 'details' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            Anomalie ({anomalies.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === 'summary' ? (
            <div className="space-y-6">
              {/* Status banner */}
              {anomalies.length === 0 ? (
                <div className="p-6 bg-emerald-50 rounded-2xl flex items-start text-emerald-800">
                  <CheckCircle className="mr-4 shrink-0 text-emerald-600" size={24} />
                  <div>
                    <h4 className="font-bold text-sm">Database integro</h4>
                    <p className="text-xs mt-1 text-emerald-700">Tutti i controlli sono passati. Non sono presenti doppioni o anomalie sui dati consuntivi.</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-amber-50 rounded-2xl flex items-start text-amber-800">
                  <AlertTriangle className="mr-4 shrink-0 text-amber-600" size={24} />
                  <div>
                    <h4 className="font-bold text-sm">Rilevate anomalie nel database</h4>
                    <p className="text-xs mt-1 text-amber-700">Ci sono {anomalies.length} anomalie che richiedono attenzione, inclusi {duplicates.length} duplicati.</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Transazioni Consuntive Totali</span>
                  <div className="text-2xl font-black text-slate-900 mt-1">{actuals.length}</div>
                </div>
                <div className="p-5 border border-slate-100 rounded-2xl">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Errori/Doppioni Rilevati</span>
                  <div className={`text-2xl font-black mt-1 ${anomalies.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {anomalies.length}
                  </div>
                </div>
              </div>

              {/* Actions */}
              {duplicates.length > 0 && (
                <div className="p-6 border border-amber-100 bg-amber-50/20 rounded-2xl flex items-center justify-between">
                  <div className="max-w-[70%]">
                    <h5 className="font-bold text-xs text-slate-900">Risoluzione automatica duplicati</h5>
                    <p className="text-[11px] text-slate-500 mt-1">L'applicazione ha rilevato {duplicates.length} duplicati effettivi di cassa. Puoi rimuoverli automaticamente mantenendo la prima copia valida.</p>
                  </div>
                  <button 
                    onClick={handleResolveDuplicates}
                    className="flex items-center px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                  >
                    <Trash2 size={14} className="mr-2" />
                    Rimuovi Doppioni
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {anomalies.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">Nessuna anomalia riscontrata nel database.</div>
              ) : (
                anomalies.map((a, i) => (
                  <div key={a.id} className="p-4 border border-slate-100 rounded-2xl flex justify-between items-center text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black mr-2 uppercase ${
                          a.type === 'DUPLICATE' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {a.type}
                        </span>
                        <span className="font-black text-slate-700">{a.tx.date}</span>
                      </div>
                      <p className="text-slate-900 font-medium">{a.tx.description}</p>
                      <p className="text-[10px] text-slate-400">{a.message}</p>
                    </div>
                    <div className="text-right shrink-0 font-mono font-bold text-slate-900 ml-4">
                      € {a.tx.amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-slate-100 shrink-0 bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors">
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
