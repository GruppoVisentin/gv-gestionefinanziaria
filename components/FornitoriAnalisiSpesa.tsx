import React, { useMemo, useState } from 'react';
import { Fornitore, FornitoreMacroCategoria } from '../types';
import { formatEuro } from '../utils/formatters';
import { analisiSpesa, anniDisponibili } from '../utils/fornitoriStatistiche';

// Vista "Analisi spesa" della tab Fornitori: chi pesa di piu' sui costi in un anno, per
// categoria, e cosa scade nei prossimi giorni. Dati: statistichePuntaNet dei fornitori.

const BAR_COLOR = '#6366f1';
const formatData = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT');
const formatQuota = (q: number) => `${(q * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

interface Props {
  fornitori: Fornitore[];
  macroLabel: Record<FornitoreMacroCategoria, string>;
  onApriFornitore: (id: string) => void;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4 bg-white border border-slate-200 rounded-2xl">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-xl font-black text-slate-800 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

// Barra orizzontale HTML: hover = riga evidenziata + title con il dettaglio completo.
function RigaBarra({ label, valore, max, dettaglio, onClick }: { label: string; valore: number; max: number; dettaglio: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} title={dettaglio} disabled={!onClick} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 disabled:hover:bg-transparent transition-colors">
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-slate-700 truncate">{label}</span>
        <span className="font-bold text-slate-800 shrink-0">{formatEuro(valore)}</span>
      </div>
      <div className="h-2 mt-1 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, (valore / max) * 100)}%`, background: BAR_COLOR }} />
      </div>
    </button>
  );
}

export default function FornitoriAnalisiSpesa({ fornitori, macroLabel, onApriFornitore }: Props) {
  const oggi = new Date().toISOString().slice(0, 10);
  const annoCorrente = Number(oggi.slice(0, 4));
  const anni = useMemo(() => anniDisponibili(fornitori), [fornitori]);
  const [anno, setAnno] = useState<number>(anni.includes(annoCorrente) ? annoCorrente : anni[0] ?? annoCorrente);
  const [mostraTutti, setMostraTutti] = useState(false);
  const a = useMemo(() => analisiSpesa(fornitori, anno, oggi), [fornitori, anno, oggi]);

  if (anni.length === 0) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-2xl text-sm text-slate-500">
        Nessun dato di spesa: le statistiche arrivano dall'import automatico fornitori da PuntaNet.
      </div>
    );
  }

  const classificaVisibile = mostraTutti ? a.classifica : a.classifica.slice(0, 15);
  const maxClassifica = Math.max(a.classifica[0]?.imponibile ?? 0, 1);
  const maxMacro = Math.max(a.perMacro[0]?.imponibile ?? 0, 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500">Anno</span>
        {anni.map(y => (
          <button
            key={y}
            onClick={() => setAnno(y)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${y === anno ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            {y}
          </button>
        ))}
        <span className="text-[11px] text-slate-400 ml-1">Importi in imponibile, fatture meno note di credito{anno === annoCorrente ? ' — anno in corso, a oggi' : ''}.</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label={`Spesa fornitori ${anno}`} value={formatEuro(a.totale)} />
        <Tile label="Fornitori con fatture" value={String(a.fornitoriAttivi)} />
        <Tile label="Peso dei primi 10" value={formatQuota(a.quotaTop10)} hint="quota della spesa annua" />
        <Tile label="Da pagare entro 30 gg" value={formatEuro(a.daPagare30)} hint={`60 gg: ${formatEuro(a.daPagare60)} · 90 gg: ${formatEuro(a.daPagare90)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-slate-800">Classifica fornitori per spesa {anno}</div>
            <span className="text-[11px] text-slate-400">clic per aprire la scheda</span>
          </div>
          <div className="space-y-0.5">
            {classificaVisibile.map((r, i) => (
              <RigaBarra
                key={r.fornitore.id}
                label={`${i + 1}. ${r.fornitore.ragioneSociale}`}
                valore={r.imponibile}
                max={maxClassifica}
                dettaglio={`${r.fornitore.ragioneSociale}: ${formatEuro(r.imponibile)} (${formatQuota(r.quota)} della spesa ${anno})`}
                onClick={() => onApriFornitore(r.fornitore.id)}
              />
            ))}
          </div>
          {a.classifica.length > 15 && (
            <button onClick={() => setMostraTutti(v => !v)} className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700">
              {mostraTutti ? 'Mostra solo i primi 15' : `Mostra tutti i ${a.classifica.length}`}
            </button>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-sm font-bold text-slate-800 mb-2">Spesa per categoria {anno}</div>
            <div className="space-y-0.5">
              {a.perMacro.map(m => (
                <RigaBarra
                  key={m.macro}
                  label={`${macroLabel[m.macro]} (${m.fornitori})`}
                  valore={m.imponibile}
                  max={maxMacro}
                  dettaglio={`${macroLabel[m.macro]}: ${formatEuro(m.imponibile)}, ${m.fornitori} fornitori (${formatQuota(a.totale > 0 ? m.imponibile / a.totale : 0)})`}
                />
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-sm font-bold text-slate-800 mb-2">Scadenze prossimi 60 giorni</div>
            {a.scadenzeProssime.length === 0 ? (
              <div className="text-xs text-slate-400">Nessuna rata in scadenza.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <tbody className="divide-y divide-slate-100">
                    {a.scadenzeProssime.map((s, i) => (
                      <tr key={`${s.fornitore.id}-${s.data}-${i}`} className="hover:bg-slate-50 cursor-pointer" onClick={() => onApriFornitore(s.fornitore.id)}>
                        <td className="py-1.5 pr-2 text-slate-500 whitespace-nowrap">{formatData(s.data)}</td>
                        <td className="py-1.5 pr-2 text-slate-700 truncate max-w-[160px]">{s.fornitore.ragioneSociale}</td>
                        <td className="py-1.5 text-right font-bold text-slate-800 whitespace-nowrap">{formatEuro(s.importo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
