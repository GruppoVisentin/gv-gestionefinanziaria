import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, X, Check, Upload, HardHat, Paintbrush, ChevronDown, ChevronRight, Inbox, FileSearch, Sparkles, Truck, Briefcase, Zap, UtensilsCrossed, Users, Landmark, Wand2 } from 'lucide-react';
import { Fornitore, FornitoreMacroCategoria } from '../types';
import { FORNITORI_TAXONOMY, suggerisciCategoriaFornitore } from '../constants';
import { parseContractPaymentTerms } from '../services/geminiService';

interface FornitoriTabProps {
  fornitori: Fornitore[];
  onAddFornitore: (data: Omit<Fornitore, 'id'>) => void;
  onUpdateFornitore: (id: string, data: Omit<Fornitore, 'id'>) => void;
  onDeleteFornitore: (id: string) => void;
  onImportBatch: (data: Omit<Fornitore, 'id'>[]) => void;
}

type FormState = {
  ragioneSociale: string;
  macroCategoria: FornitoreMacroCategoria;
  sottoCategoria: string;
  pIvaCf: string;
  indirizzo: string;
  telefono: string;
  email: string;
  pec: string;
  note: string;
  pagamentoAFineLavorazione: boolean;
  terminiPagamentoNote: string;
};

const EMPTY_FORM: FormState = {
  ragioneSociale: '', macroCategoria: 'grezzo', sottoCategoria: '',
  pIvaCf: '', indirizzo: '', telefono: '', email: '', pec: '', note: '',
  pagamentoAFineLavorazione: false, terminiPagamentoNote: '',
};

const MACRO_LABEL: Record<FornitoreMacroCategoria, string> = {
  grezzo: 'Grezzo',
  finiture: 'Finiture',
  mezzi_trasporti: 'Mezzi e Trasporti',
  professionisti: 'Professionisti e Consulenza',
  utenze_servizi: 'Utenze, Banche e Servizi',
  ristorazione: 'Ristorazione e Rappresentanza',
  personale: 'Personale e Collaboratori',
  enti_altro: 'Enti, Condomini e Altro',
  non_categorizzato: 'Da Categorizzare',
};

function toFornitoreInput(f: FormState): Omit<Fornitore, 'id'> {
  return {
    ragioneSociale: f.ragioneSociale.trim(),
    macroCategoria: f.macroCategoria,
    sottoCategoria: f.sottoCategoria.trim() || undefined,
    pIvaCf: f.pIvaCf.trim() || undefined,
    indirizzo: f.indirizzo.trim() || undefined,
    telefono: f.telefono.trim() || undefined,
    email: f.email.trim() || undefined,
    pec: f.pec.trim() || undefined,
    note: f.note.trim() || undefined,
    pagamentoAFineLavorazione: f.pagamentoAFineLavorazione || undefined,
    terminiPagamentoNote: f.terminiPagamentoNote.trim() || undefined,
  };
}

function fromFornitore(f: Fornitore): FormState {
  return {
    ragioneSociale: f.ragioneSociale,
    macroCategoria: f.macroCategoria,
    sottoCategoria: f.sottoCategoria || '',
    pIvaCf: f.pIvaCf || '',
    indirizzo: f.indirizzo || '',
    telefono: f.telefono || '',
    email: f.email || '',
    pec: f.pec || '',
    note: f.note || '',
    pagamentoAFineLavorazione: f.pagamentoAFineLavorazione || false,
    terminiPagamentoNote: f.terminiPagamentoNote || '',
  };
}

const MACRO_OPTIONS: FornitoreMacroCategoria[] = [
  'grezzo', 'finiture', 'mezzi_trasporti', 'professionisti', 'utenze_servizi',
  'ristorazione', 'personale', 'enti_altro', 'non_categorizzato',
];

function FornitoreForm({ value, onChange }: { value: FormState; onChange: (v: FormState) => void }) {
  const subOptions = value.macroCategoria !== 'non_categorizzato'
    ? FORNITORI_TAXONOMY[value.macroCategoria]
    : [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <input
        autoFocus
        value={value.ragioneSociale}
        onChange={e => onChange({ ...value, ragioneSociale: e.target.value })}
        placeholder="Ragione sociale"
        className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <select
        value={value.macroCategoria}
        onChange={e => onChange({ ...value, macroCategoria: e.target.value as FornitoreMacroCategoria, sottoCategoria: '' })}
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
      >
        {MACRO_OPTIONS.map(m => <option key={m} value={m}>{MACRO_LABEL[m]}</option>)}
      </select>
      <input
        list="sottocategoria-options"
        value={value.sottoCategoria}
        onChange={e => onChange({ ...value, sottoCategoria: e.target.value })}
        placeholder="Sottocategoria tematica"
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <datalist id="sottocategoria-options">
        {subOptions.map(s => <option key={s} value={s} />)}
      </datalist>
      <input
        value={value.pIvaCf}
        onChange={e => onChange({ ...value, pIvaCf: e.target.value })}
        placeholder="P.IVA / Codice Fiscale"
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <input
        value={value.telefono}
        onChange={e => onChange({ ...value, telefono: e.target.value })}
        placeholder="Telefono"
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <input
        value={value.email}
        onChange={e => onChange({ ...value, email: e.target.value })}
        placeholder="Email"
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <input
        value={value.pec}
        onChange={e => onChange({ ...value, pec: e.target.value })}
        placeholder="PEC"
        className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <input
        value={value.indirizzo}
        onChange={e => onChange({ ...value, indirizzo: e.target.value })}
        placeholder="Indirizzo"
        className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 text-sm"
      />
      <textarea
        value={value.note}
        onChange={e => onChange({ ...value, note: e.target.value })}
        placeholder="Note"
        rows={2}
        className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none"
      />

      <div className="sm:col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value.pagamentoAFineLavorazione}
            onChange={e => onChange({ ...value, pagamentoAFineLavorazione: e.target.checked })}
            className="rounded"
          />
          Pagamento legato al completamento di una lavorazione
        </label>
        <p className="text-[11px] text-slate-400 pl-6">
          Se attivo, Direttore Cantiere avvisa l'amministrazione qui quando una lavorazione assegnata a questo fornitore viene segnata come finita.
        </p>
        <textarea
          value={value.terminiPagamentoNote}
          onChange={e => onChange({ ...value, terminiPagamentoNote: e.target.value })}
          placeholder="Termini di pagamento da contratto (es. acconto 30% a fine grezzo, saldo a fine finiture)"
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none"
        />
        <ContractExtractPanel onExtracted={(res) => onChange({ ...value, pagamentoAFineLavorazione: res.pagamentoAFineLavorazione, terminiPagamentoNote: res.note })} />
      </div>
    </div>
  );
}

function ContractExtractPanel({ onExtracted }: { onExtracted: (res: { pagamentoAFineLavorazione: boolean; note: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analizza = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parseContractPaymentTerms(text);
      if (!result) {
        setError('Nessun termine riconosciuto. Verifica il testo incollato o riprova.');
        return;
      }
      onExtracted(result);
      setOpen(false);
      setText('');
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'analisi.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
      >
        <FileSearch size={14} /> Estrai termini da contratto (AI)
      </button>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <p className="text-[11px] text-slate-500">
        Incolla qui il testo del contratto (o solo la clausola sui pagamenti) — l'AI propone i due campi sopra, da rivedere prima di salvare.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        placeholder="Incolla qui il testo del contratto..."
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono resize-none"
      />
      {error && <div className="text-xs text-red-600 font-bold">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={analizza}
          disabled={loading || !text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
        >
          <Sparkles size={14} /> {loading ? 'Analisi in corso...' : 'Analizza'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg text-xs font-bold transition-colors">
          Annulla
        </button>
      </div>
    </div>
  );
}

export function FornitoriTab({ fornitori, onAddFornitore, onUpdateFornitore, onDeleteFornitore, onImportBatch }: FornitoriTabProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [importPreview, setImportPreview] = useState<{ nuovi: Omit<Fornitore, 'id'>[]; aggiornamenti: { id: string; ragioneSociale: string; data: Omit<Fornitore, 'id'> }[] } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<FornitoreMacroCategoria, Record<string, Fornitore[]>> = {
      grezzo: {}, finiture: {}, mezzi_trasporti: {}, professionisti: {},
      utenze_servizi: {}, ristorazione: {}, personale: {}, enti_altro: {},
      non_categorizzato: {},
    };
    for (const f of fornitori) {
      const sub = f.sottoCategoria || '(senza sottocategoria)';
      const macro = groups[f.macroCategoria] || groups.non_categorizzato;
      if (!macro[sub]) macro[sub] = [];
      macro[sub].push(f);
    }
    return groups;
  }, [fornitori]);

  const startAdd = () => { setIsAdding(true); setEditingId(null); setForm(EMPTY_FORM); };
  const startEdit = (f: Fornitore) => { setEditingId(f.id); setIsAdding(false); setForm(fromFornitore(f)); };
  const cancel = () => { setIsAdding(false); setEditingId(null); };

  const save = () => {
    if (!form.ragioneSociale.trim()) return;
    if (editingId) {
      onUpdateFornitore(editingId, toFornitoreInput(form));
    } else {
      onAddFornitore(toFornitoreInput(form));
    }
    setIsAdding(false);
    setEditingId(null);
  };

  const toggleGroup = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Applica un suggerimento di categoria (o una correzione manuale) a un fornitore esistente,
  // preservando tutti gli altri campi già impostati — nessuna riscrittura totale del record.
  const applyCategoria = (f: Fornitore, macroCategoria: FornitoreMacroCategoria, sottoCategoria: string) => {
    const { id, ...rest } = f;
    onUpdateFornitore(id, { ...rest, macroCategoria, sottoCategoria });
  };

  // Suggerimenti (best-effort, da confermare) per i fornitori ancora "Da Categorizzare" —
  // vedi suggerisciCategoriaFornitore in constants.ts: nessun indizio affidabile nel nome ->
  // nessun suggerimento, restano da classificare a mano come prima (richiesto 2026-09-16, per
  // rendere il lavoro dell'utente "solo controllo" invece di classificare 579 righe da zero).
  const suggerimenti = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggerisciCategoriaFornitore>>();
    for (const f of fornitori) {
      if (f.macroCategoria !== 'non_categorizzato') continue;
      const s = suggerisciCategoriaFornitore(f.ragioneSociale);
      if (s) map.set(f.id, s);
    }
    return map;
  }, [fornitori]);

  const applicaTuttiISuggerimenti = () => {
    for (const f of fornitori) {
      const s = suggerimenti.get(f.id);
      if (s) applyCategoria(f, s.macroCategoria, s.sottoCategoria);
    }
  };

  const handleImportFile = (file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const rows = Array.isArray(parsed) ? parsed : parsed.fornitori;
        if (!Array.isArray(rows)) throw new Error('Formato non riconosciuto: atteso un array di fornitori');
        const existingByPuntaNetId = new Map(fornitori.filter(f => f.puntaNetIdCliFor).map(f => [f.puntaNetIdCliFor, f]));
        const existingNames = new Set(fornitori.map(f => f.ragioneSociale.toLowerCase().trim()));

        const nuovi: Omit<Fornitore, 'id'>[] = rows
          .filter((r: any) => r.ragioneSociale && !existingByPuntaNetId.has(r.puntaNetIdCliFor) && !existingNames.has(String(r.ragioneSociale).toLowerCase().trim()))
          .map((r: any) => ({
            ragioneSociale: r.ragioneSociale,
            macroCategoria: 'non_categorizzato' as const,
            pIvaCf: r.pIvaCf || undefined,
            indirizzo: r.indirizzo || undefined,
            telefono: r.telefono || undefined,
            email: r.email || undefined,
            pec: r.pec || undefined,
            puntaNetIdCliFor: r.puntaNetIdCliFor || undefined,
            numeroFatturePuntaNet: r.numeroFatturePuntaNet || undefined,
            fatturatoAnnoCorrente: r.fatturatoAnnoCorrente || undefined,
            fatturatoTotalePuntaNet: r.fatturatoTotalePuntaNet || undefined,
            ultimaFatturaPuntaNet: r.ultimaFatturaPuntaNet || undefined,
          }));

        // Per i fornitori già presenti (collegati via puntaNetIdCliFor), un
        // re-import aggiorna SOLO il riepilogo economico — mai macroCategoria,
        // sottoCategoria o note, che restano scelte dell'utente.
        const aggiornamenti = rows
          .filter((r: any) => r.ragioneSociale && r.puntaNetIdCliFor && existingByPuntaNetId.has(r.puntaNetIdCliFor))
          .map((r: any) => {
            const esistente = existingByPuntaNetId.get(r.puntaNetIdCliFor)!;
            const { id, ...rest } = esistente;
            return {
              id,
              ragioneSociale: esistente.ragioneSociale,
              data: {
                ...rest,
                numeroFatturePuntaNet: r.numeroFatturePuntaNet || undefined,
                fatturatoAnnoCorrente: r.fatturatoAnnoCorrente || undefined,
                fatturatoTotalePuntaNet: r.fatturatoTotalePuntaNet || undefined,
                ultimaFatturaPuntaNet: r.ultimaFatturaPuntaNet || undefined,
              },
            };
          });

        setImportPreview({ nuovi, aggiornamenti });
      } catch (e: any) {
        setImportError(e.message || 'File non valido');
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (importPreview) {
      if (importPreview.nuovi.length > 0) onImportBatch(importPreview.nuovi);
      importPreview.aggiornamenti.forEach(a => onUpdateFornitore(a.id, a.data));
    }
    setImportPreview(null);
  };

  const macroOrder: FornitoreMacroCategoria[] = [
    'grezzo', 'finiture', 'mezzi_trasporti', 'professionisti', 'utenze_servizi',
    'ristorazione', 'personale', 'enti_altro', 'non_categorizzato',
  ];
  const macroIcon: Record<FornitoreMacroCategoria, React.ReactNode> = {
    grezzo: <HardHat size={16} />,
    finiture: <Paintbrush size={16} />,
    mezzi_trasporti: <Truck size={16} />,
    professionisti: <Briefcase size={16} />,
    utenze_servizi: <Zap size={16} />,
    ristorazione: <UtensilsCrossed size={16} />,
    personale: <Users size={16} />,
    enti_altro: <Landmark size={16} />,
    non_categorizzato: <Inbox size={16} />,
  };
  const macroStyle: Record<FornitoreMacroCategoria, string> = {
    grezzo: 'bg-stone-50 text-stone-700 border-stone-200',
    finiture: 'bg-sky-50 text-sky-700 border-sky-200',
    mezzi_trasporti: 'bg-orange-50 text-orange-700 border-orange-200',
    professionisti: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    utenze_servizi: 'bg-amber-50 text-amber-700 border-amber-200',
    ristorazione: 'bg-rose-50 text-rose-700 border-rose-200',
    personale: 'bg-teal-50 text-teal-700 border-teal-200',
    enti_altro: 'bg-violet-50 text-violet-700 border-violet-200',
    non_categorizzato: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Anagrafica Fornitori</h2>
          <p className="text-xs text-slate-500 mt-1">Divisa per macro categoria di lavorazione (Grezzo / Finiture) e sottocategoria tematica.</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer">
            <Upload size={14} /> Importa report PuntaNet
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
            />
          </label>
          {!isAdding && (
            <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all">
              <Plus size={14} /> Nuovo Fornitore
            </button>
          )}
        </div>
      </div>

      {importError && (
        <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-xl">{importError}</div>
      )}

      {importPreview && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-amber-800">
              {importPreview.nuovi.length === 0 && importPreview.aggiornamenti.length === 0
                ? 'Nessuna novità da importare (report identico ai dati già presenti).'
                : [
                    importPreview.nuovi.length > 0 ? `${importPreview.nuovi.length} fornitori nuovi (categoria "Da Categorizzare")` : null,
                    importPreview.aggiornamenti.length > 0 ? `${importPreview.aggiornamenti.length} con fatturato/numero fatture aggiornati` : null,
                  ].filter(Boolean).join(' · ')}
            </p>
            <div className="flex gap-2 shrink-0">
              {(importPreview.nuovi.length > 0 || importPreview.aggiornamenti.length > 0) && (
                <button onClick={confirmImport} className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600"><Check size={16} /></button>
              )}
              <button onClick={() => setImportPreview(null)} className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300"><X size={16} /></button>
            </div>
          </div>
          {(importPreview.nuovi.length > 0 || importPreview.aggiornamenti.length > 0) && (
            <ul className="text-xs text-amber-700 max-h-32 overflow-y-auto list-disc list-inside">
              {importPreview.nuovi.map((f, i) => <li key={`n${i}`}>{f.ragioneSociale}{f.pIvaCf ? ` — ${f.pIvaCf}` : ''} (nuovo)</li>)}
              {importPreview.aggiornamenti.map((a, i) => <li key={`a${i}`}>{a.ragioneSociale} (aggiornamento)</li>)}
            </ul>
          )}
        </div>
      )}

      {(isAdding || editingId) && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <FornitoreForm value={form} onChange={setForm} />
          <div className="flex gap-2 justify-end">
            <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600"><Check size={14} /> Salva</button>
            <button onClick={cancel} className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-300"><X size={14} /> Annulla</button>
          </div>
        </div>
      )}

      {fornitori.length === 0 && !isAdding && (
        <div className="p-10 text-center text-sm text-slate-400 bg-white border border-slate-200 rounded-2xl">Nessun fornitore registrato.</div>
      )}

      <div className="space-y-6">
        {macroOrder.filter(macro => Object.keys(grouped[macro]).length > 0).map(macro => (
          <div key={macro} className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider ${macroStyle[macro]}`}>
                {macroIcon[macro]} {MACRO_LABEL[macro]}
              </div>
              {macro === 'non_categorizzato' && suggerimenti.size > 0 && (
                <button
                  onClick={applicaTuttiISuggerimenti}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[11px] font-black transition-colors"
                >
                  <Wand2 size={13} /> Applica tutti i {suggerimenti.size} suggerimenti
                </button>
              )}
            </div>
            {Object.entries(grouped[macro]).sort(([a], [b]) => a.localeCompare(b)).map(([sub, list]) => {
              const key = `${macro}::${sub}`;
              const isCollapsed = collapsed[key];
              return (
                <div key={key} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-all"
                  >
                    <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {sub}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{list.length} fornitori</span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {list.map(f => {
                        const suggerito = suggerimenti.get(f.id);
                        return (
                        <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate flex items-center gap-2">
                              {f.ragioneSociale}
                              {f.pagamentoAFineLavorazione && (
                                <span title={f.terminiPagamentoNote || 'Pagamento legato a fine lavorazione'} className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                                  Pagamento a fine lavorazione
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                              {f.pIvaCf && <span>{f.pIvaCf}</span>}
                              {f.telefono && <span>{f.telefono}</span>}
                              {f.email && <span>{f.email}</span>}
                              {f.condizionePagamentoPuntaNet && <span title="Condizione di pagamento da PuntaNet">💳 {f.condizionePagamentoPuntaNet}</span>}
                            </div>
                          </div>
                          {suggerito && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 px-2 py-1 rounded-full">
                                Suggerito: {MACRO_LABEL[suggerito.macroCategoria]} → {suggerito.sottoCategoria}
                              </span>
                              <button
                                onClick={() => applyCategoria(f, suggerito.macroCategoria, suggerito.sottoCategoria)}
                                title="Conferma questo suggerimento"
                                className="p-1.5 text-violet-500 hover:text-white hover:bg-violet-600 bg-violet-50 rounded-lg transition-all"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          )}
                          <button onClick={() => startEdit(f)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"><Edit2 size={14} /></button>
                          <button onClick={() => onDeleteFornitore(f.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
