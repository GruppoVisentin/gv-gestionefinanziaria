import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';
import { getTermine } from '../content/glossary';
import TermModal from './TermModal';

interface InfoTooltipProps {
  termId: string;
  // Opzionale: testo custom per il tooltip rapido (altrimenti usa i primi 120 char della definizione)
  customTip?: string;
  // Dimensione icona
  size?: 'sm' | 'md';
  // Colore icona
  color?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
  termId,
  customTip,
  size = 'sm',
  color,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<'top' | 'bottom'>('top');
  const iconRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const termine = getTermine(termId);

  // Chiudi tooltip cliccando fuori
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        iconRef.current && !iconRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determina posizione tooltip (sopra o sotto) in base alla posizione sullo schermo
  useEffect(() => {
    if (showTooltip && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setTooltipPos(rect.top > 200 ? 'top' : 'bottom');
    }
  }, [showTooltip]);

  if (!termine) return null;

  const tipText = customTip ||
    (termine.definizione.length > 140
      ? termine.definizione.slice(0, 140) + '...'
      : termine.definizione);

  const iconSize = size === 'sm' ? 13 : 16;
  const iconColor = color || 'text-slate-400 hover:text-slate-900';

  return (
    <>
      {/* Icona ⓘ */}
      <button
        ref={iconRef}
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(prev => !prev);
        }}
        className={`inline-flex items-center justify-center transition-colors ${iconColor} focus:outline-none`}
        aria-label={`Informazioni su ${termine.nome}`}
      >
        <Info size={iconSize} />
      </button>

      {/* Tooltip rapido (Livello 1) */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          className={`
            absolute z-50 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl p-4
            ${tooltipPos === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          style={{ left: '50%', transform: 'translateX(-50%)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header tooltip */}
          <div className="flex items-start justify-between mb-2 gap-2">
            <div>
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                {termine.nome}
              </p>
              {termine.formulaTestuale && (
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 leading-tight">
                  {termine.formulaTestuale.length > 60
                    ? termine.formulaTestuale.slice(0, 60) + '...'
                    : termine.formulaTestuale}
                </p>
              )}
            </div>
          </div>

          {/* Definizione breve */}
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            {tipText}
          </p>

          {/* Soglie rapide se disponibili */}
          {termine.sogliaEdilizia && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {termine.sogliaEdilizia.ottimo && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[9px] font-black rounded-full">
                  ✓ {termine.sogliaEdilizia.ottimo}
                </span>
              )}
              {termine.sogliaEdilizia.attenzione && (
                <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[9px] font-black rounded-full">
                  ⚠ {termine.sogliaEdilizia.attenzione}
                </span>
              )}
              {termine.sogliaEdilizia.critico && (
                <span className="px-2 py-0.5 bg-slate-300 text-slate-900 text-[9px] font-black rounded-full">
                  ✗ {termine.sogliaEdilizia.critico}
                </span>
              )}
            </div>
          )}

          {/* Bottone approfondisci */}
          <button
            onClick={() => {
              setShowTooltip(false);
              setShowModal(true);
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors"
          >
            Approfondisci →
          </button>
        </div>
      )}

      {/* Modal approfondimento (Livello 2) */}
      {showModal && (
        <TermModal
          termId={termId}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

// Wrapper con position:relative per contenere il tooltip
export const InfoTooltipWrapper: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <span className={`relative inline-flex items-center gap-1 ${className}`}>
    {children}
  </span>
);

export default InfoTooltip;
