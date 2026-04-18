import React, { useState, useEffect } from 'react';
import { Shield, Lock, LockOpen, Settings } from 'lucide-react';

interface SecureResponsibleWidgetProps {
  /** Lista dei nomi dei responsabili */
  responsibles: string[];
  /** Callback chiamata quando lo stato di autorizzazione cambia */
  onAuthChange: (isAuthorized: boolean, responsibleName: string) => void;
  /** (Opzionale) Password per sbloccare. Default: "gvflow808282" */
  masterPassword?: string;
  /** (Opzionale) Classe CSS extra per il container */
  className?: string;
  /** (Opzionale) Handler per il click sulle impostazioni */
  onSettingsClick?: () => void;
}

// --- Sotto-Componente: Modale Password ---
const PasswordModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: (pwd: string) => void;
  responsibleName: string;
}> = ({ isOpen, onClose, onConfirm, responsibleName }) => {
  const [pwd, setPwd] = useState('');
  
  // Reset password field on open
  useEffect(() => { if(isOpen) setPwd(''); }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center border-b border-slate-100">
          <div className="w-16 h-16 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-800">Abilita Compilazione</h3>
          <p className="text-slate-500 text-sm mt-1">Inserisci la password per operare come <br/><span className="text-slate-900 font-bold">{responsibleName}</span></p>
        </div>
        <div className="p-6">
          <input 
            type="password" 
            autoFocus
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onConfirm(pwd)}
            placeholder="Password..."
            className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-slate-500 focus:outline-none text-center font-bold tracking-widest text-slate-800"
          />
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button onClick={onClose} className="py-3 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all">Annulla</button>
            <button onClick={() => onConfirm(pwd)} className="py-3 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-lg shadow-slate-100 hover:bg-slate-800 transition-all">Sblocca</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Componente Principale ---
const SecureResponsibleWidget: React.FC<SecureResponsibleWidgetProps> = ({ 
  responsibles, 
  onAuthChange,
  masterPassword = "gvflow808282",
  className = "",
  onSettingsClick
}) => {
  const [currentResponsible, setCurrentResponsible] = useState<string>("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingResponsible, setPendingResponsible] = useState('');

  // Gestione selezione dal menu a tendina
  const handleSelection = (newVal: string) => {
    // Caso: Disconnessione (selezione vuota)
    if (newVal === "") { 
      setCurrentResponsible(""); 
      setIsAuthorized(false);
      onAuthChange(false, "");
      return; 
    }

    // Caso: Tentativo di accesso (apre modale)
    setPendingResponsible(newVal);
    setIsModalOpen(true);
  };

  // Gestione conferma password
  const handlePasswordConfirm = (pwd: string) => {
    if (pwd === masterPassword) {
        // Successo
        setCurrentResponsible(pendingResponsible);
        setIsAuthorized(true);
        setIsModalOpen(false);
        onAuthChange(true, pendingResponsible);
        setPendingResponsible('');
    } else { 
        // Errore
        alert("Password errata. Compilazione non abilitata."); 
        // Reset (opzionale: chiudere modale o lasciare aperta per riprovare)
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setPendingResponsible('');
    // Se non eravamo già loggati, resetta la select
    if (!isAuthorized) {
        setCurrentResponsible("");
    }
  };

  return (
    <>
      {/* Widget UI */}
      <div className={`flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 transition-all w-full sm:w-auto ${className}`}>
        
        {/* Icona Lucchetto */}
        {isAuthorized ? <LockOpen size={10} className="text-slate-400" /> : <Lock size={10} className="text-slate-500" />}
        
        {/* Select */}
        <select 
          value={currentResponsible} 
          onChange={(e) => handleSelection(e.target.value)} 
          className="bg-transparent text-[11px] font-bold text-slate-400 focus:outline-none cursor-pointer outline-none border-none p-0 flex-1 sm:flex-none appearance-none min-w-[100px]"
        >
          <option value="" className="bg-zinc-900 text-zinc-400">Responsabile...</option>
          {responsibles.map((r, i) => (
            <option key={i} value={r} className="bg-zinc-900 text-white">{r}</option>
          ))}
        </select>

        {/* Icona Ingranaggio */}
        {onSettingsClick && (
            <button 
                onClick={onSettingsClick}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-600 hover:text-white transition-all cursor-pointer"
                title="Impostazioni"
            >
               <Settings size={11} />
            </button>
        )}
      </div>

      {/* Modale Password */}
      <PasswordModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        onConfirm={handlePasswordConfirm} 
        responsibleName={pendingResponsible} 
      />
    </>
  );
};

export default SecureResponsibleWidget;