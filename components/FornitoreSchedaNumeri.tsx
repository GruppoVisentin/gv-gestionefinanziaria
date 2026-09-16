import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { Fornitore } from '../types';
import { formatEuro } from '../utils/formatters';
import { riepilogoFornitore } from '../utils/fornitoriStatistiche';

// Scheda numeri di un fornitore (spesa per anno, cantieri, scadenze), aperta dalla riga
// nella tab Fornitori. Dati: fornitore.statistichePuntaNet, sola lettura.

const BAR_COLOR = '#6366f1'; // indigo-500, colore unico: una sola serie
const formatData = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('it-IT');

function Tile({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'warning' }) {
  return (
    <div className={`p-3 rounded-xl border ${tone === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
        {tone === 'warning' && <AlertTriangle size={11} className="text-amber-600" />}
        {label}
      </div>
      <div className="text-base font-black text-slate-800 mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function FornitoreSchedaNumeri({ fornitore }: { fornitore: Fornitore }) {
  const stat = fornitore.statistichePuntaNet;
  const oggi = new Date().toISOString().slice(0, 10);
  const r = useMemo(() => riepilogoFornitore(stat, oggi), [stat, oggi]);

  if (!stat || (stat.perAnno.length === 0 && stat.scadenzeAperte.length === 0)) {
    return (
      <div className="px-4 py-3 text-xs text-slate-500 bg-slate-50">
        Nessuna fattura di questo fornitore in PuntaNet{fornitore.puntaNetIdCliFor ? '' : ' (fornitore inserito a mano, non collegato a PuntaNet)'}.
      </div>
    );
  }

  const datiAnno = stat.perAnno.map(a => ({ anno: String(a.anno), imponibile: a.imponibile, fatture: a.fatture, noteCredito: a.noteCredito }));
  const maxCantiere = Math.max(...stat.perCantiere.map(c => c.imponibile), 1);
  const prossime = stat.scadenzeAperte.filter(s => s.data >= oggi).slice(0, 8);
  // Stessa soglia di riepilogoFornitore: le rate scadute da oltre un anno restano solo nel totale "Da verificare".
  const unAnnoFa = new Date(Date.parse(`${oggi}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
  const scaduteRecenti = stat.scadenzeAperte.filter(s => s.data < oggi && s.data >= unAnnoFa);

  return (
    <div className="px-4 py-4 bg-slate-50 space-y-4 border-t border-slate-100">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Tile label={`Spesa ${r.anno}`} value={formatEuro(r.spesaAnnoCorrente)} hint="anno in corso, a oggi" />
        <Tile label={`Spesa ${r.anno - 1}`} value={formatEuro(r.spesaAnnoPrecedente)} hint="anno intero" />
        <Tile label="Spesa totale" value={formatEuro(r.spesaTotale)} hint={`${r.fattureTotali} fatture in PuntaNet`} />
        <Tile
          label="Dilazione concordata"
          value={stat.dilazioneMediaGiorni == null ? '—' : stat.dilazioneMediaGiorni === 0 ? 'a vista' : `${stat.dilazioneMediaGiorni} gg`}
          hint={fornitore.condizionePagamentoPuntaNet || 'media ultimi 24 mesi'}
        />
        <Tile label="Da pagare" value={formatEuro(r.daPagare)} hint={r.prossimaScadenza ? `prossima ${formatData(r.prossimaScadenza.data)}` : 'nessuna scadenza futura'} />
        <Tile label="Scaduto" value={formatEuro(r.scaduto)} hint="ultimi 12 mesi, non segnato pagato" tone={r.scaduto > 0 ? 'warning' : 'default'} />
        {r.scadutoDaVerificare !== 0 && (
          <Tile label="Da verificare" value={formatEuro(r.scadutoDaVerificare)} hint="scaduto da oltre 1 anno: probabilmente pagato ma non chiuso in PuntaNet" tone="warning" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-xs font-bold text-slate-700 mb-2">Spesa per anno <span className="font-normal text-slate-400">(imponibile, al netto delle note di credito)</span></div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datiAnno} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="anno" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 11 }}
                  formatter={(value: number) => [formatEuro(value), 'Spesa']}
                  labelFormatter={(label, payload) => {
                    const p = payload?.[0]?.payload;
                    return p ? `${label} · ${p.fatture} fatture${p.noteCredito ? `, ${p.noteCredito} note di credito` : ''}` : label;
                  }}
                />
                <Bar dataKey="imponibile" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-xs font-bold text-slate-700 mb-2">Cantieri <span className="font-normal text-slate-400">({stat.perCantiere.length})</span></div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {stat.perCantiere.map(c => (
              <div key={c.idCantiere} title={`${formatData(c.primaFattura)} → ${formatData(c.ultimaFattura)}`}>
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="text-slate-700 truncate">{c.nome}</span>
                  <span className="font-bold text-slate-800 shrink-0">{formatEuro(c.imponibile)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, (c.imponibile / maxCantiere) * 100)}%`, background: BAR_COLOR }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(prossime.length > 0 || scaduteRecenti.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="text-xs font-bold text-slate-700 mb-2">Rate aperte</div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="font-bold py-1">Scadenza</th>
                <th className="font-bold py-1">Fattura del</th>
                <th className="font-bold py-1 text-right">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...scaduteRecenti, ...prossime].map((s, i) => (
                <tr key={`${s.data}-${i}`}>
                  <td className="py-1 text-slate-700">
                    {formatData(s.data)}
                    {s.data < oggi && <span className="ml-1.5 text-[9px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1 rounded">scaduta</span>}
                  </td>
                  <td className="py-1 text-slate-500">{formatData(s.dataDocumento)}</td>
                  <td className="py-1 text-right font-bold text-slate-800">{formatEuro(s.importo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
