import React, { useState, useEffect } from 'react';
import {
  X, HelpCircle, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, BookOpen, ArrowRight
} from 'lucide-react';
import { HELP_CONTENT, SezioneHelp } from '../content/helpContent';
import { AppView } from '../types';

interface HelpPanelProps {
  isOpen: boolean;
  currentView: AppView;
  onClose: () => void;
  onGoToManuale?: (section?: string, tab?: 'manuale' | 'glossario') => void;
}

const HelpPanel: React.FC<HelpPanelProps> = ({
  isOpen,
  currentView,
  onClose,
  onGoToManuale,
}) => {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [expandedErrore, setExpandedErrore] = useState<number | null>(null);
  const [expandedEsempio, setExpandedEsempio] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<'guida' | 'errori' | 'esempi' | 'faq'>('guida');

  const help: SezioneHelp | undefined = HELP_CONTENT[currentView];

  // Chiudi con Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, isOpen]);

  if (!isOpen) return null;

  // Conta gli errori comuni e gli esempi per i badge
  const numErrori = help?.erroriComuni?.length || 0;
  const numEsempi = help?.esempiVisivi?.length || 0;
  const numFaq = help?.faqRapide?.length || 0;

  if (!help) {
    return (
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-black text-slate-900">Guida</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl">
            <X size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <HelpCircle size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              Nessuna guida disponibile per questa sezione.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Overlay semi-trasparente */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={onClose}
      />

      {/* Pannello laterale */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 bg-slate-50">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Guida contestuale
            </p>
            <h2 className="text-lg font-black text-slate-900 leading-tight">
              {help.titolo}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{help.sottotitolo}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-xl transition-colors flex-shrink-0 ml-2"
          >
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-white px-2 pt-2 gap-1 overflow-x-auto scrollbar-hide">
          {[
            { id: 'guida', label: 'Guida', count: 0 },
            { id: 'errori', label: 'Errori', count: numErrori },
            { id: 'esempi', label: 'Esempi', count: numEsempi },
            { id: 'faq', label: 'FAQ', count: numFaq },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeSection === tab.id
                  ? 'bg-slate-100 text-slate-900 border-b-2 border-slate-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${
                  tab.id === 'errori'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenuto scrollabile */}
        <div className="flex-1 overflow-y-auto">

          {/* TAB: GUIDA */}
          {activeSection === 'guida' && (
            <div className="p-5 space-y-5">

              {/* Descrizione */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <p className="text-xs text-slate-800 leading-relaxed">
                  {help.descrizione}
                </p>
              </div>

              {/* A cosa serve */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  A Cosa Serve
                </p>
                <div className="space-y-2">
                  {help.aQuiServe.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <CheckCircle2 size={14} className="text-slate-900 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Come si compila */}
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Come si Compila
                </p>
                <div className="space-y-2">
                  {help.comeSiCompila.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-slate-600 leading-relaxed">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Termini collegati */}
              {help.terminiCollegati.length > 0 && (
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Termini Chiave
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {help.terminiCollegati.map((id, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          const event = new CustomEvent('openTermModal', { detail: id });
                          window.dispatchEvent(event);
                        }}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-slate-600 text-[10px] font-bold rounded-full transition-colors"
                      >
                        {id.replace(/_/g, ' ')} ⓘ
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: ERRORI */}
          {activeSection === 'errori' && (
            <div className="p-5 space-y-3">
              {help.erroriComuni.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Nessun errore comune documentato</p>
                </div>
              ) : (
                help.erroriComuni.map((errore, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => setExpandedErrore(expandedErrore === i ? null : i)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-start gap-2.5 flex-1">
                        <AlertCircle size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-slate-700 leading-tight">{errore.titolo}</p>
                      </div>
                      {expandedErrore === i
                        ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                        : <ChevronDown size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                      }
                    </button>

                    {expandedErrore === i && (
                      <div className="px-4 pb-4 space-y-3 border-t border-slate-100">
                        <div className="mt-3 bg-slate-100 rounded-xl p-3 border border-slate-200">
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">✗ Sbagliato</p>
                          <p className="text-xs text-slate-700 italic">"{errore.sbagliato}"</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                          <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-1">✓ Corretto</p>
                          <p className="text-xs text-slate-900">"{errore.corretto}"</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Perché</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{errore.perche}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: ESEMPI */}
          {activeSection === 'esempi' && (
            <div className="p-5 space-y-3">
              {(!help.esempiVisivi || help.esempiVisivi.length === 0) ? (
                <div className="text-center py-8">
                  <BookOpen size={28} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Nessun esempio disponibile</p>
                </div>
              ) : (
                help.esempiVisivi.map((esempio, i) => (
                  <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => setExpandedEsempio(expandedEsempio === i ? null : i)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-start gap-2.5 flex-1">
                        <BookOpen size={14} className="text-slate-900 flex-shrink-0 mt-0.5" />
                        <p className="text-xs font-bold text-slate-700 leading-tight">{esempio.titolo}</p>
                      </div>
                      {expandedEsempio === i
                        ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                        : <ChevronDown size={14} className="text-slate-400 flex-shrink-0 ml-2" />
                      }
                    </button>

                    {expandedEsempio === i && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <p className="text-xs text-slate-500 mt-3 mb-3 leading-relaxed">
                          {esempio.descrizione}
                        </p>
                        <div className="space-y-2">
                          {esempio.campi.map((campo, j) => (
                            <div key={j} className="flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                              <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  {campo.label}
                                </p>
                                {campo.nota && (
                                  <p className="text-[10px] text-slate-400 mt-0.5 italic">{campo.nota}</p>
                                )}
                              </div>
                              <p className="text-xs font-black text-slate-900 text-right flex-shrink-0">
                                {campo.valore}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: FAQ */}
          {activeSection === 'faq' && (
            <div className="p-5 space-y-2">
              {help.faqRapide.map((faq, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left gap-3"
                  >
                    <p className="text-xs font-bold text-slate-700 leading-snug flex-1">
                      {faq.domanda}
                    </p>
                    {expandedFaq === i
                      ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
                      : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                    }
                  </button>
                  {expandedFaq === i && (
                    <div className="px-4 pb-4 border-t border-slate-100">
                      <p className="text-xs text-slate-600 leading-relaxed mt-3">
                        {faq.risposta}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer — link al manuale completo */}
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <button
            onClick={() => {
              onClose();
              onGoToManuale?.();
            }}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 hover:text-slate-900 text-xs font-black rounded-2xl transition-all"
          >
            <BookOpen size={14} />
            Vai al Manuale Completo
            <ArrowRight size={12} />
          </button>
        </div>

      </div>
    </>
  );
};

// Bottone standard da aggiungere negli header delle view
export const HelpButton: React.FC<{
  onClick: () => void;
  className?: string;
}> = ({ onClick, className = '' }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 text-slate-500 text-xs font-bold rounded-xl transition-all ${className}`}
    aria-label="Apri guida"
  >
    <HelpCircle size={14} />
    <span className="hidden sm:inline">Guida</span>
  </button>
);

export default HelpPanel;
