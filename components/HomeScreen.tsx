import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Target,
  Landmark,
  PieChart,
  HardHat,
  BookOpen,
  Settings,
  LayoutDashboard,
  CalendarClock,
  LucideIcon,
  Receipt,
} from 'lucide-react';
import { AppView } from '../types';

interface HomeScreenProps {
  onNavigate: (view: AppView) => void;
}

interface Module {
  id: AppView;
  label: string;
  sublabel: string;          // descrizione breve sotto il label
  icon: LucideIcon;
  color: string;             // classe Tailwind bg del cerchio
  iconColor: string;         // classe Tailwind text dell'icona
  active: boolean;           // true = navigabile, false = placeholder
  badge?: string;            // testo badge opzionale (es. "In arrivo")
}

const modules: Module[] = [
  // ── MODULO 1 — DASHBOARD (ATTIVO) ────────────────────────────
  {
    id: AppView.DASHBOARD,
    label: 'Dashboard',
    sublabel: 'Riepilogo e andamento',
    icon: LayoutDashboard,
    color: 'bg-blue-100',
    iconColor: 'text-blue-600',
    active: true,
  },
  // ── MODULO 2 — CASH FLOW (ATTIVO) ────────────────────────────
  {
    id: AppView.TIMELINE,
    label: 'Cash Flow',
    sublabel: 'Timeline entrate e uscite',
    icon: CalendarClock,
    color: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    active: true,
  },
  // ── MODULO 3 — CONTO ECONOMICO (ATTIVO) ──────────────────────
  {
    id: AppView.CE_RICLASSIFICATO,
    label: 'Conto Economico',
    sublabel: 'Ricavi, margini e EBITDA',
    icon: BarChart3,
    color: 'bg-amber-100',
    iconColor: 'text-amber-600',
    active: true,
  },
  // ── MODULO 4 — STATO PATRIMONIALE (ATTIVO) ───────────────────
  {
    id: AppView.STATO_PATRIMONIALE,
    label: 'Stato Patrimoniale',
    sublabel: 'Patrimonio netto e debiti',
    icon: Building2,
    color: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    active: true,
  },
  // ── MODULO 5 — BUDGET (ATTIVO) ───────────────────────────────
  {
    id: AppView.BUDGET,
    label: 'Budget',
    sublabel: 'Previsionale vs consuntivo',
    icon: Target,
    color: 'bg-purple-100',
    iconColor: 'text-purple-600',
    active: true,
  },
  // ── MODULO 6 — RATING BANCHE (ATTIVO) ────────────────────────
  {
    id: AppView.RATING_BANCHE,
    label: 'Rating Banche',
    sublabel: 'Posizione bancaria e CR',
    icon: Landmark,
    color: 'bg-rose-100',
    iconColor: 'text-rose-600',
    active: true,
  },
  // ── MODULO 7 — ANALISI & INDICI (ATTIVO) ─────────────────────
  {
    id: AppView.ANALISI_INDICI,
    label: 'Analisi & Indici',
    sublabel: 'Overhead, preventivi, ricarico',
    icon: PieChart,
    color: 'bg-cyan-100',
    iconColor: 'text-cyan-600',
    active: true,
  },
  // ── MODULO 8 — COMMESSE (ATTIVO — già esistente) ─────────────
  {
    id: AppView.PROJECTS,
    label: 'Commesse',
    sublabel: 'Gestione cantieri e appalti',
    icon: HardHat,
    color: 'bg-orange-100',
    iconColor: 'text-orange-600',
    active: true,
  },
  // ── MODULO 9 — POSIZIONE IVA (ATTIVO) ────────────────────────
  {
    id: AppView.IVA_POSIZIONE,
    label: 'Posizione IVA',
    sublabel: 'Calcolo debito/credito IVA',
    icon: Receipt,
    color: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    active: true,
  },
  // ── MODULO 10 — GUIDA KPI (ATTIVO) ────────────────────────────
  {
    id: AppView.GUIDA_KPI,
    label: 'Guida KPI',
    sublabel: '8 numeri sacri — Metodo Gasparotto',
    icon: BookOpen,
    color: 'bg-lime-100',
    iconColor: 'text-lime-600',
    active: true,
  },
  // ── MODULO 11 — IMPOSTAZIONI (ATTIVO — già esistente) ─────────
  {
    id: AppView.SETTINGS,
    label: 'Configurazione',
    sublabel: 'Categorie, operatori, backup',
    icon: Settings,
    color: 'bg-teal-100',
    iconColor: 'text-teal-600',
    active: true,
  },
];

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate }) => {
  const handleModuleClick = (module: Module) => {
    if (!module.active) return;
    onNavigate(module.id);
  };

  return (
    <div className="animate-in fade-in duration-500">
      {/* ── INTESTAZIONE ── */}
      <div className="text-center mb-10 mt-2">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
          Benvenuto in Gestione Finanziaria
        </h1>
        <p className="text-slate-500 mt-2 text-base font-medium">
          Gruppo Visentin SRL — Seleziona un modulo per iniziare
        </p>
      </div>

      {/* ── GRIGLIA MODULI ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
        {modules.map((module) => (
          <button
            key={module.id}
            onClick={() => handleModuleClick(module)}
            disabled={!module.active}
            className={`
              relative flex flex-col items-center gap-3 p-6 rounded-2xl
              bg-white border border-slate-100 shadow-sm
              transition-all duration-200
              ${module.active
                ? 'hover:shadow-md hover:scale-105 hover:border-slate-200 cursor-pointer'
                : 'opacity-60 cursor-not-allowed'
              }
            `}
          >
            {/* Badge "In arrivo" */}
            {module.badge && (
              <span className="absolute top-3 right-3 text-[10px] font-bold
                               bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {module.badge}
              </span>
            )}

            {/* Cerchio con icona */}
            <div className={`
              w-20 h-20 rounded-full flex items-center justify-center
              ${module.color}
              transition-transform duration-200
            `}>
              <module.icon size={32} className={module.iconColor} strokeWidth={1.5} />
            </div>

            {/* Label */}
            <div className="text-center">
              <p className="font-bold text-slate-800 text-sm leading-tight">
                {module.label}
              </p>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-tight">
                {module.sublabel}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* ── FOOTER INFO ── */}
      <div className="mt-10 text-center">
        <p className="text-xs text-slate-400">
          I moduli "In arrivo" verranno attivati progressivamente
          con l'integrazione del controllo di gestione completo
        </p>
      </div>
    </div>
  );
};

export default HomeScreen;
