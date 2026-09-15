import React, { useCallback, useEffect, useState } from 'react';
import { HardHat, Building2, CalendarClock, Check, RotateCcw, BellRing } from 'lucide-react';
import { fetchPaymentAlerts, setPaymentAlertRead, PaymentAlert } from '../services/paymentAlertsSync';

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

export function PagamentiFornitoriTab() {
  const [alerts, setAlerts] = useState<PaymentAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPaymentAlerts();
      setAlerts(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Errore di caricamento');
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleLetto = async (alert: PaymentAlert) => {
    setSavingId(alert.id);
    setAlerts(prev => prev ? prev.map(a => a.id === alert.id ? { ...a, letto: !a.letto } : a) : prev);
    try {
      await setPaymentAlertRead(alert.id, !alert.letto);
    } catch (e: any) {
      setError(e.message || 'Errore di salvataggio');
    } finally {
      setSavingId(null);
    }
  };

  const daGestire = (alerts || []).filter(a => !a.letto);
  const gestiti = (alerts || []).filter(a => a.letto);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BellRing className="text-amber-500" size={22} /> Pagamenti Fornitori in Arrivo
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Avvisi generati da Direttore Cantiere quando una lavorazione assegnata a un fornitore con pagamento legato a
          fine lavorazione viene segnata come finita — probabile richiesta di acconto/saldo in arrivo.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl">{error}</div>
      )}

      {alerts === null && !error && (
        <div className="p-10 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl">Caricamento...</div>
      )}

      {alerts !== null && alerts.length === 0 && (
        <div className="p-10 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl">
          Nessun avviso ancora. Compare qui quando una lavorazione di un fornitore con pagamento a fine lavorazione viene segnata come finita in Direttore Cantiere.
        </div>
      )}

      {daGestire.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-amber-600 uppercase tracking-wider">Da gestire ({daGestire.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {daGestire.map(a => (
              <div key={a.id} className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-sm text-slate-800">{a.fornitoreNome}</div>
                  <button
                    onClick={() => toggleLetto(a)}
                    disabled={savingId === a.id}
                    className="flex items-center gap-1 px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 disabled:opacity-50"
                  >
                    <Check size={12} /> Gestito
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600"><Building2 size={12} className="text-slate-400" /> {a.cantiereNome}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600"><HardHat size={12} className="text-slate-400" /> {a.lavorazioneNome}</div>
                {a.dataCompletamento && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={12} className="text-slate-400" /> Finita il {dateFmt(a.dataCompletamento)}</div>
                )}
                {a.note && <p className="text-[11px] text-slate-500 italic border-t border-amber-200 pt-2">{a.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {gestiti.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Gestiti ({gestiti.length})</h3>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
            {gestiti.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 bg-white text-sm text-slate-400">
                <span className="flex-1 truncate">
                  <span className="font-bold text-slate-600">{a.fornitoreNome}</span> — {a.cantiereNome} · {a.lavorazioneNome}
                  {a.dataCompletamento && ` · ${dateFmt(a.dataCompletamento)}`}
                </span>
                <button
                  onClick={() => toggleLetto(a)}
                  disabled={savingId === a.id}
                  title="Segna di nuovo da gestire"
                  className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-amber-600 rounded-lg text-[10px] font-bold uppercase shrink-0 disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
