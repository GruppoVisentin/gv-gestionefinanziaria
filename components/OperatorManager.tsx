import React, { useState } from 'react';
import { Users, UserPlus, Trash2, ShieldCheck, User } from 'lucide-react';

interface OperatorManagerProps {
  operators: string[];
  onUpdateOperators: (operators: string[]) => void;
  isAuthorized?: boolean;
}

const OperatorManager: React.FC<OperatorManagerProps> = ({ operators, onUpdateOperators, isAuthorized = false }) => {
  const [newOperator, setNewOperator] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOperator.trim()) return;
    
    // Capitalize first letters
    const formattedName = newOperator.trim().replace(/\b\w/g, l => l.toUpperCase());
    
    if (operators.includes(formattedName)) {
      alert('Questo operatore esiste già.');
      return;
    }

    onUpdateOperators([...operators, formattedName]);
    setNewOperator('');
  };

  const handleDelete = (index: number) => {
    if (confirm('Sei sicuro di voler rimuovere questo operatore?')) {
      const newList = [...operators];
      newList.splice(index, 1);
      onUpdateOperators(newList);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-2xl mx-auto mt-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-slate-100 rounded-xl">
            <Users className="text-slate-600" size={24} />
        </div>
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Operatori Abilitati</h2>
            <p className="text-slate-500 text-sm">Gestisci chi può accedere alla modalità di modifica protetta.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {isAuthorized && (
            <div className="p-6 border-b border-slate-50 bg-slate-50/50">
            <form onSubmit={handleAdd} className="flex gap-3">
                <div className="relative flex-1">
                    <UserPlus className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                    type="text"
                    value={newOperator}
                    onChange={(e) => setNewOperator(e.target.value)}
                    placeholder="Nome e Cognome nuovo operatore..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    />
                </div>
                <button
                type="submit"
                disabled={!newOperator.trim()}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-100"
                >
                Aggiungi
                </button>
            </form>
            </div>
        )}

        <div className="p-2">
            {operators.length === 0 ? (
                 <div className="text-center py-12 text-slate-400">
                    <ShieldCheck size={48} className="mx-auto mb-3 opacity-20" />
                    <p>Nessun operatore configurato.</p>
                    <p className="text-xs">Aggiungi almeno un responsabile per abilitare la sicurezza.</p>
                 </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {operators.map((op, index) => (
                    <div 
                        key={index} 
                        className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-xl transition-colors group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-sm">
                                {op.charAt(0)}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700">{op}</h3>
                                <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">Abilitato</span>
                            </div>
                        </div>
                        
                        {isAuthorized && (
                            <button 
                                onClick={() => handleDelete(index)}
                                className="p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="Rimuovi accesso"
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                    </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default OperatorManager;