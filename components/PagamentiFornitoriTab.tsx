import React, { useCallback, useEffect, useState } from 'react';
import { HardHat, Building2, CalendarClock, Check, RotateCcw, BellRing, ShieldCheck, ShieldAlert, Home, PlusCircle } from 'lucide-react';
import { Transaction, TransactionType } from '../types';
import { fetchIncassiVendite, aggiornaIncassoVendita, rifIncasso, IncassoVendita } from '../services/incassiVenditeSync';
import { fetchPaymentAlerts, setPaymentAlertRead, PaymentAlert } from '../services/paymentAlertsSync';

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
const currencyFmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

interface PagamentiFornitoriTabProps {
  transactions?: Transaction[];
  onSaveTransaction?: (data: Omit<Transaction, 'id'>) => void;
}

export function PagamentiFornitoriTab({ transactions, onSaveTransaction }: PagamentiFornitoriTabProps = {}) {
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
                {a.validato ? (
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg w-fit">
                    <ShieldCheck size={12} /> Confermato dal Direttore Cantiere{a.importoValidato != null ? ` — ${currencyFmt(a.importoValidato)}` : ''}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-1 rounded-lg w-fit">
                    <ShieldAlert size={12} /> Provvisorio — in attesa di validazione dal Direttore Cantiere{a.percentuale != null ? ` (${a.percentuale}% indicativo)` : ''}
                  </div>
                )}
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
                  {a.validato && a.importoValidato != null && ` · ${currencyFmt(a.importoValidato)}`}
                  {!a.validato && ' · provvisorio, non ancora validato'}
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
      {onSaveTransaction && <IncassiVenditeSection transactions={transactions || []} onSaveTransaction={onSaveTransaction} />}
    </div>
  );
}

// Incassi delle vendite immobiliari, pubblicati da Gestione Immobiliare quando un operatore
// conferma una rata del piano pagamenti di un cliente. "Aggiungi al cash flow" crea una
// previsione di entrata (una sola per rata: il riferimento resta sulla transazione).
function IncassiVenditeSection({ transactions, onSaveTransaction }: { transactions: Transaction[]; onSaveTransaction: (data: Omit<Transaction, 'id'>) => void }) {
  const [incassi, setIncassi] = useState<IncassoVendita[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIncassi(await fetchIncassiVendite());
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Errore di caricamento');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const giaInCashflow = (i: IncassoVendita) => i.inCashflow || transactions.some(t => t.sourceRef === rifIncasso(i));

  const aggiungi = async (i: IncassoVendita) => {
    if (giaInCashflow(i)) return;
    setSavingId(i.id);
    try {
      onSaveTransaction({
        date: i.scadenza || new Date().toISOString().slice(0, 10),
        amount: i.importo,
        type: TransactionType.INCOME,
        category: '[IMMOBILIARE] Vendita Immobili e Terreni',
        description: [i.tipo || 'Rata vendita', i.clienteNome, i.unitaCodice && `unità ${i.unitaCodice}`, i.interventoNome].filter(Boolean).join(' — ') + ' (importo della rata: verificare IVA)',
        isForecast: true,
        sourceRef: rifIncasso(i),
      });
      await aggiornaIncassoVendita(i.id, { inCashflow: true, letto: true });
      setIncassi(prev => prev ? prev.map(x => x.id === i.id ? { ...x, inCashflow: true, letto: true } : x) : prev);
    } catch (e: any) {
      setError(e.message || 'Errore di salvataggio');
    } finally {
      setSavingId(null);
    }
  };

  const toggleLetto = async (i: IncassoVendita) => {
    setSavingId(i.id);
    setIncassi(prev => prev ? prev.map(x => x.id === i.id ? { ...x, letto: !x.letto } : x) : prev);
    try { await aggiornaIncassoVendita(i.id, { letto: !i.letto }); }
    catch (e: any) { setError(e.message || 'Errore di salvataggio'); }
    finally { setSavingId(null); }
  };

  const daGestire = (incassi || []).filter(i => !i.letto || (i.stato === 'Annullata' && i.inCashflow));
  const gestiti = (incassi || []).filter(i => !daGestire.includes(i));

  return (
    <div className="space-y-3 pt-6 border-t border-slate-200">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Home className="text-indigo-500" size={22} /> Incassi Vendite in Arrivo
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Rate dei clienti che hanno acquistato un immobile, confermate da un operatore in Gestione Immobiliare. Aggiungile al cash flow come previsione di entrata.
        </p>
      </div>
      {error && <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl">{error}</div>}
      {incassi !== null && incassi.length === 0 && (
        <div className="p-6 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl">Nessuna rata confermata da Gestione Immobiliare.</div>
      )}
      {daGestire.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {daGestire.map(i => (
            <div key={i.id} className={`p-4 rounded-2xl space-y-2 border ${i.stato === 'Annullata' ? 'bg-red-50 border-red-200' : 'bg-indigo-50 border-indigo-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm text-slate-800">{i.clienteNome}</div>
                <div className="font-black text-sm text-slate-800">{currencyFmt(i.importo)}</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600"><Building2 size={12} className="text-slate-400" /> {[i.interventoNome, i.unitaCodice && `unità ${i.unitaCodice}`].filter(Boolean).join(' · ') || '—'}</div>
              <div className="text-xs text-slate-600">{i.tipo}{i.descrizione ? ` — ${i.descrizione}` : ''}</div>
              {i.scadenza && <div className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock size={12} className="text-slate-400" /> Prevista il {dateFmt(i.scadenza)}</div>}
              {i.stato === 'Annullata'
                ? <p className="text-[11px] font-bold text-red-600">Rata annullata in Gestione Immobiliare: togli la previsione dal cash flow.</p>
                : i.stato === 'Incassata' && <p className="text-[11px] font-bold text-emerald-700">Segnata come incassata{i.incassataIl ? ` il ${dateFmt(i.incassataIl)}` : ''}.</p>}
              <div className="flex gap-2 pt-1">
                {i.stato !== 'Annullata' && !giaInCashflow(i) && (
                  <button onClick={() => aggiungi(i)} disabled={savingId === i.id}
                    className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-50">
                    <PlusCircle size={12} /> Aggiungi al cash flow
                  </button>
                )}
                <button onClick={() => toggleLetto(i)} disabled={savingId === i.id}
                  className="flex items-center gap-1 px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold uppercase disabled:opacity-50">
                  <Check size={12} /> Gestito
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {gestiti.length > 0 && (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
          {gestiti.map(i => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 bg-white text-sm text-slate-400">
              <span className="flex-1 truncate">
                <span className="font-bold text-slate-600">{i.clienteNome}</span> — {i.tipo} · {currencyFmt(i.importo)}
                {i.scadenza && ` · ${dateFmt(i.scadenza)}`}{giaInCashflow(i) ? ' · nel cash flow' : ''}{i.stato === 'Annullata' ? ' · annullata' : ''}
              </span>
              <button onClick={() => toggleLetto(i)} disabled={savingId === i.id} title="Segna di nuovo da gestire"
                className="flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-indigo-600 rounded-lg text-[10px] font-bold uppercase shrink-0 disabled:opacity-50">
                <RotateCcw size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
