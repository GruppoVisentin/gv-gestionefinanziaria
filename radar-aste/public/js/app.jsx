import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

/* ═══════════════════════════ HELPERS ═══════════════════════════ */
const api = {
  get: (u) => fetch(u).then(r => r.json()),
  post: (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  put: (u, b) => fetch(u, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  del: (u) => fetch(u, { method: 'DELETE' }).then(r => r.json()),
  postCSV: (u, csv) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csv }).then(r => r.json()),
};

const eur = (n) => (n == null || n === '') ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const pct = (n) => (n == null) ? '—' : (n * 100).toFixed(0) + '%';
const dateIT = (s) => s ? new Date(s).toLocaleDateString('it-IT') : '—';
const cx = (...a) => a.filter(Boolean).join(' ');

const TONE = {
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  amber:   'bg-amber-100 text-amber-800 ring-amber-200',
  blue:    'bg-blue-100 text-blue-700 ring-blue-200',
  violet:  'bg-violet-100 text-violet-700 ring-violet-200',
  cyan:    'bg-cyan-100 text-cyan-700 ring-cyan-200',
  emerald: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  rose:    'bg-rose-100 text-rose-700 ring-rose-200',
  gray:    'bg-gray-100 text-gray-600 ring-gray-200',
};

function derivedAsta(a) {
  const d = {};
  if (a.valoreStimato && a.prezzoBase) d.scontoVsMercato = 1 - (a.prezzoBase / a.valoreStimato);
  if (a.valoreRivendita != null && a.prezzoBase != null) {
    d.marginePotenziale = a.valoreRivendita - a.prezzoBase - (a.costoRistrutturazione || 0);
    if (a.prezzoBase) d.roiPotenziale = d.marginePotenziale / (a.prezzoBase + (a.costoRistrutturazione || 0));
  }
  if (a.dataVendita) d.giorniAllaVendita = Math.ceil((new Date(a.dataVendita) - new Date()) / 86400000);
  return d;
}

/* ═══════════════════════════ ICONE (inline SVG) ═══════════════════════════ */
const Ic = {
  radar: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19.07 4.93A10 10 0 1 0 22 12"/><path d="M12 12 8 8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 12l6-3"/></svg>,
  eye: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  gear: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>,
  refresh: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>,
  plus: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  upload: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>,
  trash: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
  edit: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  x: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  ext: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>,
  clock: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  search: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  pin: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
};

/* ═══════════════════════════ UI PRIMITIVES ═══════════════════════════ */
function Badge({ tone = 'slate', children }) {
  return <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ring-1', TONE[tone] || TONE.slate)}>{children}</span>;
}

function Kpi({ label, value, sub, tone = 'slate' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cx('text-2xl font-black mt-1', tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900')}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarList({ title, data, tone = 'blue', fmt = (v) => v }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{title}</p>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-xs text-slate-400">Nessun dato</p>}
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-slate-600 truncate" title={d.label}>{d.label}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
              <div className={cx('h-full rounded-md', 'bg-' + tone + '-500')} style={{ width: (d.value / max * 100) + '%' }} />
            </div>
            <span className="w-14 shrink-0 text-right text-xs font-bold text-slate-700">{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className={cx('bg-white w-full rounded-t-3xl md:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto fade-in', wide ? 'md:max-w-3xl' : 'md:max-w-xl')} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="font-black text-slate-900">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><Ic.x width={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, half }) {
  return (
    <label className={cx('block', half ? 'md:col-span-1' : 'md:col-span-2')}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400';
function TextInput(p) { return <input {...p} className={inputCls} />; }
function Select({ options, value, onChange, placeholder }) {
  return (
    <select value={value || ''} onChange={onChange} className={inputCls}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

/* ═══════════════════════════ RADAR ASTE ═══════════════════════════ */
function RadarAste({ meta, toast }) {
  const [aste, setAste] = useState([]);
  const [scrape, setScrape] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [fTrib, setFTrib] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fStato, setFStato] = useState('');
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(() => {
    api.get('/api/aste').then(d => { setAste(d.aste || []); setScrape(d.scrape); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const runScrape = async () => {
    setBusy(true);
    const r = await api.post('/api/scrape/run', {});
    toast(r.status, r.usedSample ? 'warn' : 'ok');
    load(); setBusy(false);
  };

  const save = async (a) => {
    if (a.id) await api.put('/api/aste/' + a.id, a); else await api.post('/api/aste', a);
    setEditing(null); load(); toast('Asta salvata', 'ok');
  };
  const remove = async (id) => { if (confirm('Eliminare questa asta?')) { await api.del('/api/aste/' + id); load(); } };

  const statoLabel = (id) => (meta.statiAsta.find(s => s.id === id) || {}).label || id;
  const statoTone = (id) => (meta.statiAsta.find(s => s.id === id) || {}).color || 'slate';

  const filtered = useMemo(() => aste.filter(a => {
    if (fTrib && a.tribunale !== fTrib) return false;
    if (fTipo && a.tipologiaImmobile !== fTipo) return false;
    if (fStato && a.stato !== fStato) return false;
    if (q) {
      const s = (a.comune + ' ' + a.indirizzo + ' ' + a.riferimentoProcedura + ' ' + a.note).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [aste, fTrib, fTipo, fStato, q]);

  const kpi = useMemo(() => {
    const attive = aste.filter(a => !['persa', 'scartata', 'aggiudicata'].includes(a.stato));
    const scadenza = aste.map(a => ({ a, d: derivedAsta(a) })).filter(x => x.d.giorniAllaVendita != null && x.d.giorniAllaVendita >= 0 && x.d.giorniAllaVendita <= 15);
    const pipeline = aste.filter(a => ['interessante', 'sopralluogo', 'offerta_presentata'].includes(a.stato));
    const sconti = aste.map(a => derivedAsta(a).scontoVsMercato).filter(x => x != null);
    const scontoMedio = sconti.length ? sconti.reduce((s, x) => s + x, 0) / sconti.length : null;
    return { tot: aste.length, attive: attive.length, scadenza: scadenza.length, pipeline: pipeline.length, scontoMedio };
  }, [aste]);

  const perTrib = useMemo(() => aggBy(aste, 'tribunale'), [aste]);
  const perStato = useMemo(() => meta.statiAsta.map(s => ({ label: s.label, value: aste.filter(a => a.stato === s.id).length })).filter(x => x.value), [aste, meta]);

  if (loading) return <Loader />;

  return (
    <div className="fade-in space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Aste monitorate" value={kpi.tot} sub={`${kpi.attive} attive`} />
        <Kpi label="In scadenza ≤15gg" value={kpi.scadenza} tone={kpi.scadenza ? 'rose' : 'slate'} sub="prossime vendite" />
        <Kpi label="In pipeline" value={kpi.pipeline} tone="emerald" sub="interessanti / offerte" />
        <Kpi label="Sconto medio vs mercato" value={pct(kpi.scontoMedio)} sub="base d'asta vs stima" />
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Ic.search width={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca comune, indirizzo, RGE…" className={cx(inputCls, 'pl-9')} />
        </div>
        <Select options={meta.tribunali} value={fTrib} onChange={e => setFTrib(e.target.value)} placeholder="Tutti i tribunali" />
        <Select options={meta.tipologie} value={fTipo} onChange={e => setFTipo(e.target.value)} placeholder="Tutte le tipologie" />
        <Select options={meta.statiAsta} value={fStato} onChange={e => setFStato(e.target.value)} placeholder="Tutti gli stati" />
        <button onClick={runScrape} disabled={busy} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50">
          <Ic.refresh width={15} className={busy ? 'animate-spin' : ''} /> {busy ? 'Aggiorno…' : 'Aggiorna adesso'}
        </button>
        <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"><Ic.upload width={15} /> CSV</button>
        <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500"><Ic.plus width={15} /> Nuova</button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BarList title="Aste per tribunale" data={perTrib} tone="blue" />
        <BarList title="Pipeline per stato" data={perStato} tone="violet" />
      </div>

      {/* Stato motore */}
      {scrape && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-600 flex items-center gap-2">
          <Ic.clock width={14} className="text-slate-400 shrink-0" />
          <span className="truncate"><b>Ultimo aggiornamento:</b> {scrape.lastRun ? dateIT(scrape.lastRun) + ' ' + new Date(scrape.lastRun).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'mai'} — {scrape.lastStatus}</span>
        </div>
      )}

      {/* Lista */}
      <div className="grid grid-cols-1 gap-2">
        {filtered.length === 0 && <Empty text="Nessuna asta corrisponde ai filtri." />}
        {filtered.map(a => {
          const d = derivedAsta(a);
          const urgente = d.giorniAllaVendita != null && d.giorniAllaVendita >= 0 && d.giorniAllaVendita <= 15;
          return (
            <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={statoTone(a.stato)}>{statoLabel(a.stato)}</Badge>
                    <Badge tone="slate">{a.tipologiaImmobile}</Badge>
                    {a.fonte === 'SAMPLE' && <Badge tone="amber">esempio</Badge>}
                    {a.fonte === 'PVP' && <Badge tone="cyan">PVP</Badge>}
                  </div>
                  <p className="font-black text-slate-900 mt-1 truncate flex items-center gap-1">
                    <Ic.pin width={14} className="text-slate-400 shrink-0" />
                    {a.comune || '—'} <span className="font-normal text-slate-500 text-sm truncate">· {a.indirizzo || 's.indirizzo'}</span>
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.tribunale && 'Trib. ' + a.tribunale} {a.riferimentoProcedura && '· ' + a.riferimentoProcedura} {a.lotto && '· Lotto ' + a.lotto}</p>
                </div>
                <div className="grid grid-cols-3 md:flex md:items-center gap-4 md:gap-6 text-center md:text-right">
                  <div><p className="text-[10px] uppercase font-bold text-slate-400">Base d'asta</p><p className="font-black text-slate-900">{eur(a.prezzoBase)}</p></div>
                  <div><p className="text-[10px] uppercase font-bold text-slate-400">Sconto mercato</p><p className={cx('font-black', d.scontoVsMercato >= 0.3 ? 'text-emerald-600' : 'text-slate-700')}>{pct(d.scontoVsMercato)}</p></div>
                  <div><p className="text-[10px] uppercase font-bold text-slate-400">Vendita</p><p className={cx('font-bold text-sm', urgente ? 'text-rose-600' : 'text-slate-700')}>{dateIT(a.dataVendita)}{d.giorniAllaVendita != null && d.giorniAllaVendita >= 0 ? ` (${d.giorniAllaVendita}gg)` : ''}</p></div>
                </div>
                <div className="flex md:flex-col gap-1 shrink-0">
                  {a.linkPVP && <a href={a.linkPVP} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500" title="Apri annuncio"><Ic.ext width={16} /></a>}
                  <button onClick={() => setEditing(a)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500" title="Modifica"><Ic.edit width={16} /></button>
                  <button onClick={() => remove(a.id)} className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-500" title="Elimina"><Ic.trash width={16} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && <AstaForm asta={editing} meta={meta} onClose={() => setEditing(null)} onSave={save} />}
      {showImport && <ImportModal target="aste" onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} toast={toast} />}
    </div>
  );
}

function AstaForm({ asta, meta, onClose, onSave }) {
  const [f, setF] = useState(() => Object.assign({ tipologiaImmobile: 'Residenziale', stato: 'da_valutare', tipoVendita: 'Non specificato' }, asta));
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  const d = derivedAsta(f);
  return (
    <Modal title={asta.id ? 'Modifica asta' : 'Nuova asta'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Tribunale" half><Select options={meta.tribunali} value={f.tribunale} onChange={set('tribunale')} placeholder="—" /></Field>
        <Field label="Rif. procedura (RGE)" half><TextInput value={f.riferimentoProcedura || ''} onChange={set('riferimentoProcedura')} placeholder="es. RGE 145/2024" /></Field>
        <Field label="Comune" half><TextInput value={f.comune || ''} onChange={set('comune')} /></Field>
        <Field label="Provincia" half><TextInput value={f.provincia || ''} onChange={set('provincia')} placeholder="VI" /></Field>
        <Field label="Indirizzo"><TextInput value={f.indirizzo || ''} onChange={set('indirizzo')} /></Field>
        <Field label="Tipologia" half><Select options={meta.tipologie} value={f.tipologiaImmobile} onChange={set('tipologiaImmobile')} /></Field>
        <Field label="Lotto" half><TextInput value={f.lotto || ''} onChange={set('lotto')} /></Field>
        <Field label="Superficie (mq)" half><TextInput type="number" value={f.superficieMq || ''} onChange={set('superficieMq')} /></Field>
        <Field label="Tipo vendita" half><Select options={meta.tipiVendita} value={f.tipoVendita} onChange={set('tipoVendita')} /></Field>
        <Field label="Base d'asta (€)" half><TextInput type="number" value={f.prezzoBase || ''} onChange={set('prezzoBase')} /></Field>
        <Field label="Offerta minima (€)" half><TextInput type="number" value={f.offertaMinima || ''} onChange={set('offertaMinima')} /></Field>
        <Field label="Data vendita" half><TextInput type="date" value={f.dataVendita || ''} onChange={set('dataVendita')} /></Field>
        <Field label="Stato" half><Select options={meta.statiAsta} value={f.stato} onChange={set('stato')} /></Field>

        <div className="md:col-span-2 mt-2 pt-3 border-t border-slate-100"><p className="text-[11px] font-bold uppercase text-slate-400">Valutazione interna</p></div>
        <Field label="Valore di mercato stimato (€)" half><TextInput type="number" value={f.valoreStimato || ''} onChange={set('valoreStimato')} /></Field>
        <Field label="Costo ristrutturazione (€)" half><TextInput type="number" value={f.costoRistrutturazione || ''} onChange={set('costoRistrutturazione')} /></Field>
        <Field label="Valore rivendita atteso (€)" half><TextInput type="number" value={f.valoreRivendita || ''} onChange={set('valoreRivendita')} /></Field>
        <Field label="Referente" half><TextInput value={f.referente || ''} onChange={set('referente')} /></Field>
        <Field label="Link annuncio PVP"><TextInput value={f.linkPVP || ''} onChange={set('linkPVP')} placeholder="https://pvp.giustizia.it/…" /></Field>
        <Field label="Note"><textarea value={f.note || ''} onChange={set('note')} rows={2} className={inputCls} /></Field>
      </div>

      {(d.scontoVsMercato != null || d.marginePotenziale != null) && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {d.scontoVsMercato != null && <span className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200"><b>Sconto vs mercato:</b> {pct(d.scontoVsMercato)}</span>}
          {d.marginePotenziale != null && <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200"><b>Margine potenziale:</b> {eur(d.marginePotenziale)} {d.roiPotenziale != null && `(ROI ${pct(d.roiPotenziale)})`}</span>}
        </div>
      )}

      <div className="mt-5 flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Annulla</button>
        <button onClick={() => onSave(f)} className="px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800">Salva</button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════ CONCORRENTI ═══════════════════════════ */
function Concorrenti({ meta, toast }) {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [fStato, setFStato] = useState('');
  const [fRil, setFRil] = useState('');
  const [editing, setEditing] = useState(null);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(() => api.get('/api/operazioni').then(d => { setOps(d.operazioni || []); setLoading(false); }), []);
  useEffect(() => { load(); }, [load]);

  const save = async (o) => { if (o.id) await api.put('/api/operazioni/' + o.id, o); else await api.post('/api/operazioni', o); setEditing(null); load(); toast('Operazione salvata', 'ok'); };
  const remove = async (id) => { if (confirm('Eliminare questa operazione?')) { await api.del('/api/operazioni/' + id); load(); } };

  const statoLabel = (id) => (meta.statiOperazione.find(s => s.id === id) || {}).label || id;
  const statoTone = (id) => (meta.statiOperazione.find(s => s.id === id) || {}).color || 'slate';
  const rilTone = (id) => (meta.livelliRilevanza.find(s => s.id === id) || {}).color || 'slate';

  const filtered = useMemo(() => ops.filter(o => {
    if (fStato && o.stato !== fStato) return false;
    if (fRil && o.rilevanza !== fRil) return false;
    if (q) { const s = (o.concorrente + ' ' + o.comune + ' ' + o.indirizzo + ' ' + o.note).toLowerCase(); if (!s.includes(q.toLowerCase())) return false; }
    return true;
  }), [ops, fStato, fRil, q]);

  const kpi = useMemo(() => {
    const alta = ops.filter(o => o.rilevanza === 'alta').length;
    const inCorso = ops.filter(o => o.stato === 'in_corso').length;
    const valore = ops.reduce((s, o) => s + (o.valoreStimato || 0), 0);
    return { tot: ops.length, alta, inCorso, valore };
  }, [ops]);

  const perConc = useMemo(() => aggBy(ops, 'concorrente').slice(0, 8), [ops]);
  const perTipo = useMemo(() => aggBy(ops, 'tipoOperazione'), [ops]);

  if (loading) return <Loader />;

  return (
    <div className="fade-in space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Operazioni monitorate" value={kpi.tot} />
        <Kpi label="In corso" value={kpi.inCorso} tone="emerald" />
        <Kpi label="Alta rilevanza" value={kpi.alta} tone={kpi.alta ? 'rose' : 'slate'} />
        <Kpi label="Valore monitorato" value={eur(kpi.valore)} sub="somma stime" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Ic.search width={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca concorrente, comune…" className={cx(inputCls, 'pl-9')} />
        </div>
        <Select options={meta.statiOperazione} value={fStato} onChange={e => setFStato(e.target.value)} placeholder="Tutti gli stati" />
        <Select options={meta.livelliRilevanza} value={fRil} onChange={e => setFRil(e.target.value)} placeholder="Ogni rilevanza" />
        <button onClick={() => setShowImport(true)} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"><Ic.upload width={15} /> CSV</button>
        <button onClick={() => setEditing({})} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500"><Ic.plus width={15} /> Nuova</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BarList title="Operazioni per concorrente" data={perConc} tone="rose" />
        <BarList title="Per tipo operazione" data={perTipo} tone="cyan" />
      </div>

      <div className="grid grid-cols-1 gap-2">
        {filtered.length === 0 && <Empty text="Nessuna operazione registrata. Aggiungine una o importa un CSV." />}
        {filtered.map(o => (
          <div key={o.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={statoTone(o.stato)}>{statoLabel(o.stato)}</Badge>
                  <Badge tone={rilTone(o.rilevanza)}>rilevanza {o.rilevanza}</Badge>
                  <Badge tone="slate">{o.tipoOperazione}</Badge>
                </div>
                <p className="font-black text-slate-900 mt-1 truncate">{o.concorrente || 'Concorrente n.d.'}</p>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Ic.pin width={13} className="text-slate-400" /> {o.comune || '—'} {o.indirizzo && '· ' + o.indirizzo} {o.tipologiaImmobile && '· ' + o.tipologiaImmobile}</p>
                {o.note && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{o.note}</p>}
              </div>
              <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-6 text-center md:text-right">
                <div><p className="text-[10px] uppercase font-bold text-slate-400">Valore stimato</p><p className="font-black text-slate-900">{eur(o.valoreStimato)}</p></div>
                <div><p className="text-[10px] uppercase font-bold text-slate-400">Rilevata</p><p className="font-bold text-sm text-slate-700">{dateIT(o.dataRilevazione)}</p></div>
              </div>
              <div className="flex md:flex-col gap-1 shrink-0">
                {o.link && <a href={o.link} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><Ic.ext width={16} /></a>}
                <button onClick={() => setEditing(o)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><Ic.edit width={16} /></button>
                <button onClick={() => remove(o.id)} className="w-8 h-8 rounded-lg hover:bg-rose-50 flex items-center justify-center text-rose-500"><Ic.trash width={16} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && <OperazioneForm op={editing} meta={meta} onClose={() => setEditing(null)} onSave={save} />}
      {showImport && <ImportModal target="operazioni" onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} toast={toast} />}
    </div>
  );
}

function OperazioneForm({ op, meta, onClose, onSave }) {
  const [f, setF] = useState(() => Object.assign({ tipoOperazione: 'Acquisto', tipologiaImmobile: 'Residenziale', stato: 'individuata', rilevanza: 'media', fonte: 'Annuncio agenzia' }, op));
  const set = (k) => (e) => setF(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <Modal title={op.id ? 'Modifica operazione' : 'Nuova operazione concorrente'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Concorrente / Operatore"><TextInput value={f.concorrente || ''} onChange={set('concorrente')} placeholder="Nome impresa / immobiliare" /></Field>
        <Field label="Tipo operazione" half><Select options={meta.tipiOperazione} value={f.tipoOperazione} onChange={set('tipoOperazione')} /></Field>
        <Field label="Tipologia immobile" half><Select options={meta.tipologie} value={f.tipologiaImmobile} onChange={set('tipologiaImmobile')} /></Field>
        <Field label="Comune" half><TextInput value={f.comune || ''} onChange={set('comune')} /></Field>
        <Field label="Provincia" half><TextInput value={f.provincia || ''} onChange={set('provincia')} /></Field>
        <Field label="Indirizzo"><TextInput value={f.indirizzo || ''} onChange={set('indirizzo')} /></Field>
        <Field label="Superficie (mq)" half><TextInput type="number" value={f.superficieMq || ''} onChange={set('superficieMq')} /></Field>
        <Field label="N. unità" half><TextInput type="number" value={f.numeroUnita || ''} onChange={set('numeroUnita')} /></Field>
        <Field label="Valore stimato operazione (€)" half><TextInput type="number" value={f.valoreStimato || ''} onChange={set('valoreStimato')} /></Field>
        <Field label="Prezzo di riferimento (€)" half><TextInput type="number" value={f.prezzoRiferimento || ''} onChange={set('prezzoRiferimento')} /></Field>
        <Field label="Stato" half><Select options={meta.statiOperazione} value={f.stato} onChange={set('stato')} /></Field>
        <Field label="Rilevanza" half><Select options={meta.livelliRilevanza} value={f.rilevanza} onChange={set('rilevanza')} /></Field>
        <Field label="Fonte" half><Select options={meta.fontiConcorrente} value={f.fonte} onChange={set('fonte')} /></Field>
        <Field label="Data rilevazione" half><TextInput type="date" value={f.dataRilevazione || ''} onChange={set('dataRilevazione')} /></Field>
        <Field label="Data inizio" half><TextInput type="date" value={f.dataInizio || ''} onChange={set('dataInizio')} /></Field>
        <Field label="Fine prevista" half><TextInput type="date" value={f.dataFinePrevista || ''} onChange={set('dataFinePrevista')} /></Field>
        <Field label="Link"><TextInput value={f.link || ''} onChange={set('link')} /></Field>
        <Field label="Note"><textarea value={f.note || ''} onChange={set('note')} rows={2} className={inputCls} /></Field>
      </div>
      <div className="mt-5 flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Annulla</button>
        <button onClick={() => onSave(f)} className="px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800">Salva</button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════ IMPOSTAZIONI ═══════════════════════════ */
function Impostazioni({ meta, toast }) {
  const [cfg, setCfg] = useState(null);
  const [scrape, setScrape] = useState(null);
  useEffect(() => {
    api.get('/api/config').then(setCfg);
    api.get('/api/scrape/status').then(setScrape);
  }, []);
  if (!cfg) return <Loader />;

  const toggleIn = (key, val) => setCfg(prev => {
    const arr = new Set(prev[key] || []);
    if (arr.has(val)) arr.delete(val); else arr.add(val);
    return { ...prev, [key]: Array.from(arr) };
  });
  const saveCfg = async () => { const c = await api.put('/api/config', cfg); setCfg(c); toast('Impostazioni salvate', 'ok'); };

  return (
    <div className="fade-in space-y-5 max-w-4xl">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-black text-slate-900 mb-1">Zona monitorata</h3>
        <p className="text-xs text-slate-500 mb-4">Tribunali del Veneto da cui il radar raccoglie le aste. Nessuna selezione = tutti.</p>
        <div className="flex flex-wrap gap-2">
          {meta.tribunali.map(t => (
            <button key={t} onClick={() => toggleIn('tribunali', t)} className={cx('px-3 py-1.5 rounded-full text-xs font-bold ring-1', (cfg.tribunali || []).includes(t) ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{t}</button>
          ))}
        </div>

        <h3 className="font-black text-slate-900 mb-1 mt-6">Tipologie di interesse</h3>
        <div className="flex flex-wrap gap-2">
          {meta.tipologie.map(t => (
            <button key={t} onClick={() => toggleIn('tipologie', t)} className={cx('px-3 py-1.5 rounded-full text-xs font-bold ring-1', (cfg.tipologie || []).includes(t) ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{t}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <label className="block">
            <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Comuni (separati da virgola)</span>
            <TextInput value={(cfg.comuni || []).join(', ')} onChange={e => setCfg({ ...cfg, comuni: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Vicenza, Schio, Bassano…" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Base d'asta massima (€)</span>
            <TextInput type="number" value={cfg.prezzoMax || ''} onChange={e => setCfg({ ...cfg, prezzoMax: e.target.value ? Number(e.target.value) : null })} />
          </label>
        </div>
        <div className="mt-4"><button onClick={saveCfg} className="px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800">Salva impostazioni</button></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-black text-slate-900 mb-1">Motore di scraping</h3>
        <p className="text-xs text-slate-500 mb-3">Il radar interroga il PVP <b>2 volte al giorno</b> (08:00 e 20:00). Ultimo esito:</p>
        {scrape && (
          <div className="text-xs bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p><b>Ultimo run:</b> {scrape.lastRun ? new Date(scrape.lastRun).toLocaleString('it-IT') : 'mai'}</p>
            <p className="mt-1 text-slate-600">{scrape.lastStatus}</p>
            {scrape.log && scrape.log.length > 0 && (
              <details className="mt-2"><summary className="cursor-pointer text-slate-500 font-bold">Storico ({scrape.log.length})</summary>
                <ul className="mt-2 space-y-1">{scrape.log.map((l, i) => <li key={i} className="text-slate-500">· {new Date(l.ts).toLocaleString('it-IT')} [{l.source}] {l.status}</li>)}</ul>
              </details>
            )}
          </div>
        )}
        <div className="mt-3 text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <b>Nota:</b> il collegamento automatico al PVP gira solo con l'app avviata sul PC in rete aperta. Se lo scraping non estrae annunci, vedi il <b>README → Calibrazione</b> (il PVP può richiedere rendering JavaScript / Playwright, oppure si può usare l'import CSV dai portali).
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ IMPORT CSV ═══════════════════════════ */
function ImportModal({ target, onClose, onDone, toast }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const onFile = (e) => { const file = e.target.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => setCsv(r.result); r.readAsText(file, 'utf-8'); };
  const doImport = async () => {
    setBusy(true);
    const res = await api.postCSV('/api/import/csv?target=' + target, csv);
    setBusy(false);
    if (res.error) { toast('Errore: ' + res.error, 'warn'); return; }
    toast(`Importati ${res.count} record (${res.righe} righe lette)`, 'ok');
    onDone();
  };
  const esempio = target === 'aste'
    ? 'tribunale;rge;lotto;tipologia;comune;provincia;indirizzo;mq;baseAsta;offertaMinima;dataVendita;valoreStimato;link'
    : 'concorrente;tipoOperazione;tipologia;comune;provincia;indirizzo;mq;valoreStimato;stato;rilevanza;fonte;link';
  return (
    <Modal title={'Importa CSV — ' + (target === 'aste' ? 'Aste' : 'Operazioni')} onClose={onClose} wide>
      <p className="text-xs text-slate-500 mb-2">Incolla il CSV (con intestazione) o carica un file. Separatore <code>;</code> o <code>,</code>. Intestazione consigliata:</p>
      <code className="block text-[10px] bg-slate-900 text-slate-100 rounded-lg p-2 mb-3 overflow-x-auto">{esempio}</code>
      <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="mb-2 text-xs" />
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder="Incolla qui il contenuto CSV…" className={cx(inputCls, 'font-mono text-xs')} />
      <div className="mt-4 flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">Annulla</button>
        <button onClick={doImport} disabled={busy || !csv.trim()} className="px-5 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">{busy ? 'Importo…' : 'Importa'}</button>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════ COMMON ═══════════════════════════ */
function Loader() { return <div className="py-20 text-center text-slate-400 text-sm font-semibold">Caricamento…</div>; }
function Empty({ text }) { return <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-2xl border border-dashed border-slate-200">{text}</div>; }
function aggBy(arr, key) {
  const m = {};
  arr.forEach(x => { const k = x[key] || '—'; m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/* ═══════════════════════════ APP ROOT ═══════════════════════════ */
function App() {
  const [tab, setTab] = useState('aste');
  const [meta, setMeta] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const toast = useCallback((msg, kind = 'ok') => { setToastMsg({ msg, kind }); setTimeout(() => setToastMsg(null), 3500); }, []);

  useEffect(() => { api.get('/api/meta').then(setMeta); }, []);

  const tabs = [
    { id: 'aste', label: 'Radar Aste', icon: Ic.radar },
    { id: 'concorrenti', label: 'Concorrenti', icon: Ic.eye },
    { id: 'config', label: 'Impostazioni', icon: Ic.gear },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-[#0a1628] text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Ic.radar width={20} className="text-blue-300" /></div>
          <div className="flex-1">
            <h1 className="font-black tracking-tight leading-none">GV Radar Aste</h1>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Gruppo Visentin — Aste & Monitoraggio Concorrenti</p>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors', tab === t.id ? 'border-blue-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-200')}>
              <t.icon width={16} /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {!meta ? <Loader /> : (
          <>
            {tab === 'aste' && <RadarAste meta={meta} toast={toast} />}
            {tab === 'concorrenti' && <Concorrenti meta={meta} toast={toast} />}
            {tab === 'config' && <Impostazioni meta={meta} toast={toast} />}
          </>
        )}
      </main>

      {toastMsg && (
        <div className={cx('fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-xl text-sm font-bold text-white max-w-[90vw]', toastMsg.kind === 'warn' ? 'bg-amber-600' : 'bg-slate-900')}>
          {toastMsg.msg}
        </div>
      )}
      <footer className="text-center text-[11px] text-slate-400 py-6">GV Radar Aste v1.0 · dati salvati localmente su questo PC</footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
