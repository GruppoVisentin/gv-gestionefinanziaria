import React from 'react';
import { Instagram, Facebook } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-[#222222] py-8 border-t border-slate-800 mt-auto w-full font-sans text-left z-40 relative print:hidden">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            
            {/* Dati Aziendali e Contatti */}
            <div className="space-y-2">
                <h2 className="text-lg font-black text-slate-200 uppercase tracking-wide">
                    GRUPPO VISENTIN SRL
                </h2>
                <div className="text-slate-400 text-[11px] md:text-xs font-medium max-w-xl">
                    <p>Via S.Apollonia 45/A – 31030 Caselle di Altivole (TV) – P.IVA 05196680267</p>
                    <p>
                        tel. 0423569513 – 
                        <a href="mailto:info@gruppovisentin.com" className="text-slate-300 hover:text-white transition-colors ml-1">
                            info@gruppovisentin.com
                        </a> – 
                        <a href="https://www.gruppovisentin.com" target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white font-bold transition-all ml-1">
                            www.gruppovisentin.com
                        </a>
                    </p>
                </div>
            </div>

            {/* Icone Social (Grayscale) */}
            <div className="flex items-center gap-4">
                <a href="https://instagram.com/gruppo_visentin_yourhome" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                    <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-white border border-white/10 transition-all hover:scale-110 shadow-lg">
                        <Instagram size={14} />
                    </div>
                </a>
                <a href="#" className="flex items-center gap-2 group">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-white border border-white/10 transition-all hover:scale-110 shadow-lg">
                        <Facebook size={14} />
                    </div>
                </a>
            </div>
        </div>

        {/* Barra Copyright Inferiore */}
        <div className="mt-8 pt-6 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] flex flex-wrap items-center justify-center md:justify-start gap-2">
                © 2026 GV ECOSYSTEM MANAGEMENT 
            </p>
            {/* Elemento Grafico 3 Pallini (Grayscale) */}
            <div className="flex gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
            </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;