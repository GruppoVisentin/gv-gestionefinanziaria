import React, { useState } from 'react';
import { Settings, Plus, Trash2, Edit2, Save, X, RotateCcw, Database, Building2 } from 'lucide-react';
import { FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { BackupData, TipologiaCantiere } from '../types';
import DataManager from './DataManager';
import { TipologiaManager } from './Wizards';

interface CategoryManagerProps {
  fixedCategories: string[];
  variableCategories: string[];
  incomeCategories: string[];
  tipologieCantiere: TipologiaCantiere[];
  onUpdateFixed: (categories: string[]) => void;
  onUpdateVariable: (categories: string[]) => void;
  onUpdateIncome: (categories: string[]) => void;
  onUpdateTipologie: (tipologie: TipologiaCantiere[]) => void;
  isAuthorized?: boolean;
  // New props for Data Manager
  onExportData?: () => BackupData;
  onImportData?: (data: BackupData) => void;
  onChangeFile?: () => void;
  currentFileName?: string;
  backupFileName?: string;
  onSetBackupFile?: () => void;
  onClearBackupFile?: () => void;
  rulesFileName?: string;
  onLinkRulesFile?: () => void;
  onCreateRulesFile?: () => void;
  onClearRulesFile?: () => void;
  importSessions?: import('../types').ImportSession[];
  onAnnullaSessione?: (id: string) => void;
  onImportStorico?: () => void;
  storicoImportato?: boolean;
  transactions?: any[];
  onRenameCategory?: (oldName: string, newName: string) => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ 
  fixedCategories, 
  variableCategories,
  incomeCategories,
  tipologieCantiere,
  onUpdateFixed, 
  onUpdateVariable,
  onUpdateIncome,
  onUpdateTipologie,
  isAuthorized = false,
  onExportData,
  onImportData,
  onChangeFile,
  currentFileName,
  backupFileName,
  onSetBackupFile,
  onClearBackupFile,
  rulesFileName,
  onLinkRulesFile,
  onCreateRulesFile,
  onClearRulesFile,
  importSessions = [],
  onAnnullaSessione,
  onImportStorico,
  storicoImportato,
  transactions = [],
  onRenameCategory
}) => {
  const [activeTab, setActiveTab] = useState<'fixed' | 'variable' | 'income' | 'tipologie' | 'data'>('fixed');
  const [newCategory, setNewCategory] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  let currentList: string[] = [];
  let updateList: (categories: string[]) => void = () => {};

  if (activeTab === 'fixed') {
      currentList = fixedCategories;
      updateList = onUpdateFixed;
  } else if (activeTab === 'variable') {
      currentList = variableCategories;
      updateList = onUpdateVariable;
  } else if (activeTab === 'income') {
      currentList = incomeCategories;
      updateList = onUpdateIncome;
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    if (currentList.includes(newCategory.trim())) {
        alert('Questa categoria esiste già.');
        return;
    }
    updateList([...currentList, newCategory.trim()]);
    setNewCategory('');
  };

  const handleDelete = (index: number) => {
    if (confirm('Sei sicuro di voler eliminare questa categoria? Le transazioni esistenti manterranno il nome, ma la categoria non sarà più selezionabile per le nuove.')) {
      const newList = [...currentList];
      newList.splice(index, 1);
      updateList(newList);
    }
  };

  const startEdit = (index: number, val: string) => {
    setEditingIndex(index);
    setEditValue(val);
  };

  const saveEdit = () => {
    if (editingIndex === null || !editValue.trim()) return;
    const oldName = currentList[editingIndex];
    const newName = editValue.trim();
    if (oldName === newName) {
      setEditingIndex(null);
      setEditValue('');
      return;
    }
    const newList = [...currentList];
    newList[editingIndex] = newName;
    updateList(newList);
    if (onRenameCategory) {
      onRenameCategory(oldName, newName);
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const handleResetDefaults = () => {
      if(confirm("Vuoi ripristinare le categorie predefinite del sistema? Tutte le categorie personalizzate andranno perse.")) {
          if (activeTab === 'fixed') onUpdateFixed([...FIXED_COST_CATEGORIES]);
          else if (activeTab === 'variable') onUpdateVariable([...VARIABLE_COST_CATEGORIES]);
          else onUpdateIncome([...INCOME_CATEGORIES]);
      }
  }

  const getTabColor = () => {
    switch (activeTab) {
      case 'fixed': return 'indigo';
      case 'variable': return 'rose';
      case 'income': return 'emerald';
      case 'tipologie': return 'amber';
      case 'data': return 'violet';
      default: return 'slate';
    }
  };

  const color = getTabColor();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className={`text-2xl font-bold text-slate-800 flex items-center gap-2`}>
          <Settings className={`text-${color}-500`} />
          Configurazione & Dati
        </h2>
        {isAuthorized && activeTab !== 'data' && (
            <button 
                onClick={handleResetDefaults}
                className={`text-xs text-slate-400 hover:text-${color}-600 flex items-center gap-1 transition-colors`}
            >
                <RotateCcw size={14} /> Ripristina Default
            </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('fixed'); setEditingIndex(null); }}
            className={`flex-1 min-w-[100px] py-4 text-xs md:text-sm font-bold uppercase tracking-wide transition-all border-b-2 ${
              activeTab === 'fixed' 
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' 
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            Costi Fissi
          </button>
          <button
            onClick={() => { setActiveTab('variable'); setEditingIndex(null); }}
            className={`flex-1 min-w-[100px] py-4 text-xs md:text-sm font-bold uppercase tracking-wide transition-all border-b-2 ${
              activeTab === 'variable' 
                ? 'border-rose-600 text-rose-700 bg-rose-50/50' 
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            Costi Variabili
          </button>
          <button
            onClick={() => { setActiveTab('income'); setEditingIndex(null); }}
            className={`flex-1 min-w-[100px] py-4 text-xs md:text-sm font-bold uppercase tracking-wide transition-all border-b-2 ${
              activeTab === 'income' 
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50' 
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            Entrate
          </button>
          <button
            onClick={() => { setActiveTab('tipologie'); setEditingIndex(null); }}
            className={`flex-1 min-w-[140px] py-4 text-xs md:text-sm font-bold uppercase tracking-wide transition-all border-b-2 flex items-center justify-center gap-2 ${
              activeTab === 'tipologie' 
                ? 'border-amber-600 text-amber-700 bg-amber-50/50' 
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Building2 size={14} className={activeTab === 'tipologie' ? 'text-amber-600' : 'text-slate-400'} />
            Tipologie Cantiere
          </button>
          <button
            onClick={() => { setActiveTab('data'); setEditingIndex(null); }}
            className={`flex-1 min-w-[120px] py-4 text-xs md:text-sm font-bold uppercase tracking-wide transition-all border-b-2 flex items-center justify-center gap-2 ${
              activeTab === 'data' 
                ? 'border-violet-600 text-violet-700 bg-violet-50/50' 
                : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Database size={14} className={activeTab === 'data' ? 'text-violet-600' : 'text-slate-400'} />
            Backup & Dati
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'data' ? (
              // DATA MANAGER VIEW
              onExportData && onImportData ? (
                  <DataManager 
                    onExport={onExportData} 
                    onImport={onImportData} 
                    onChangeFile={onChangeFile}
                    currentFileName={currentFileName}
                    backupFileName={backupFileName}
                    onSetBackupFile={onSetBackupFile}
                    onClearBackupFile={onClearBackupFile}
                    rulesFileName={rulesFileName}
                    onLinkRulesFile={onLinkRulesFile}
                    onCreateRulesFile={onCreateRulesFile}
                    onClearRulesFile={onClearRulesFile}
                    importSessions={importSessions}
                    onAnnullaSessione={onAnnullaSessione}
                    onImportStorico={onImportStorico}
                    storicoImportato={storicoImportato}
                  />
              ) : (
                  <div className="text-center text-slate-400 py-8">Gestione dati non disponibile.</div>
              )
          ) : activeTab === 'tipologie' ? (
              // TIPOLOGIE MANAGER VIEW
              <TipologiaManager 
                tipologie={tipologieCantiere}
                onSave={(t) => {
                    const exists = tipologieCantiere.find(x => x.id === t.id);
                    if (exists) {
                        onUpdateTipologie(tipologieCantiere.map(x => x.id === t.id ? t : x));
                    } else {
                        onUpdateTipologie([...tipologieCantiere, t]);
                    }
                }}
                onDelete={(id) => {
                    if (confirm('Sei sicuro di voler eliminare questa tipologia?')) {
                        onUpdateTipologie(tipologieCantiere.filter(x => x.id !== id));
                    }
                }}
                isAuthorized={isAuthorized}
                variableCategories={variableCategories}
              />
          ) : (
              // CATEGORY LIST VIEW
              <>
                {/* Add New - Only if Authorized */}
                {isAuthorized && (
                    <form onSubmit={handleAdd} className="flex gap-2 mb-8">
                        <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder={`Nuova categoria...`}
                        className={`flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-${color}-500`}
                        />
                        <button
                        type="submit"
                        disabled={!newCategory.trim()}
                        className={`bg-${color}-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-${color}-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm`}
                        >
                        <Plus size={18} />
                        Aggiungi
                        </button>
                    </form>
                )}

                {/* List */}
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {currentList.map((cat, index) => (
                    <div 
                        key={index} 
                        className={`flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 border-l-4 border-l-${color}-500 group hover:border-slate-300 transition-colors`}
                    >
                        {editingIndex === index ? (
                        <div className="flex items-center gap-2 flex-1 mr-4">
                            <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className={`flex-1 px-2 py-1 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-${color}-500`}
                            autoFocus
                            />
                            <button onClick={saveEdit} className={`p-1.5 bg-${color}-100 text-${color}-700 rounded hover:bg-${color}-200`}><Save size={16} /></button>
                            <button onClick={cancelEdit} className="p-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"><X size={16} /></button>
                        </div>
                        ) : (
                        <>
                            <span className="font-medium text-slate-700 text-sm">{cat}</span>
                            {isAuthorized && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                    onClick={() => startEdit(index, cat)}
                                    className={`p-1.5 text-slate-400 hover:text-${color}-600 hover:bg-${color}-50 rounded transition-colors`}
                                    title="Modifica"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button 
                                    onClick={() => handleDelete(index)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                    title="Elimina"
                                >
                                    <Trash2 size={16} />
                                </button>
                                </div>
                            )}
                        </>
                        )}
                    </div>
                    ))}
                    
                    {currentList.length === 0 && (
                        <p className="text-center text-slate-400 italic py-4">Nessuna categoria presente.</p>
                    )}
                </div>
              </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CategoryManager;