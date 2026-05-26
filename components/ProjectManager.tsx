import React, { useState } from 'react';
import { Project, IntestatarioFattura } from '../types';
import {
  Briefcase, MapPin, User, Calendar, HardHat, Plus,
  Trash2, X, Save, Wallet, Shield, Pencil, Building, UserCheck, ChevronDown
} from 'lucide-react';
import { DATE_FORMATTER } from '../constants';
import { v4 as uuidv4 } from 'uuid';

// ─── TIPOLOGIE PREIMPOSTATE ──────────────────────────────────────

const TIPOLOGIE_PRESET = [
  'Nuova Costruzione',
  'Ristrutturazione',
  'Manutenzione Straordinaria',
  'Immobiliare',
  'Impianti',
  'Opere Esterne',
  'Altra tipologia',
];

// ─── PROPS ───────────────────────────────────────────────────────

interface ProjectManagerProps {
  projects: Project[];
  onSave: (project: Omit<Project, 'id'>) => void;
  onUpdate: (project: Project) => void;
  onDelete: (id: string) => void;
  isAuthorized?: boolean;
}

// ─── FORM VUOTO ──────────────────────────────────────────────────

const emptyForm = () => ({
  name: '',
  client: '',
  location: '',
  jobType: '',
  jobTypeCustom: '',
  startDate: new Date().toISOString().split('T')[0],
  intestatari: [] as IntestatarioFattura[],
  metodoPagamento: 'sal' as 'sal' | 'acconto',
});

// ─── COMPONENTE ──────────────────────────────────────────────────

const ProjectManager: React.FC<ProjectManagerProps> = ({
  projects, onSave, onUpdate, onDelete, isAuthorized = false
}) => {
  const [mode, setMode] = useState<'list' | 'new' | 'edit'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [form, setForm] = useState(emptyForm());

  const setField = (key: string, val: any) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // ── Intestatari ──────────────────────────────────────────────

  const addIntestatario = () => {
    setField('intestatari', [
      ...form.intestatari,
      { id: uuidv4(), nome: '', tipo: 'persona_fisica' as const }
    ]);
  };

  const updateIntestatario = (id: string, field: keyof IntestatarioFattura, val: any) => {
    setField('intestatari', form.intestatari.map(i =>
      i.id === id ? { ...i, [field]: val } : i
    ));
  };

  const removeIntestatario = (id: string) => {
    setField('intestatari', form.intestatari.filter(i => i.id !== id));
  };

  // ── Salvataggio ──────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.client) return;

    const jobType = form.jobType === 'Altra tipologia'
      ? form.jobTypeCustom
      : form.jobType;

    if (mode === 'edit' && editingId) {
      const existing = projects.find(p => p.id === editingId);
      if (!existing) return;
      onUpdate({
        ...existing,
        name: form.name,
        client: form.client,
        location: form.location,
        jobType,
        startDate: form.startDate,
        intestatari: form.intestatari,
        metodoPagamento: form.metodoPagamento,
      });
    } else {
      onSave({
        name: form.name,
        client: form.client,
        location: form.location,
        jobType,
        startDate: form.startDate,
        status: 'ACTIVE',
        intestatari: form.intestatari,
        metodoPagamento: form.metodoPagamento,
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setForm(emptyForm());
    setMode('list');
    setEditingId(null);
  };

  const handleEdit = (project: Project) => {
    const isPreset = TIPOLOGIE_PRESET.includes(project.jobType);
    setForm({
      name: project.name,
      client: project.client,
      location: project.location || '',
      jobType: isPreset ? project.jobType : 'Altra tipologia',
      jobTypeCustom: isPreset ? '' : project.jobType,
      startDate: project.startDate,
      intestatari: project.intestatari || [],
      metodoPagamento: project.metodoPagamento || 'sal',
    });
    setEditingId(project.id);
    setMode('edit');
  };

  const handleNew = () => {
    setForm(emptyForm());
    setMode('new');
  };

  // ── Render form ──────────────────────────────────────────────

  const renderForm = () => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-slate-700">
          {mode === 'edit' ? 'Modifica Commessa' : 'Nuova Commessa'}
        </h3>
        <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Nome */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nome Cantiere *</label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input required value={form.name} onChange={e => setField('name', e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none"
                placeholder="es. Condominio Rossi — Via Roma 12" />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Cliente / Committente *</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input required value={form.client} onChange={e => setField('client', e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none"
                placeholder="es. Mario Rossi" />
            </div>
          </div>

          {/* Luogo */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Luogo</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input value={form.location} onChange={e => setField('location', e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none"
                placeholder="es. Treviso, Via Roma 1" />
            </div>
          </div>

          {/* Tipologia - SELECT preimpostato */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tipologia Cantiere</label>
            <div className="relative">
              <HardHat className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <select value={form.jobType} onChange={e => setField('jobType', e.target.value)}
                className="w-full pl-10 pr-8 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none appearance-none bg-white">
                <option value="">Seleziona tipologia...</option>
                {TIPOLOGIE_PRESET.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>

          {/* Campo custom se "Altra tipologia" */}
          {form.jobType === 'Altra tipologia' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Specificare tipologia</label>
              <input value={form.jobTypeCustom} onChange={e => setField('jobTypeCustom', e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none"
                placeholder="es. Opere di Urbanizzazione" />
            </div>
          )}

          {/* Data inizio */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Data Inizio Lavori</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input type="date" value={form.startDate} onChange={e => setField('startDate', e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none" />
            </div>
          </div>

          {/* Metodo Pagamento */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Metodo Pagamento Concordato</label>
            <div className="relative">
              <Wallet className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <select value={form.metodoPagamento} onChange={e => setField('metodoPagamento', e.target.value)}
                className="w-full pl-10 pr-8 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-slate-500 outline-none appearance-none bg-white">
                <option value="sal">SAL (Stato Avanzamento Lavori)</option>
                <option value="acconto">Acconto (Anticipi su Commessa)</option>
              </select>
              <ChevronDown className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" size={16} />
            </div>
          </div>
        </div>

        {/* ── INTESTATARI FATTURE ─────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5">
              <UserCheck size={14} className="text-slate-400" />
              Intestatari Fatture
            </label>
            <button type="button" onClick={addIntestatario}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
              <Plus size={13} /> Aggiungi
            </button>
          </div>

          {form.intestatari.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">
              Nessun intestatario specificato — le fatture vanno al cliente principale
            </p>
          ) : (
            <div className="space-y-2">
              {form.intestatari.map(int => (
                <div key={int.id} className="flex items-center gap-2">
                  {/* Nome */}
                  <input value={int.nome} onChange={e => updateIntestatario(int.id, 'nome', e.target.value)}
                    placeholder="Nome / Ragione Sociale"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-slate-400" />
                  {/* Tipo */}
                  <select value={int.tipo} onChange={e => updateIntestatario(int.id, 'tipo', e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none bg-white focus:ring-2 focus:ring-slate-400">
                    <option value="persona_fisica">Persona Fisica</option>
                    <option value="ditta">Ditta / Società</option>
                  </select>
                  {/* Icona tipo */}
                  {int.tipo === 'persona_fisica'
                    ? <User size={14} className="text-blue-400 shrink-0" />
                    : <Building size={14} className="text-amber-500 shrink-0" />
                  }
                  {/* Rimuovi */}
                  <button type="button" onClick={() => removeIntestatario(int.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button type="submit"
          className="w-full bg-slate-900 text-white py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
          <Save size={18} />
          {mode === 'edit' ? 'Salva Modifiche' : 'Crea Commessa'}
        </button>
      </form>
    </div>
  );

  // ── Render lista ─────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Gestione Commesse</h2>
        {mode === 'list' && (
          isAuthorized ? (
            <button onClick={handleNew}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors flex items-center gap-2">
              <Plus size={16} /> Nuova Commessa
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-slate-600 text-sm animate-pulse">
              <Shield size={16} />
              <span>Sblocca il lucchetto per aggiungere commesse</span>
            </div>
          )
        )}
      </div>

      {(mode === 'new' || mode === 'edit') && renderForm()}

      {projects.length === 0 && mode === 'list' ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
          <Briefcase size={48} className="mx-auto mb-4 opacity-20" />
          <p>Nessuna commessa registrata.</p>
          <p className="text-sm">Inizia aggiungendo il tuo primo cantiere.</p>
        </div>
      ) : mode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(project => (
            <div key={project.id}
              className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative group">

              {/* Tasti azione */}
              {isAuthorized && (
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => handleEdit(project)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                    title="Modifica">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => onDelete(project.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 transition-colors"
                    title="Elimina">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 pr-16">{project.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                    Attiva
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ml-1.5 ${project.metodoPagamento === 'acconto' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                    {project.metodoPagamento === 'acconto' ? 'Metodo: Acconto' : 'Metodo: SAL'}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-slate-400 shrink-0" />
                  <span className="truncate"><span className="font-medium text-slate-900">Cliente:</span> {project.client}</span>
                </div>
                {project.location && project.location !== '-' && (
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{project.location}</span>
                  </div>
                )}
                {project.jobType && (
                  <div className="flex items-center gap-2">
                    <HardHat size={14} className="text-slate-400 shrink-0" />
                    <span className="truncate">{project.jobType}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-slate-400 shrink-0" />
                  <span>Inizio: {DATE_FORMATTER.format(new Date(project.startDate))}</span>
                </div>

                {/* Intestatari */}
                {project.intestatari && project.intestatari.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                      Intestatari Fatture
                    </p>
                    <div className="space-y-1">
                      {project.intestatari.map(int => (
                        <div key={int.id} className="flex items-center gap-1.5">
                          {int.tipo === 'persona_fisica'
                            ? <User size={11} className="text-blue-400 shrink-0" />
                            : <Building size={11} className="text-amber-500 shrink-0" />}
                          <span className="text-xs text-slate-600">{int.nome}</span>
                          <span className="text-[9px] text-slate-400">
                            ({int.tipo === 'persona_fisica' ? 'Persona Fisica' : 'Ditta'})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectManager;
