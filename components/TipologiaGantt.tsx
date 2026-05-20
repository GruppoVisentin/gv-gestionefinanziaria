import React, { useState, useRef, useCallback } from 'react';
import { TipologiaCantiere, VoceCostoTipologia, FaseDistribuzione } from '../types';
import { GripVertical, Plus, Trash2, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ─── COSTANTI ────────────────────────────────────────────────────

const MESI_LABEL = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

const COLORI_CATEGORIE: Record<string, string> = {
  'costo_variabile': '#ef4444',   // rosso
  'costo_fisso':     '#f97316',   // arancio
  'costo_studio':    '#8b5cf6',   // viola
  'ammortamento':    '#94a3b8',   // grigio
  'capex':           '#3b82f6',   // blu
};

const fmt = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

// ─── PROPS ───────────────────────────────────────────────────────

interface TipologiaGanttProps {
  tipologia: TipologiaCantiere;
  durataProgetto: number;          // mesi totali progetto (es. 12, 18, 24)
  importiStimati: Record<string, number>; // categoria → importo totale
  onSave: (tipologia: TipologiaCantiere) => void;
  onClose: () => void;
  variableCategories: string[];
}

// ─── COMPONENTE ──────────────────────────────────────────────────

// ─── HELPERS ───────────────────────────────────────────────────────
const getOffset = (mese: number) => mese > 0 ? mese - 1 : mese;
const getDurata = (meseInizio: number, meseFine: number) => getOffset(meseFine) - getOffset(meseInizio) + 1;

const normalizeVoci = (voci: VoceCostoTipologia[]) => {
  return voci.map(v => {
    let offsetMesi = 0;
    const fasiNormalizzate = v.fasi.map(f => {
      if (f.meseInizio === undefined || f.meseFine === undefined) {
        const meseInizio = offsetMesi >= 0 ? offsetMesi + 1 : offsetMesi;
        const durataMesi = f.durataMesi || 1;
        const offsetFine = offsetMesi + durataMesi - 1;
        const meseFine = offsetFine >= 0 ? offsetFine + 1 : offsetFine;
        offsetMesi += durataMesi;
        return { ...f, meseInizio, meseFine };
      }
      return f;
    });
    return { ...v, fasi: fasiNormalizzate };
  });
};

const TipologiaGantt: React.FC<TipologiaGanttProps> = ({
  tipologia, durataProgetto, importiStimati, onSave, onClose, variableCategories
}) => {
  const [voci, setVoci] = useState<VoceCostoTipologia[]>(normalizeVoci(tipologia.vociAttive));
  const [durata, setDurata] = useState(durataProgetto);
  const [dragging, setDragging] = useState<{ cat: string; faseId: string; type: 'move' | 'resize' } | null>(null);
  const [categoriaAperta, setCategoriaAperta] = useState<string | null>(null);
  const ganttRef = useRef<HTMLDivElement>(null);

  const allStarts = voci.flatMap(v => v.fasi.map(f => getOffset(f.meseInizio)));
  const minOffset = Math.min(0, ...(allStarts.length > 0 ? allStarts : [0]));
  
  const allEnds = voci.flatMap(v => v.fasi.map(f => getOffset(f.meseFine)));
  const maxOffset = Math.max(durata - 1, ...(allEnds.length > 0 ? allEnds : [durata - 1]));
  
  const totalGridMonths = maxOffset - minOffset + 1;

  const mesiLabel = Array.from({ length: totalGridMonths }, (_, i) => {
    const offset = minOffset + i;
    const mese = offset >= 0 ? offset + 1 : offset;
    return `M${mese}`;
  });

  // ── Calcola la posizione di ogni fase sulla timeline ─────────

  const getFasiConPosizione = (voce: VoceCostoTipologia) => {
    return voce.fasi.map(f => {
      const start = getOffset(f.meseInizio);
      const end = getOffset(f.meseFine) + 1; // +1 per css width
      const durataMesi = end - start;
      return { ...f, start, end, durataMesi };
    });
  };

  // ── Aggiorna una fase ────────────────────────────────────────

  const updateFase = (cat: string, faseId: string, field: keyof FaseDistribuzione, val: any) => {
    setVoci(prev => prev.map(v =>
      v.categoria === cat
        ? { ...v, fasi: v.fasi.map(f => f.id === faseId ? { ...f, [field]: val } : f) }
        : v
    ));
  };

  const addFase = (cat: string) => {
    const voce = voci.find(v => v.categoria === cat);
    const ultimaFase = voce?.fasi[voce.fasi.length - 1];
    
    let meseInizio = 1;
    if (ultimaFase) {
      const startOffset = getOffset(ultimaFase.meseFine) + 1;
      meseInizio = startOffset >= 0 ? startOffset + 1 : startOffset;
    }
    const endOffset = getOffset(meseInizio) + 1;
    const meseFine = endOffset >= 0 ? endOffset + 1 : endOffset;

    const nuovaFase: FaseDistribuzione = {
      id: uuidv4(), meseInizio, meseFine, percentuale: 0
    };
    setVoci(prev => prev.map(v =>
      v.categoria === cat ? { ...v, fasi: [...v.fasi, nuovaFase] } : v
    ));
  };

  const removeFase = (cat: string, faseId: string) => {
    setVoci(prev => prev.map(v =>
      v.categoria === cat ? { ...v, fasi: v.fasi.filter(f => f.id !== faseId) } : v
    ));
  };

  const toggleCategoria = (cat: string) => {
    if (voci.find(v => v.categoria === cat)) {
      setVoci(prev => prev.filter(v => v.categoria !== cat));
    } else {
      const ceType = variableCategories.includes(cat) ? 'costo_variabile' : 'costo_fisso';
      setVoci(prev => [...prev, {
        categoria: cat, ceType,
        fasi: [{ id: uuidv4(), meseInizio: 1, meseFine: Math.ceil(durata / 2), percentuale: 100 }]
      }]);
    }
    setCategoriaAperta(cat);
  };

  // ── Somma percentuali per validazione ───────────────────────

  const sommaPct = (cat: string) =>
    (voci.find(v => v.categoria === cat)?.fasi ?? [])
      .reduce((s, f) => s + f.percentuale, 0);

  const handleSave = () => {
    onSave({ ...tipologia, vociAttive: voci });
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50 shrink-0">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Piano Distribuzione Costi
            </p>
            <h2 className="text-xl font-black text-slate-900">{tipologia.nome}</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Durata progetto */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-xs font-bold text-slate-500">Durata:</span>
              <input
                type="number" min={1} max={60} value={durata}
                onChange={e => setDurata(Math.max(1, Math.min(60, parseInt(e.target.value) || 12)))}
                className="w-12 text-center font-black text-slate-900 text-sm outline-none"
              />
              <span className="text-xs text-slate-500">mesi</span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl">
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Selettore categorie attive */}
          <div className="px-8 py-4 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Categorie di costo attive in questa tipologia
            </p>
            <div className="flex flex-wrap gap-2">
              {variableCategories.slice(0, 16).map(cat => {
                const isActive = voci.some(v => v.categoria === cat);
                const label = cat.replace(/\[.*?\]\s*/, '');
                return (
                  <button key={cat} onClick={() => toggleCategoria(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GANTT */}
          <div className="px-8 py-4">
            {voci.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="font-bold">Nessuna categoria selezionata</p>
                <p className="text-sm mt-1">Seleziona le categorie di costo sopra per iniziare</p>
              </div>
            ) : (
              <div ref={ganttRef} className="overflow-x-auto">
                {/* Header mesi */}
                <div className="flex mb-3" style={{ minWidth: `${totalGridMonths * 60 + 200}px` }}>
                  <div style={{ width: 200 }} className="shrink-0" />
                  {mesiLabel.map((m, i) => {
                    const offset = minOffset + i;
                    const isPreCantiere = offset < 0;
                    return (
                      <div key={i} style={{ width: 60 }}
                        className={`text-[9px] font-black uppercase tracking-widest text-center border-l border-slate-100 py-1 ${isPreCantiere ? 'text-amber-500 bg-amber-50/50' : 'text-slate-400'}`}>
                        {m}
                      </div>
                    );
                  })}
                </div>

                {/* Righe categorie */}
                {voci.map(voce => {
                  const label = voce.categoria.replace(/\[.*?\]\s*/, '');
                  const colore = COLORI_CATEGORIE[voce.ceType] ?? '#64748b';
                  const fasiPos = getFasiConPosizione(voce);
                  const pctTot = sommaPct(voce.categoria);
                  const importo = importiStimati[voce.categoria] ?? 0;
                  const isAperta = categoriaAperta === voce.categoria;

                  return (
                    <div key={voce.categoria} className="mb-2">
                      {/* Riga Gantt */}
                      <div className="flex items-center" style={{ minWidth: `${totalGridMonths * 60 + 200}px` }}>
                        {/* Label categoria */}
                        <div style={{ width: 200 }}
                          className="shrink-0 pr-4 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{label}</p>
                            <p className={`text-[10px] font-black ${
                              pctTot === 100 ? 'text-emerald-500' :
                              pctTot > 100 ? 'text-red-500' : 'text-amber-500'
                            }`}>
                              {pctTot}% {pctTot !== 100 && (pctTot > 100 ? '(eccesso)' : '(mancante)')}
                            </p>
                          </div>
                          <button onClick={() => setCategoriaAperta(isAperta ? null : voce.categoria)}
                            className="shrink-0 p-1 hover:bg-slate-100 rounded">
                            {isAperta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                        </div>

                        {/* Barra timeline */}
                        <div className="relative flex-1 h-10 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                          {/* Sfondo griglia mesi */}
                          {mesiLabel.map((_, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100"
                              style={{ left: `${(i / totalGridMonths) * 100}%` }} />
                          ))}

                          {/* Barre fasi */}
                          {fasiPos.map((f, fi) => {
                            const left = ((f.start - minOffset) / totalGridMonths) * 100;
                            const width = (f.durataMesi / totalGridMonths) * 100;
                            const importoFase = importo * (f.percentuale / 100);
                            return (
                              <div key={f.id}
                                className="absolute top-1 bottom-1 rounded-md flex items-center justify-center text-white cursor-pointer transition-opacity hover:opacity-90"
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                  backgroundColor: colore,
                                  opacity: 0.7 + (fi * 0.1),
                                }}
                                title={`Fase ${fi + 1}: dal mese ${f.meseInizio} al ${f.meseFine} (${f.durataMesi} mesi), ${f.percentuale}%${importoFase > 0 ? ` — ${fmt(importoFase)}` : ''}`}
                              >
                                <span className="text-[9px] font-black truncate px-1">
                                  {f.percentuale}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Pannello dettaglio fasi (aperto) */}
                      {isAperta && (
                        <div className="ml-[200px] mt-2 mb-3 bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                              Fasi di distribuzione
                            </p>
                            <button onClick={() => addFase(voce.categoria)}
                              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                              <Plus size={12} /> Aggiungi fase
                            </button>
                          </div>

                          {fasiPos.map((f, fi) => {
                            const importoFase = importo * (f.percentuale / 100);
                            return (
                              <div key={f.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-4 py-3">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black shrink-0"
                                  style={{ backgroundColor: colore }}>
                                  {fi + 1}
                                </div>

                                <div className="flex items-center gap-2 flex-1 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">Dal:</span>
                                    <input type="number"
                                      value={f.meseInizio}
                                      onChange={e => {
                                          const val = parseInt(e.target.value) || 1;
                                          if (val !== 0) updateFase(voce.categoria, f.id, 'meseInizio', val);
                                      }}
                                      className="w-12 text-center text-xs font-bold border border-slate-200 rounded-lg py-1 outline-none focus:border-indigo-400"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">Al:</span>
                                    <input type="number"
                                      value={f.meseFine}
                                      onChange={e => {
                                          const val = parseInt(e.target.value) || 1;
                                          if (val !== 0) updateFase(voce.categoria, f.id, 'meseFine', val);
                                      }}
                                      className="w-12 text-center text-xs font-bold border border-slate-200 rounded-lg py-1 outline-none focus:border-indigo-400"
                                    />
                                  </div>
                                  <span className="text-[10px] text-slate-400">({f.durataMesi} mesi)</span>

                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-slate-400">Quota:</span>
                                    <input type="number" min={0} max={100}
                                      value={f.percentuale}
                                      onChange={e => updateFase(voce.categoria, f.id, 'percentuale', parseInt(e.target.value) || 0)}
                                      className="w-14 text-center text-xs font-bold border border-slate-200 rounded-lg py-1 outline-none focus:border-indigo-400"
                                    />
                                    <span className="text-[10px] text-slate-400">%</span>
                                  </div>

                                  {importoFase > 0 && (
                                    <span className="text-[10px] font-black text-slate-500">
                                      = {fmt(importoFase)}
                                    </span>
                                  )}

                                    {/* Info inizio relativo rimossa in quanto ridondante con meseInizio/meseFine visibili */}
                                </div>

                                {fasiPos.length > 1 && (
                                  <button onClick={() => removeFase(voce.categoria, f.id)}
                                    className="text-slate-300 hover:text-red-500 shrink-0">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {/* Avviso percentuali */}
                          {pctTot !== 100 && (
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold ${
                              pctTot > 100
                                ? 'bg-red-50 text-red-600 border border-red-200'
                                : 'bg-amber-50 text-amber-600 border border-amber-200'
                            }`}>
                              {pctTot > 100
                                ? `⚠ Totale ${pctTot}% — riduci le percentuali di ${pctTot - 100}%`
                                : `⚠ Totale ${pctTot}% — mancano ${100 - pctTot}% da assegnare`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            {voci.filter(v => sommaPct(v.categoria) === 100).length}/{voci.length} categorie con distribuzione corretta
          </div>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50">
              Annulla
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-black rounded-xl hover:bg-slate-700">
              <Save size={15} />
              Salva Piano
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TipologiaGantt;
