import React, { useEffect } from 'react';
import { X, BookOpen, Calculator, TrendingUp, AlertCircle, Link2 } from 'lucide-react';
import { getTermine, GLOSSARIO, CATEGORIE_GLOSSARIO } from '../content/glossary';

interface TermModalProps {
  termId: string;
  onClose: () => void;
}

const formatEuro = (s: string) => s;

const TermModal: React.FC<TermModalProps> = ({ termId, onClose }) => {
  const termine = getTermine(termId);

  // Chiudi con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!termine) return null;

  const terminiCollegati = (termine.connessoCon || [])
    .map(id => getTermine(id))
    .filter(Boolean);

  const categoriaLabel = CATEGORIE_GLOSSARIO[termine.categoria];

  const categoriaColor: Record<string, string> = {
    ce:       'bg-slate-100 text-slate-700',
    overhead: 'bg-zinc-100 text-zinc-700',
    orario:   'bg-slate-200 text-slate-800',
    rating:   'bg-slate-300 text-slate-900',
    iva:      'bg-slate-100 text-slate-700',
    fiscale:  'bg-slate-200 text-slate-800',
    concetti: 'bg-slate-100 text-slate-700',
  };

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-8 pt-8 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${categoriaColor[termine.categoria]}`}>
                  {categoriaLabel}
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900">{termine.nome}</h2>
              <p className="text-xs text-slate-400 mt-1 italic">{termine.origine}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors flex-shrink-0"
            >
              <X size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Definizione */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={14} className="text-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Definizione</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {termine.definizione}
            </p>
          </div>

          {/* Formula */}
          {(termine.formulaTestuale || termine.formulaPassaggi) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calculator size={14} className="text-slate-500" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Come si Calcola
                </span>
              </div>

              {/* Formula testuale */}
              {termine.formulaTestuale && (
                <div className="bg-slate-900 rounded-2xl px-5 py-4 mb-3">
                  <p className="font-mono text-sm text-slate-300 leading-relaxed">
                    {termine.formulaTestuale}
                  </p>
                </div>
              )}

              {/* Passaggi */}
              {termine.formulaPassaggi && termine.formulaPassaggi.length > 0 && (
                <div className="space-y-2">
                  {termine.formulaPassaggi.map((p, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-slate-600">{p.label}</p>
                        <p className="font-mono text-[11px] text-slate-600 mt-0.5">{p.formula}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Esempio numerico */}
          {termine.esempioNumerico && (
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-slate-500" />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                  Esempio Numerico
                </span>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Dati</p>
                  <p className="text-xs text-slate-600">{termine.esempioNumerico.dati}</p>
                </div>
                <div className="bg-white rounded-xl px-4 py-2 border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Calcolo</p>
                  <p className="font-mono text-xs text-slate-700">{termine.esempioNumerico.calcolo}</p>
                </div>
                <div className="bg-slate-100 rounded-xl px-4 py-2 border border-slate-200">
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Risultato</p>
                  <p className="text-sm font-black text-slate-800">{termine.esempioNumerico.risultato}</p>
                </div>
              </div>
            </div>
          )}

          {/* Soglie edilizia */}
          {termine.sogliaEdilizia && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-slate-400" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Soglie di Riferimento — Edilizia
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {termine.sogliaEdilizia.ottimo && (
                  <div className="bg-slate-100 rounded-xl px-4 py-3 border border-slate-200">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Ottimo</p>
                    <p className="text-sm font-black text-slate-800">{termine.sogliaEdilizia.ottimo}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.buono && (
                  <div className="bg-slate-100 rounded-xl px-4 py-3 border border-slate-200">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5">Buono</p>
                    <p className="text-sm font-black text-slate-800">{termine.sogliaEdilizia.buono}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.attenzione && (
                  <div className="bg-slate-200 rounded-xl px-4 py-3 border border-slate-300">
                    <p className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-0.5">Attenzione</p>
                    <p className="text-sm font-black text-slate-900">{termine.sogliaEdilizia.attenzione}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.critico && (
                  <div className="bg-slate-300 rounded-xl px-4 py-3 border border-slate-400">
                    <p className="text-[9px] font-black text-slate-800 uppercase tracking-widest mb-0.5">Critico</p>
                    <p className="text-sm font-black text-slate-950">{termine.sogliaEdilizia.critico}</p>
                  </div>
                )}
              </div>
              {termine.sogliaEdilizia.nota && (
                <p className="text-[11px] text-slate-500 mt-2 italic">
                  {termine.sogliaEdilizia.nota}
                </p>
              )}
            </div>
          )}

          {/* Dove appare nell'app */}
          {termine.doveAppareNellApp.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Dove Appare nell'App
              </p>
              <div className="flex flex-wrap gap-2">
                {termine.doveAppareNellApp.map((luogo, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-full"
                  >
                    {luogo}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Errore comune */}
          {termine.erroreComune && (
            <div className="flex items-start gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <AlertCircle size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">
                  Errore Comune
                </p>
                <p className="text-xs text-slate-800 leading-relaxed">
                  {termine.erroreComune}
                </p>
              </div>
            </div>
          )}

          {/* Termini collegati */}
          {terminiCollegati.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={14} className="text-slate-400" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Vedi Anche
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {terminiCollegati.map((t) => t && (
                  <button
                    key={t.id}
                    onClick={() => {
                      onClose();
                      // Riapertura con il nuovo termine dopo un tick
                      setTimeout(() => {
                        const event = new CustomEvent('openTermModal', { detail: t.id });
                        window.dispatchEvent(event);
                      }, 100);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    {t.nome} →
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-8 pb-8">
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-black rounded-2xl transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

// Hook globale per aprire il modal da qualsiasi componente
export const useTermModal = () => {
  const [activeTermId, setActiveTermId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      setActiveTermId((e as CustomEvent).detail);
    };
    window.addEventListener('openTermModal', handler);
    return () => window.removeEventListener('openTermModal', handler);
  }, []);

  return {
    activeTermId,
    openTerm: (id: string) => setActiveTermId(id),
    closeTerm: () => setActiveTermId(null),
  };
};

export default TermModal;
