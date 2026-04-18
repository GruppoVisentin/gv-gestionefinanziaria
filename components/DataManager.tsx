import React, { useRef, useState } from 'react';
import { BackupData, ImportSession } from '../types';
import { Download, Upload, Database, CheckCircle, AlertCircle, FileJson, HardDrive, Info, FolderOpen, Shield, History, Trash2, RotateCcw, FileSpreadsheet } from 'lucide-react';

interface DataManagerProps {
  onExport: () => BackupData;
  onImport: (data: BackupData) => void;
  onChangeFile?: () => void;
  currentFileName?: string;
  importSessions?: ImportSession[];
  onAnnullaSessione?: (id: string) => void;
  onImportStorico?: () => void;
  storicoImportato?: boolean;
}

const DataManager: React.FC<DataManagerProps> = ({ 
  onExport, 
  onImport, 
  onChangeFile,
  currentFileName,
  importSessions = [],
  onAnnullaSessione,
  onImportStorico,
  storicoImportato
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleExport = async () => {
    try {
      const data = onExport();
      const fileName = `gv_backup_${new Date().toISOString().split('T')[0]}.json`;
      const json = JSON.stringify(data, null, 2);
      
      // Utilizza File System Access API per aprire la finestra "Salva con nome"
      if ('showSaveFilePicker' in window) {
          const opts = {
              suggestedName: fileName,
              types: [{
                  description: 'Backup File JSON',
                  accept: { 'application/json': ['.json'] },
              }],
          };
          // @ts-ignore
          const handle = await window.showSaveFilePicker(opts);
          const writable = await handle.createWritable();
          await writable.write(json);
          await writable.close();
          setMessage({ type: 'success', text: 'Backup salvato con successo!' });
      } else {
          // Fallback per browser che non supportano l'API
          const blob = new Blob([json], { type: 'application/json' });
          const href = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = href;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(href);
          setMessage({ type: 'success', text: 'Backup scaricato! (Controlla Download se non richiesto percorso)' });
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
          console.error("Export error", error);
          setMessage({ type: 'error', text: 'Errore esportazione: ' + error.message });
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json) as BackupData;
        
        // Basic validation
        if (!data.transactions || !data.projects) {
            throw new Error("Formato file non valido");
        }

        if (confirm(`Stai per importare un backup del ${new Date(data.timestamp).toLocaleDateString()}. \nATTENZIONE: I dati attuali verranno sovrascritti. Continuare?`)) {
            onImport(data);
            setMessage({ type: 'success', text: 'Dati ripristinati con successo!' });
            setTimeout(() => setMessage(null), 3000);
        }
      } catch (error) {
        console.error("Import error", error);
        setMessage({ type: 'error', text: 'File non valido o corrotto.' });
      } finally {
          // Reset input
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      
      {/* Tasto Import Storico */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex items-center justify-between">
        <div>
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-indigo-500" />
            Import Storico Flusso di Cassa
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Carica i dati consuntivi degli anni precedenti al 2026 dal vecchio file Excel
          </p>
        </div>
        <div className="flex items-center gap-3">
          {storicoImportato && (
            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full uppercase">
              ✓ Già importato
            </span>
          )}
          <button
            onClick={onImportStorico}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet size={14} />
            {storicoImportato ? 'Importa di nuovo' : 'Importa storico'}
          </button>
        </div>
      </div>

      {/* SEZIONE PERCORSO DI ARCHIVIAZIONE */}
      <div className="bg-violet-900 text-white p-5 rounded-xl border border-violet-800 shadow-lg">
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-700 rounded-lg">
                    <Database size={20} className="text-violet-200" />
                </div>
                <div>
                    <h3 className="font-bold text-sm uppercase tracking-wider text-violet-100">Archiviazione Automatica</h3>
                    <p className="text-xs text-violet-300">Stato del sistema di salvataggio continuo</p>
                </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-violet-800 border border-violet-700 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                </span>
                <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Sincronizzato</span>
            </div>
        </div>

        <div className="bg-black/40 rounded-lg border border-violet-700 p-3 mb-4 font-mono text-xs text-violet-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 overflow-hidden">
              <FolderOpen size={16} className="text-violet-400 shrink-0" />
              <span className="text-violet-400">file:</span>
              <span className="text-violet-200 truncate select-all">
                  {currentFileName || 'Nessun file aperto'}
              </span>
            </div>
            {onChangeFile && (
              <button 
                onClick={onChangeFile}
                className="shrink-0 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] font-bold uppercase tracking-widest transition-colors"
              >
                Cambia file
              </button>
            )}
        </div>

        <div className="flex gap-3 items-start bg-violet-800 p-3 rounded-lg border border-violet-700">
            <Info size={16} className="text-violet-300 shrink-0 mt-0.5" />
            <div className="text-xs text-violet-200 leading-relaxed">
                <strong className="text-violet-100 block mb-1">Nota sul percorso file:</strong>
                L'app sta salvando direttamente sul file selezionato. Ogni modifica viene sincronizzata automaticamente ogni 3 minuti e alla chiusura.
                <br/><br/>
                Puoi cambiare il file di lavoro o crearne uno nuovo cliccando su "Cambia file".
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* EXPORT */}
        <div className="bg-white p-6 rounded-xl border border-violet-100 shadow-sm flex flex-col items-center text-center hover:border-violet-400 transition-colors group">
            <div className="bg-violet-50 p-4 rounded-full mb-4 text-violet-600 group-hover:bg-violet-100 transition-colors">
                <Download size={32} />
            </div>
            <h4 className="font-bold text-slate-800 mb-2">Esporta Backup su File</h4>
            <p className="text-xs text-slate-500 mb-6">
                Crea un file <b>.json</b> completo di tutti i dati. Potrai scegliere la cartella di destinazione (Desktop, Documenti, Chiavetta USB) al momento del salvataggio.
            </p>
            <button 
                onClick={handleExport}
                className="w-full bg-violet-600 text-white py-2.5 rounded-lg font-bold hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
            >
                <FileJson size={18} /> Salva con nome...
            </button>
        </div>

        {/* IMPORT */}
        <div className="bg-white p-6 rounded-xl border border-violet-100 shadow-sm flex flex-col items-center text-center hover:border-violet-400 transition-colors group">
            <div className="bg-violet-50 p-4 rounded-full mb-4 text-violet-600 group-hover:bg-violet-100 transition-colors">
                <Upload size={32} />
            </div>
            <h4 className="font-bold text-slate-800 mb-2">Ripristina da File</h4>
            <p className="text-xs text-slate-500 mb-6">
                Hai cambiato computer o vuoi tornare a una versione precedente? Carica qui il file <b>.json</b> che avevi salvato in precedenza.
            </p>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json" 
                onChange={handleFileChange}
            />
            <button 
                onClick={handleImportClick}
                className="w-full bg-white border-2 border-violet-200 text-violet-700 py-2.5 rounded-lg font-bold hover:border-violet-500 hover:text-violet-900 transition-all flex items-center justify-center gap-2"
            >
                <HardDrive size={18} /> Seleziona File Backup
            </button>
        </div>
      </div>

      {message && (
          <div className={`p-4 rounded-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 ${message.type === 'success' ? 'bg-slate-50 text-slate-800 border border-slate-200' : 'bg-slate-100 text-slate-900 border border-slate-300'}`}>
              {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              <span className="font-medium text-sm">{message.text}</span>
          </div>
      )}

      {/* REGISTRO IMPORT PUNTA NET */}
      {importSessions.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <History size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Registro Import Punta Net</h4>
              <p className="text-xs text-slate-500">Storico delle sessioni di importazione</p>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {importSessions.map((session) => (
              <div 
                key={session.id} 
                className={`p-4 rounded-xl border transition-all ${
                  session.annullata 
                    ? 'bg-slate-50 border-slate-100 opacity-60' 
                    : 'bg-white border-slate-100 hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-slate-900 truncate">{session.nomeFile}</span>
                      {session.annullata && (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[8px] font-black uppercase rounded">Annullato</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium">
                      {new Date(session.timestamp).toLocaleString('it-IT')} · {session.transazioniImportate} transazioni
                    </p>
                    <p className="text-[9px] text-slate-400 mt-1 italic">
                      Periodo: {new Date(session.periodoInizio).toLocaleDateString('it-IT')} — {new Date(session.periodoFine).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  
                  {!session.annullata && onAnnullaSessione && (
                    <button 
                      onClick={() => onAnnullaSessione(session.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all group"
                      title="Annulla Import"
                    >
                      <RotateCcw size={16} className="group-hover:rotate-[-45deg] transition-transform" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManager;