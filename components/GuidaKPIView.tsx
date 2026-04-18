import React, { useState, useMemo } from 'react';
import {
  BookOpen, Search, ChevronDown, ChevronUp,
  Calculator, TrendingUp, AlertCircle, Link2,
  HardHat, Building2, FileText, BarChart2,
  ShieldCheck, Landmark, Receipt, Target,
  Clock, Sparkles, Info, CheckCircle2,
  ArrowRight, X
} from 'lucide-react';
import {
  GLOSSARIO,
  CATEGORIE_GLOSSARIO,
  getTerminiPerCategoria,
  TermineGlossario
} from '../content/glossary';
import { HELP_CONTENT } from '../content/helpContent';
import { exportGuidaPDF } from '../utils/guidaPdfExport';
import PDFExportButton from './PDFExportButton';

// ─── TIPI ────────────────────────────────────────────────────────

type MainTab = 'manuale' | 'glossario';
type CategoriaGlossario = TermineGlossario['categoria'];

// ─── COLORI CATEGORIA ────────────────────────────────────────────

const CATEGORIA_COLORS: Record<CategoriaGlossario, {
  bg: string; text: string; border: string; dot: string;
}> = {
  ce:       { bg: 'bg-blue-50',     text: 'text-blue-700',     border: 'border-blue-200',     dot: 'bg-blue-500'     },
  overhead: { bg: 'bg-indigo-50',   text: 'text-indigo-700',   border: 'border-indigo-200',   dot: 'bg-indigo-500'   },
  orario:   { bg: 'bg-rose-50',     text: 'text-rose-700',     border: 'border-rose-200',     dot: 'bg-rose-500'     },
  rating:   { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200',  dot: 'bg-emerald-500'  },
  iva:      { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',    dot: 'bg-amber-500'    },
  fiscale:  { bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200',   dot: 'bg-violet-500'   },
  concetti: { bg: 'bg-sky-50',      text: 'text-sky-700',      border: 'border-sky-200',      dot: 'bg-sky-500'      },
};

// ─── ICONE SEZIONI MANUALE ───────────────────────────────────────

const SEZIONE_STYLE: Record<string, { icon: React.ReactNode; color: string }> = {
  DASHBOARD:          { icon: <BarChart2 size={20} />,    color: 'text-blue-600 bg-blue-50' },
  TIMELINE:           { icon: <Landmark size={20} />,     color: 'text-emerald-600 bg-emerald-50' },
  CE_RICLASSIFICATO:  { icon: <TrendingUp size={20} />,   color: 'text-indigo-600 bg-indigo-50' },
  ANALISI_INDICI:     { icon: <Calculator size={20} />,    color: 'text-violet-600 bg-violet-50' },
  RATING_BANCHE:      { icon: <ShieldCheck size={20} />,   color: 'text-amber-600 bg-amber-50' },
  STATO_PATRIMONIALE: { icon: <Building2 size={20} />,    color: 'text-sky-600 bg-sky-50' },
  BUDGET:             { icon: <Target size={20} />,       color: 'text-rose-600 bg-rose-50' },
  IVA_POSIZIONE:      { icon: <Receipt size={20} />,      color: 'text-orange-600 bg-orange-50' },
};

// ─── HELPER HIGHLIGHT ──────────────────────────────────────────

const HighlightText: React.FC<{ text: string; color?: string }> = ({ text, color = 'text-indigo-600' }) => {
  if (!text) return null;
  // Regex per numeri (inclusi decimali con virgola/punto) e simboli matematici/valuta
  const parts = text.split(/(\d+(?:[.,]\d+)?|[€%+\-*/=<>])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\d+(?:[.,]\d+)?$/.test(part)) {
          return <span key={i} className={`${color} font-black`}>{part}</span>;
        }
        if (/^[€%+\-*/=<>]$/.test(part)) {
          return <span key={i} className={`${color} font-black`}>{part}</span>;
        }
        return part;
      })}
    </>
  );
};

// ─── COMPONENTE SCHEDA TERMINE GLOSSARIO ─────────────────────────

const TermineCard: React.FC<{
  termine: TermineGlossario;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenConnesso: (id: string) => void;
}> = ({ termine, isExpanded, onToggle, onOpenConnesso }) => {
  const colors = CATEGORIA_COLORS[termine.categoria];

  return (
    <div
      id={`termine-${termine.id}`}
      className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 ${
        isExpanded ? 'border-slate-400 shadow-md' : 'border-slate-200 shadow-sm hover:border-slate-300'
      }`}
    >
      {/* Header card termine */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-900">{termine.nome}</h3>
              <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full ${colors.bg} ${colors.text}`}>
                {CATEGORIE_GLOSSARIO[termine.categoria]}
              </span>
            </div>
            {!isExpanded && (
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {termine.definizione.slice(0, 80)}...
              </p>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 ml-3">
          {isExpanded
            ? <ChevronUp size={16} className="text-slate-400" />
            : <ChevronDown size={16} className="text-slate-400" />
          }
        </div>
      </button>

      {/* Contenuto espanso */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-5 border-t border-slate-100">

          {/* Origine */}
          <div className="pt-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Origine del termine
            </p>
            <p className="text-xs text-slate-500 italic">{termine.origine}</p>
          </div>

          {/* Definizione */}
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Definizione
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              <HighlightText text={termine.definizione} color={colors.text.replace('700', '600')} />
            </p>
          </div>

          {/* Formula */}
          {(termine.formulaTestuale || termine.formulaPassaggi) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calculator size={12} className="text-blue-600" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                  Come si Calcola
                </p>
              </div>
              {termine.formulaTestuale && (
                <div className="bg-slate-900 rounded-xl px-4 py-3 mb-2">
                  <p className="font-mono text-xs text-slate-300 leading-relaxed">
                    <HighlightText text={termine.formulaTestuale} color="text-blue-400" />
                  </p>
                </div>
              )}
              {termine.formulaPassaggi && termine.formulaPassaggi.length > 0 && (
                <div className="space-y-2 mt-2">
                  {termine.formulaPassaggi.map((p, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[10px] font-bold text-slate-600">{p.label}</p>
                        <p className="font-mono text-[10px] text-indigo-600 mt-0.5">{p.formula}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Esempio numerico */}
          {termine.esempioNumerico && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={12} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  Esempio Numerico
                </p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Dati</p>
                  <p className="text-xs text-slate-600">{termine.esempioNumerico.dati}</p>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Calcolo</p>
                  <p className="font-mono text-xs text-slate-700">
                    <HighlightText text={termine.esempioNumerico.calcolo} color="text-emerald-600" />
                  </p>
                </div>
                <div className="bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
                  <p className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-0.5">Risultato</p>
                  <p className="text-xs font-black text-slate-900">{termine.esempioNumerico.risultato}</p>
                </div>
              </div>
            </div>
          )}

          {/* Soglie edilizia */}
          {termine.sogliaEdilizia && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Soglie di Riferimento — Edilizia
              </p>
              <div className="grid grid-cols-2 gap-2">
                {termine.sogliaEdilizia.ottimo && (
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-600 uppercase mb-0.5">Ottimo</p>
                    <p className="text-sm font-black text-emerald-900">{termine.sogliaEdilizia.ottimo}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.buono && (
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-[9px] font-black text-blue-600 uppercase mb-0.5">Buono</p>
                    <p className="text-sm font-black text-blue-900">{termine.sogliaEdilizia.buono}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.attenzione && (
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-600 uppercase mb-0.5">Attenzione</p>
                    <p className="text-sm font-black text-amber-900">{termine.sogliaEdilizia.attenzione}</p>
                  </div>
                )}
                {termine.sogliaEdilizia.critico && (
                  <div className="bg-rose-50 rounded-xl p-3 border border-rose-100">
                    <p className="text-[9px] font-black text-rose-600 uppercase mb-0.5">Critico</p>
                    <p className="text-sm font-black text-rose-900">{termine.sogliaEdilizia.critico}</p>
                  </div>
                )}
              </div>
              {termine.sogliaEdilizia.nota && (
                <p className="text-[10px] text-slate-500 mt-2 italic">
                  {termine.sogliaEdilizia.nota}
                </p>
              )}
            </div>
          )}

          {/* Dove appare */}
          {termine.doveAppareNellApp.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Dove Appare nell'App
              </p>
              <div className="flex flex-wrap gap-1.5">
                {termine.doveAppareNellApp.map((luogo, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-full">
                    {luogo}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Errori comuni */}
          {termine.erroreComune && (
            <div className="flex items-start gap-2.5 bg-slate-50 rounded-xl p-3 border border-slate-200">
              <AlertCircle size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">
                  Errore Comune
                </p>
                <p className="text-xs text-slate-800 leading-relaxed">{termine.erroreComune}</p>
              </div>
            </div>
          )}

          {/* Termini collegati */}
          {(termine.connessoCon || []).length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Link2 size={11} className="text-slate-400" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Vedi Anche
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(termine.connessoCon || []).map((id, i) => {
                  const t = GLOSSARIO.find(g => g.id === id);
                  return t ? (
                    <button
                      key={i}
                      onClick={() => onOpenConnesso(id)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full transition-colors"
                    >
                      {t.nome} →
                    </button>
                  ) : null;
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

// ─── COMPONENTE SEZIONE MANUALE ──────────────────────────────────

const SezioneManuale: React.FC<{
  sectionId: string;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ sectionId, isExpanded, onToggle }) => {
  const help = HELP_CONTENT[sectionId];
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [expandedErrore, setExpandedErrore] = useState<number | null>(null);
  const [expandedEsempio, setExpandedEsempio] = useState<number | null>(null);

  if (!help) return null;

  const style = SEZIONE_STYLE[sectionId] || { icon: <BookOpen size={20} />, color: 'text-slate-500 bg-slate-100' };

  return (
    <div
      id={`sezione-${sectionId}`}
      className={`bg-white border rounded-3xl overflow-hidden transition-all duration-200 ${
        isExpanded ? 'border-slate-300 shadow-lg' : 'border-slate-200 shadow-sm hover:border-slate-300'
      }`}
    >
      {/* Header sezione */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
            isExpanded ? 'bg-slate-900 text-white' : style.color
          }`}>
            {style.icon}
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">{help.titolo}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{help.sottotitolo}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {help.erroriComuni.length > 0 && (
            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-black rounded-full">
              {help.erroriComuni.length} errori
            </span>
          )}
          {isExpanded
            ? <ChevronUp size={18} className="text-slate-400 flex-shrink-0" />
            : <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
          }
        </div>
      </button>

      {/* Contenuto espanso */}
      {isExpanded && (
        <div className="border-t border-slate-100">

          {/* Descrizione */}
          <div className="px-6 py-5 bg-slate-50">
            <p className="text-sm text-slate-700 leading-relaxed">{help.descrizione}</p>
          </div>

          <div className="px-6 py-5 space-y-6">

            {/* A cosa serve */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  A Cosa Serve
                </p>
              </div>
              <div className="space-y-2">
                {help.aQuiServe.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
                    <p className="text-sm text-slate-600 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Come si compila */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} className="text-blue-600" />
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                  Come si Compila
                </p>
              </div>
              <div className="space-y-3">
                {help.comeSiCompila.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      {i + 1}
                    </span>
                    <p className="text-sm text-slate-600 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Errori comuni */}
            {help.erroriComuni.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={14} className="text-rose-600" />
                  <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">
                    Errori Comuni
                  </p>
                </div>
                <div className="space-y-2">
                  {help.erroriComuni.map((errore, i) => (
                    <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedErrore(expandedErrore === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left bg-white hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 flex-1">
                          <AlertCircle size={13} className="text-rose-500 flex-shrink-0" />
                          <p className="text-xs font-bold text-slate-700">{errore.titolo}</p>
                        </div>
                        {expandedErrore === i
                          ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                          : <ChevronDown size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                        }
                      </button>
                      {expandedErrore === i && (
                        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 bg-white">
                          <div className="mt-3 bg-slate-50 rounded-xl p-3">
                            <p className="text-[9px] font-black text-rose-400 uppercase mb-1">✗ Sbagliato</p>
                            <p className="text-xs text-slate-600 italic">"{errore.sbagliato}"</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-3">
                            <p className="text-[9px] font-black text-emerald-700 uppercase mb-1">✓ Corretto</p>
                            <p className="text-xs text-slate-800">"{errore.corretto}"</p>
                          </div>
                          <div className="bg-slate-50 rounded-xl p-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Perché</p>
                            <p className="text-xs text-slate-600 leading-relaxed">{errore.perche}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Esempi visivi */}
            {help.esempiVisivi && help.esempiVisivi.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={14} className="text-indigo-600" />
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                    Esempi
                  </p>
                </div>
                <div className="space-y-2">
                  {help.esempiVisivi.map((esempio, i) => (
                    <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedEsempio(expandedEsempio === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left bg-white hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 flex-1">
                          <BookOpen size={13} className="text-indigo-500 flex-shrink-0" />
                          <p className="text-xs font-bold text-slate-700">{esempio.titolo}</p>
                        </div>
                        {expandedEsempio === i
                          ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                          : <ChevronDown size={13} className="text-slate-400 flex-shrink-0 ml-2" />
                        }
                      </button>
                      {expandedEsempio === i && (
                        <div className="px-4 pb-4 border-t border-slate-100 bg-white">
                          <p className="text-xs text-slate-500 mt-3 mb-3 leading-relaxed">
                            {esempio.descrizione}
                          </p>
                          <div className="bg-slate-50 rounded-xl overflow-hidden">
                            {esempio.campi.map((campo, j) => (
                              <div
                                key={j}
                                className={`flex items-start justify-between gap-4 px-4 py-3 ${
                                  j < esempio.campi.length - 1 ? 'border-b border-slate-200' : ''
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    {campo.label}
                                  </p>
                                  {campo.nota && (
                                    <p className="text-[10px] text-slate-400 mt-0.5 italic">{campo.nota}</p>
                                  )}
                                </div>
                                <p className="text-xs font-black text-indigo-600 text-right flex-shrink-0">
                                  {campo.valore}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FAQ */}
            {help.faqRapide.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Info size={14} className="text-sky-600" />
                  <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">
                    Domande Frequenti
                  </p>
                </div>
                <div className="space-y-2">
                  {help.faqRapide.map((faq, i) => (
                    <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left bg-white hover:bg-slate-50 transition-colors gap-3"
                      >
                        <p className="text-xs font-bold text-slate-700 flex-1 leading-snug">
                          {faq.domanda}
                        </p>
                        {expandedFaq === i
                          ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0" />
                          : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
                        }
                      </button>
                      {expandedFaq === i && (
                        <div className="px-4 pb-4 border-t border-slate-100 bg-white">
                          <p className="text-sm text-slate-600 leading-relaxed mt-3">
                            {faq.risposta}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Termini collegati */}
            {help.terminiCollegati.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Termini Chiave di questa Sezione
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {help.terminiCollegati.map((id, i) => {
                    const t = GLOSSARIO.find(g => g.id === id);
                    return t ? (
                      <span
                        key={i}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${CATEGORIA_COLORS[t.categoria].bg} ${CATEGORIA_COLORS[t.categoria].text}`}
                      >
                        {t.nome}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

// ─── COMPONENTE PRINCIPALE ───────────────────────────────────────

interface GuidaKPIViewProps {
  initialTab?: MainTab;
  initialSection?: string;
}

const GuidaKPIView: React.FC<GuidaKPIViewProps> = ({
  initialTab = 'manuale',
  initialSection,
}) => {
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTermini, setExpandedTermini] = useState<Set<string>>(new Set());
  const [expandedSezioni, setExpandedSezioni] = useState<Set<string>>(
    new Set(initialSection ? [initialSection] : [])
  );
  const [activeCat, setActiveCat] = useState<CategoriaGlossario | 'tutti'>('tutti');

  // Apri automaticamente il termine o la sezione richiesta
  React.useEffect(() => {
    if (initialSection) {
      if (activeTab === 'manuale') {
        setExpandedSezioni(new Set([initialSection]));
        setTimeout(() => {
          document.getElementById(`sezione-${initialSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } else {
        setExpandedTermini(new Set([initialSection]));
        setTimeout(() => {
          document.getElementById(`termine-${initialSection}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [initialSection, activeTab]);

  // Filtra termini
  const terminiFiltrati = useMemo(() => {
    let lista = GLOSSARIO;
    if (activeCat !== 'tutti') {
      lista = lista.filter(t => t.categoria === activeCat);
    }
    if (searchQuery.trim().length > 1) {
      const q = searchQuery.toLowerCase();
      lista = lista.filter(t =>
        t.nome.toLowerCase().includes(q) ||
        t.definizione.toLowerCase().includes(q) ||
        (t.formulaTestuale || '').toLowerCase().includes(q) ||
        t.origine.toLowerCase().includes(q)
      );
    }
    return lista.sort((a, b) => a.nome.localeCompare(b.nome));
  }, [activeCat, searchQuery]);

  const toggleTermine = (id: string) => {
    setExpandedTermini(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSezione = (id: string) => {
    setExpandedSezioni(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openConnesso = (id: string) => {
    setActiveTab('glossario');
    setExpandedTermini(new Set([id]));
    setSearchQuery('');
    setActiveCat('tutti');
    setTimeout(() => {
      document.getElementById(`termine-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  const sezioniManuale = Object.keys(HELP_CONTENT);

  const categorieConCount = (Object.keys(CATEGORIE_GLOSSARIO) as CategoriaGlossario[]).map(cat => ({
    id: cat,
    label: CATEGORIE_GLOSSARIO[cat],
    count: GLOSSARIO.filter(t => t.categoria === cat).length,
    colors: CATEGORIA_COLORS[cat],
  }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">

      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <BookOpen className="text-slate-900" />
            Manuale & Glossario
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Guida completa all'app — {GLOSSARIO.length} termini tecnici spiegati
          </p>
        </div>
        <button
          onClick={() => exportGuidaPDF(activeTab)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-all shadow-sm"
        >
          <FileText size={14} />
          Esporta {activeTab === 'manuale' ? 'Manuale' : 'Glossario'} PDF
        </button>
      </div>
      <div className="flex bg-slate-200/50 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('manuale')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${
            activeTab === 'manuale'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:bg-white/50'
          }`}
        >
          <FileText size={16} />
          Manuale per Sezione
          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded-full">
            {sezioniManuale.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('glossario')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black transition-all ${
            activeTab === 'glossario'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:bg-white/50'
          }`}
        >
          <BookOpen size={16} />
          Glossario Termini
          <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 text-[9px] font-black rounded-full">
            {GLOSSARIO.length}
          </span>
        </button>
      </div>

      <div id="guida-content">

        {/* ══════════════════════════════════════════════════════════
            TAB MANUALE
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'manuale' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">

            {/* Intro */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex items-start gap-3">
              <Info size={16} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-800 leading-relaxed">
                Ogni sezione spiega a cosa serve, come si compila correttamente,
                gli errori più comuni e gli esempi pratici.
                Clicca su una sezione per espanderla.
              </p>
            </div>

            {/* Espandi/Comprimi tutto */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExpandedSezioni(new Set(sezioniManuale))}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Espandi tutto
              </button>
              <button
                onClick={() => setExpandedSezioni(new Set())}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Comprimi tutto
              </button>
            </div>

            {/* Sezioni */}
            {sezioniManuale.map(sectionId => (
              <SezioneManuale
                key={sectionId}
                sectionId={sectionId}
                isExpanded={expandedSezioni.has(sectionId)}
                onToggle={() => toggleSezione(sectionId)}
              />
            ))}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB GLOSSARIO
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'glossario' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">

            {/* Barra ricerca */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Cerca termine... (es. EBITDA, overhead, DSO)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 outline-none focus:border-slate-400 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filtri categoria */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveCat('tutti')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeCat === 'tutti'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                Tutti ({GLOSSARIO.length})
              </button>
              {categorieConCount.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    activeCat === cat.id
                      ? `${cat.colors.bg} ${cat.colors.text} border ${cat.colors.border}`
                      : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {cat.label} ({cat.count})
                </button>
              ))}
            </div>

            {/* Risultati ricerca */}
            {searchQuery.trim().length > 1 && (
              <p className="text-xs text-slate-400">
                {terminiFiltrati.length} risultati per "{searchQuery}"
              </p>
            )}

            {/* Espandi/Comprimi tutto */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setExpandedTermini(new Set(terminiFiltrati.map(t => t.id)))}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Espandi tutto
              </button>
              <button
                onClick={() => setExpandedTermini(new Set())}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Comprimi tutto
              </button>
            </div>

            {/* Lista termini */}
            {terminiFiltrati.length === 0 ? (
              <div className="text-center py-12">
                <Search size={28} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-400">
                  Nessun termine trovato per "{searchQuery}"
                </p>
                <button
                  onClick={() => { setSearchQuery(''); setActiveCat('tutti'); }}
                  className="mt-3 text-xs text-slate-500 hover:underline"
                >
                  Cancella filtri
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {terminiFiltrati.map(termine => (
                  <TermineCard
                    key={termine.id}
                    termine={termine}
                    isExpanded={expandedTermini.has(termine.id)}
                    onToggle={() => toggleTermine(termine.id)}
                    onOpenConnesso={openConnesso}
                  />
                ))}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};

export default GuidaKPIView;
