import React, { useMemo, useState } from 'react';
import {
  HardHat, TrendingUp, TrendingDown, Scale, ChevronDown,
  CalendarClock, Link2, Database,
} from 'lucide-react';
import { Project, Transaction, TransactionType } from '../types';
import { CURRENCY_FORMATTER, DATE_FORMATTER } from '../constants';
import { parseUTCDate } from '../utils/gasCoreEngine';

interface VistaCantiereViewProps {
  projects: Project[];
  transactions: Transaction[];
  storicoCantierePuntaNet?: Transaction[];
}

const formatEuro = (v: number) => CURRENCY_FORMATTER.format(v);

const VistaCantiereView: React.FC<VistaCantiereViewProps> = ({ projects, transactions, storicoCantierePuntaNet = [] }) => {
  const progettiAttivi = useMemo(
    () => [...projects].filter(p => p.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)),
    [projects]
  );

  const [selezionato, setSelezionato] = useState<string>(progettiAttivi[0]?.name ?? '');
  const progetto = progettiAttivi.find(p => p.name === selezionato);

  // Per i cantieri collegati a PuntaNet, lo storico dedicato (storicoCantierePuntaNet) e' molto
  // piu' completo di "transactions" — quest'ultima storicamente non ha quasi mai il cantiere
  // taggato sui costi. Se c'e' storico PuntaNet per il progetto selezionato, si usa quello come
  // unica fonte per questa vista (evita di sommare due volte gli stessi movimenti);
  // altrimenti si ricade su "transactions" com'e' oggi.
  const usaStoricoPuntaNet = progetto?.puntaNetCantiereId != null &&
    storicoCantierePuntaNet.some(t => t.project === selezionato);

  const righeCantiere = useMemo(
    () => (usaStoricoPuntaNet ? storicoCantierePuntaNet : transactions)
      .filter(t => t.project === selezionato)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [transactions, storicoCantierePuntaNet, usaStoricoPuntaNet, selezionato]
  );

  // L'elenco movimenti e' lo storico di cio' che e' davvero successo sul cantiere — solo
  // consuntivo. Il previsionale (cosa manca ancora da incassare/pagare) resta solo nel
  // riepilogo "Previsione residua" qui sopra, gia' aggregato: mescolarlo riga per riga nello
  // storico confonderebbe "successo" con "atteso".
  const movimentiReali = useMemo(
    () => righeCantiere.filter(t => !t.isForecast),
    [righeCantiere]
  );

  const stats = useMemo(() => {
    const entrateConsuntivo = righeCantiere.filter(t => t.type === TransactionType.INCOME && !t.isForecast);
    const usciteConsuntivo = righeCantiere.filter(t => t.type === TransactionType.EXPENSE && !t.isForecast);

    // "Residua" = quanto manca davvero da incassare/pagare: previsioni gia' chiuse da un
    // consuntivo collegato (linkedForecastId) non contano piu' — altrimenti si conta due volte
    // la stessa cifra (una come previsione, una come consuntivo gia' arrivato).
    const idPrevisioniChiuse = new Set(
      righeCantiere.filter(t => !t.isForecast && t.linkedForecastId).map(t => t.linkedForecastId)
    );
    const entratePrevisione = righeCantiere.filter(t => t.type === TransactionType.INCOME && t.isForecast && !idPrevisioniChiuse.has(t.id));
    const uscitePrevisione = righeCantiere.filter(t => t.type === TransactionType.EXPENSE && t.isForecast && !idPrevisioniChiuse.has(t.id));

    // Lordo = IVA inclusa (grossAmount), netto = imponibile (amount).
    const sommaLorda = (arr: Transaction[]) => arr.reduce((s, t) => s + (t.grossAmount ?? t.amount ?? 0), 0);
    const sommaNetta = (arr: Transaction[]) => arr.reduce((s, t) => s + (t.amount ?? 0), 0);

    const totEntrateConsuntivo = sommaLorda(entrateConsuntivo);
    const totUsciteConsuntivo = sommaLorda(usciteConsuntivo);
    const totEntratePrevisione = sommaLorda(entratePrevisione);
    const totUscitePrevisione = sommaLorda(uscitePrevisione);

    const nettoEntrateConsuntivo = sommaNetta(entrateConsuntivo);
    const nettoUsciteConsuntivo = sommaNetta(usciteConsuntivo);
    const nettoEntratePrevisione = sommaNetta(entratePrevisione);
    const nettoUscitePrevisione = sommaNetta(uscitePrevisione);

    return {
      entrateConsuntivo: totEntrateConsuntivo,
      usciteConsuntivo: totUsciteConsuntivo,
      margineConsuntivo: totEntrateConsuntivo - totUsciteConsuntivo,
      entratePrevisione: totEntratePrevisione,
      uscitePrevisione: totUscitePrevisione,
      // Stesse cifre calcolate sul netto (imponibile, senza IVA) — l'IVA non e' un vero costo/
      // ricavo del cantiere, e' un debito/credito verso l'erario, quindi il margine "vero" e'
      // spesso letto sul netto.
      nettoEntrateConsuntivo,
      nettoUsciteConsuntivo,
      nettoMargineConsuntivo: nettoEntrateConsuntivo - nettoUsciteConsuntivo,
      nettoEntratePrevisione,
      nettoUscitePrevisione,
      numRighe: righeCantiere.length,
    };
  }, [righeCantiere]);

  if (progettiAttivi.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
        <HardHat size={40} className="mx-auto text-slate-300 mb-3" />
        <p className="text-slate-500 font-semibold">Nessun cantiere attivo trovato.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Intestazione + selettore cantiere ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Vista Cantiere</h2>
          <p className="text-slate-500 text-sm font-medium">Entrate e uscite collegate a una singola commessa</p>
        </div>
        <div className="relative">
          <select
            value={selezionato}
            onChange={e => setSelezionato(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-2xl px-5 py-3 pr-10 font-bold text-slate-800 shadow-sm cursor-pointer min-w-[260px]"
          >
            {progettiAttivi.map(p => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {progetto && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-bold text-slate-800">{progetto.client}</span>
          <span className="text-slate-400">{progetto.location}</span>
          {progetto.puntaNetCantiereId != null ? (
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs bg-emerald-50 px-2.5 py-1 rounded-full">
              <Link2 size={12} /> Collegato a PuntaNet (cantiere {progetto.puntaNetCantiereId})
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-600 font-semibold text-xs bg-amber-50 px-2.5 py-1 rounded-full">
              Non collegato a un cantiere PuntaNet
            </span>
          )}
          {usaStoricoPuntaNet ? (
            <span className="flex items-center gap-1.5 text-indigo-600 font-semibold text-xs bg-indigo-50 px-2.5 py-1 rounded-full">
              <Database size={12} /> Dati: storico completo PuntaNet
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 font-semibold text-xs bg-slate-100 px-2.5 py-1 rounded-full">
              Dati: flusso di cassa app (potrebbe non essere completo sui costi storici)
            </span>
          )}
        </div>
      )}

      {/* ── Riepilogo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-2">
            <TrendingUp size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Entrate consuntivo</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatEuro(stats.entrateConsuntivo)}</p>
          <p className="text-xs font-semibold text-slate-400 mt-0.5">netto {formatEuro(stats.nettoEntrateConsuntivo)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-rose-600 mb-2">
            <TrendingDown size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Uscite consuntivo</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{formatEuro(stats.usciteConsuntivo)}</p>
          <p className="text-xs font-semibold text-slate-400 mt-0.5">netto {formatEuro(stats.nettoUsciteConsuntivo)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Scale size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Margine attuale</span>
          </div>
          <p className={`text-2xl font-black ${stats.margineConsuntivo >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
            {formatEuro(stats.margineConsuntivo)}
          </p>
          <p className={`text-xs font-semibold mt-0.5 ${stats.nettoMargineConsuntivo >= 0 ? 'text-slate-400' : 'text-rose-400'}`}>
            netto {formatEuro(stats.nettoMargineConsuntivo)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <CalendarClock size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Previsione residua</span>
          </div>
          <p className="text-sm font-bold text-emerald-600">
            + {formatEuro(stats.entratePrevisione)}
            <span className="text-slate-400 font-semibold"> (netto {formatEuro(stats.nettoEntratePrevisione)})</span>
          </p>
          <p className="text-sm font-bold text-rose-500">
            - {formatEuro(stats.uscitePrevisione)}
            <span className="text-slate-400 font-semibold"> (netto {formatEuro(stats.nettoUscitePrevisione)})</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-2 leading-snug">Fatture/rate gia' registrate su PuntaNet, non ancora incassate/pagate.</p>
        </div>
      </div>

      {/* ── Elenco movimenti — solo storico reale (consuntivo), il previsionale resta nel
          riepilogo qui sopra ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Movimenti realizzati ({movimentiReali.length})</p>
        </div>
        <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-50">
          {movimentiReali.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">Nessun movimento realizzato per questo cantiere.</p>
          )}
          {movimentiReali.map(t => {
            const isEntrata = t.type === TransactionType.INCOME;
            return (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <p className="text-sm font-bold text-slate-800 truncate">{t.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">{DATE_FORMATTER.format(parseUTCDate(t.date))}</span>
                    <span className="text-[11px] text-slate-400">·</span>
                    <span className="text-[11px] text-slate-400">{t.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-black font-mono ${isEntrata ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isEntrata ? '+' : '-'}{formatEuro(t.grossAmount ?? t.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VistaCantiereView;
