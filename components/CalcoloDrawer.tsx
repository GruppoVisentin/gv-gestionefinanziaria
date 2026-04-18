import React, { useState, useRef, useEffect } from 'react';
import {
  X, ChevronRight, TrendingUp, TrendingDown,
  Minus, TableProperties, MessageSquare, Sparkles,
  Send, Loader2, Copy, Check
} from 'lucide-react';
import { Transaction } from '../types';

// ─── TIPI ────────────────────────────────────────────────────────

export interface FormulaStep {
  label: string;
  valore: number;
  isPositivo: boolean;
  isRisultato?: boolean;
  indent?: boolean;
  percentualeSu?: number;
}

export interface CalcoloDrawerProps {
  kpiNome: string;
  kpiValore: number;
  kpiPercentuale?: number;
  kpiPercentualeLabel?: string;
  formulaSteps: FormulaStep[];
  transazioniContribuenti: Transaction[];
  anno: number;
  onClose: () => void;
}

// ─── HELPERS ─────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(v);

const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';

const CE_TYPE_LABEL: Record<string, { label: string; colore: string }> = {
  ricavo_core:          { label: 'Ricavo Core',      colore: 'bg-emerald-100 text-emerald-700' },
  ricavo_altro:         { label: 'Altro Ricavo',      colore: 'bg-teal-100 text-teal-700' },
  ricavo_immobiliare:   { label: 'Immobiliare',       colore: 'bg-purple-100 text-purple-700' },
  costo_variabile:      { label: 'Costo Variabile',   colore: 'bg-rose-100 text-rose-700' },
  costo_fisso:          { label: 'Costo Fisso',       colore: 'bg-orange-100 text-orange-700' },
  costo_studio:         { label: 'Studio',            colore: 'bg-violet-100 text-violet-700' },
  ammortamento:         { label: 'Ammortamento',      colore: 'bg-slate-100 text-slate-600' },
  onere_finanziario:    { label: 'Onere Fin.',        colore: 'bg-amber-100 text-amber-700' },
  provento_finanziario: { label: 'Provento Fin.',     colore: 'bg-blue-100 text-blue-700' },
  solo_cashflow:        { label: 'Solo Cash',         colore: 'bg-slate-100 text-slate-500' },
  capex:                { label: 'Capex',             colore: 'bg-indigo-100 text-indigo-700' },
  straordinario:        { label: 'Straordinario',     colore: 'bg-pink-100 text-pink-700' },
  distribuzione_utile:  { label: 'Distrib. Utile',   colore: 'bg-yellow-100 text-yellow-700' },
};

// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────

const CalcoloDrawer: React.FC<CalcoloDrawerProps> = ({
  kpiNome,
  kpiValore,
  kpiPercentuale,
  kpiPercentualeLabel = 'sul fatturato',
  formulaSteps,
  transazioniContribuenti,
  anno,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'formula' | 'transazioni' | 'ai'>('formula');
  const [filtroTipo, setFiltroTipo] = useState<'tutti' | 'income' | 'expense'>('tutti');
  const [cercaTx, setCercaTx] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const txFiltrate = transazioniContribuenti
    .filter(tx => {
      if (filtroTipo === 'income' && tx.type !== 'INCOME') return false;
      if (filtroTipo === 'expense' && tx.type !== 'EXPENSE') return false;
      if (cercaTx && !tx.description.toLowerCase().includes(cercaTx.toLowerCase()) &&
          !tx.category.toLowerCase().includes(cercaTx.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const totaleIncome  = transazioniContribuenti.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const totaleExpense = transazioniContribuenti.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

  const buildAiContext = () => {
    const topTx = [...transazioniContribuenti]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 20);
    return `Sei un esperto di controllo di gestione per imprese edili italiane.
Stai analizzando il KPI "${kpiNome}" dell'anno ${anno} di Gruppo Visentin SRL.

VALORE ATTUALE: ${fmt(kpiValore)}${kpiPercentuale ? ` (${fmtPct(kpiPercentuale)} ${kpiPercentualeLabel})` : ''}

FORMULA DI CALCOLO:
${formulaSteps.map(s => `${s.isRisultato ? '= ' : s.isPositivo ? '+ ' : '- '}${s.label}: ${fmt(Math.abs(s.valore))}`).join('\n')}

LE 20 TRANSAZIONI CON MAGGIOR IMPATTO:
${topTx.map(tx =>
  `${tx.type === 'INCOME' ? '+' : '-'}${fmt(tx.amount)} | ${tx.date} | ${tx.description} | ${tx.category} | ceType: ${tx.ceType ?? 'n/d'}`
).join('\n')}

Totale transazioni: ${transazioniContribuenti.length} | Entrate: ${fmt(totaleIncome)} | Uscite: ${fmt(totaleExpense)}

Rispondi in italiano, preciso e conciso. Non inventare dati non presenti.`;
  };

  const inviaMessaggio = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const domanda = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: domanda }]);
    setAiLoading(true);

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: { systemInstruction: buildAiContext(), temperature: 0.3 },
        history: aiMessages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
      });
      const result = await chat.sendMessage({ message: domanda });
      setAiMessages(prev => [...prev, { role: 'ai', text: result.text ?? 'Nessuna risposta.' }]);
    } catch {
      setAiMessages(prev => [...prev, {
        role: 'ai',
        text: 'Errore di connessione. Verifica che la chiave API sia configurata.',
      }]);
    }
    setAiLoading(false);
  };

  const copiaContesto = () => {
    navigator.clipboard.writeText(buildAiContext());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const domandeSuggerite = [
    `Perché ${kpiNome} ha questo valore?`,
    `Quali transazioni hanno impattato di più?`,
    `Come posso migliorare ${kpiNome}?`,
    `Ci sono anomalie tra le transazioni?`,
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-8 py-6 border-b border-slate-100 bg-slate-50 shrink-0">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Come è stato calcolato</p>
            <h2 className="text-2xl font-black text-slate-900">{kpiNome}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-lg font-black text-slate-800">{fmt(kpiValore)}</span>
              {kpiPercentuale !== undefined && (
                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs font-black rounded-full">
                  {fmtPct(kpiPercentuale)} {kpiPercentualeLabel}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-100 px-4 pt-2 gap-1 shrink-0">
          {[
            { id: 'formula',     icon: ChevronRight,    label: 'Formula' },
            { id: 'transazioni', icon: TableProperties, label: `Transazioni (${transazioniContribuenti.length})` },
            { id: 'ai',          icon: MessageSquare,   label: "Chiedi all'AI" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-slate-100 text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Contenuto */}
        <div className="flex-1 overflow-y-auto">

          {/* ══ FORMULA ══ */}
          {activeTab === 'formula' && (
            <div className="px-8 py-6">
              <div className="space-y-1">
                {formulaSteps.map((step, i) => (
                  <div key={i} className={`flex items-center justify-between py-3 px-4 rounded-xl ${
                    step.isRisultato ? 'bg-slate-900 text-white font-black' :
                    step.indent ? 'bg-slate-50 border border-slate-100' : 'border-b border-slate-100'
                  }`}>
                    <div className={`flex items-center gap-3 ${step.indent ? 'pl-4' : ''}`}>
                      {!step.isRisultato && (step.isPositivo
                        ? <TrendingUp size={14} className="text-emerald-500 shrink-0" />
                        : <TrendingDown size={14} className="text-rose-400 shrink-0" />)}
                      {step.isRisultato && <Minus size={14} className="text-white/60 shrink-0" />}
                      <span className={`text-sm ${step.isRisultato ? 'text-white' : step.indent ? 'text-xs text-slate-500' : 'text-slate-700'}`}>
                        {step.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-sm font-black ${
                        step.isRisultato ? 'text-white' : step.isPositivo ? 'text-emerald-600' : 'text-rose-500'
                      }`}>
                        {step.isRisultato ? '= ' : step.isPositivo ? '+' : '− '}
                        {fmt(Math.abs(step.valore))}
                      </span>
                      {step.percentualeSu && step.percentualeSu > 0 && (
                        <p className={`text-[10px] font-bold mt-0.5 ${step.isRisultato ? 'text-white/60' : 'text-slate-400'}`}>
                          {fmtPct(Math.abs(step.valore) / step.percentualeSu)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Regola di classificazione</p>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Ogni transazione contribuisce in base al suo <span className="font-black">ceType</span>.
                  Valori riferiti all'anno {anno}, solo consuntivi (<span className="font-mono">isForecast = false</span>).
                </p>
              </div>
            </div>
          )}

          {/* ══ TRANSAZIONI ══ */}
          {activeTab === 'transazioni' && (
            <div className="flex flex-col h-full">
              <div className="px-6 py-4 border-b border-slate-100 space-y-3 bg-slate-50 shrink-0">
                <div className="flex gap-2">
                  {(['tutti', 'income', 'expense'] as const).map(f => (
                    <button key={f} onClick={() => setFiltroTipo(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        filtroTipo === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {f === 'tutti' ? `Tutte (${transazioniContribuenti.length})` :
                       f === 'income' ? `Entrate (${transazioniContribuenti.filter(t => t.type === 'INCOME').length})` :
                       `Uscite (${transazioniContribuenti.filter(t => t.type === 'EXPENSE').length})`}
                    </button>
                  ))}
                </div>
                <input type="text" placeholder="Cerca descrizione o categoria..."
                  value={cercaTx} onChange={e => setCercaTx(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400" />
              </div>

              <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-white border-b border-slate-100 shrink-0">
                <div className="text-center">
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Entrate</p>
                  <p className="font-mono text-sm font-black text-emerald-700">+{fmt(totaleIncome)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Uscite</p>
                  <p className="font-mono text-sm font-black text-rose-700">−{fmt(totaleExpense)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Netto</p>
                  <p className="font-mono text-sm font-black text-slate-900">{fmt(totaleIncome - totaleExpense)}</p>
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                    <tr>
                      <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                      <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrizione</th>
                      <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo CE</th>
                      <th className="py-2 px-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txFiltrate.map((tx, i) => {
                      const ceInfo = CE_TYPE_LABEL[tx.ceType ?? ''];
                      return (
                        <tr key={tx.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                          <td className="py-2.5 px-4 text-[10px] font-mono text-slate-400 whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-4 min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{tx.description}</p>
                            <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{tx.category}</p>
                          </td>
                          <td className="py-2.5 px-4">
                            {ceInfo && (
                              <span className={`px-1.5 py-0.5 text-[9px] font-black rounded-full whitespace-nowrap ${ceInfo.colore}`}>
                                {ceInfo.label}
                              </span>
                            )}
                          </td>
                          <td className={`py-2.5 px-4 text-right font-mono text-xs font-black whitespace-nowrap ${
                            tx.type === 'INCOME' ? 'text-emerald-600' : 'text-rose-500'
                          }`}>
                            {tx.type === 'INCOME' ? '+' : '−'}{fmt(Math.abs(tx.amount))}
                          </td>
                        </tr>
                      );
                    })}
                    {txFiltrate.length === 0 && (
                      <tr><td colSpan={4} className="py-8 text-center text-sm text-slate-400">Nessuna transazione corrisponde ai filtri</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ AI ══ */}
          {activeTab === 'ai' && (
            <div className="flex flex-col h-full">
              <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                    Contesto AI — {transazioniContribuenti.length} transazioni incluse
                  </p>
                  <button onClick={copiaContesto}
                    className="flex items-center gap-1 px-2 py-1 bg-white border border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 transition-colors">
                    {copied ? <><Check size={10} /> Copiato</> : <><Copy size={10} /> Copia contesto</>}
                  </button>
                </div>
                <p className="text-[10px] text-indigo-700 mt-0.5">
                  L'AI conosce la formula, i valori reali e le 20 transazioni con maggior impatto.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {aiMessages.length === 0 && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                        <Sparkles size={13} className="text-indigo-600" />
                      </div>
                      <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                        <p className="text-xs text-slate-700 leading-relaxed">
                          Ciao! Sono al corrente di come è stato calcolato <strong>{kpiNome}</strong> ({fmt(kpiValore)}) e di tutte le transazioni che lo compongono. Cosa vuoi sapere?
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 pl-10">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Domande frequenti</p>
                      {domandeSuggerite.map((d, i) => (
                        <button key={i} onClick={() => setAiInput(d)}
                          className="block w-full text-left px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-800' : 'bg-indigo-100'}`}>
                      {msg.role === 'user'
                        ? <span className="text-[10px] font-black text-white">Tu</span>
                        : <Sparkles size={13} className="text-indigo-600" />}
                    </div>
                    <div className={`px-4 py-3 rounded-2xl max-w-sm text-xs leading-relaxed ${
                      msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-700 rounded-tl-sm'
                    }`}>
                      {msg.text.split('\n').map((line, j) => (
                        <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}

                {aiLoading && (
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                      <Loader2 size={13} className="text-indigo-600 animate-spin" />
                    </div>
                    <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3">
                      <p className="text-xs text-slate-400">Analisi in corso...</p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="px-6 py-4 border-t border-slate-100 shrink-0">
                <div className="flex gap-2">
                  <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inviaMessaggio(); }}}
                    placeholder={`Chiedi qualcosa su ${kpiNome}...`}
                    className="flex-1 px-4 py-3 bg-slate-100 rounded-2xl text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200 transition-all"
                    disabled={aiLoading} />
                  <button onClick={inviaMessaggio} disabled={!aiInput.trim() || aiLoading}
                    className="w-11 h-11 bg-slate-900 hover:bg-slate-700 text-white rounded-2xl flex items-center justify-center transition-colors disabled:opacity-40">
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CalcoloDrawer;
