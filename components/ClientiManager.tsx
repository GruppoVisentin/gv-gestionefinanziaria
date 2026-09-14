import React, { useState } from 'react';
import { Plus, Trash2, Edit2, X, Check, Globe } from 'lucide-react';
import { Client } from '../types';

interface ClientiManagerProps {
  clients: Client[];
  onAddClient: (nome: string, pIva?: string) => void;
  onUpdateClient: (id: string, nome: string, pIva?: string) => void;
  onDeleteClient: (id: string) => void;
  onClose: () => void;
}

export function ClientiManager({ clients, onAddClient, onUpdateClient, onDeleteClient, onClose }: ClientiManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [nome, setNome] = useState('');
  const [pIva, setPIva] = useState('');

  const startEdit = (client: Client) => {
    setEditingId(client.id);
    setIsAdding(false);
    setNome(client.nome);
    setPIva(client.pIva || '');
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setNome('');
    setPIva('');
  };

  const cancel = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const save = () => {
    if (!nome.trim()) return;
    if (editingId) {
      onUpdateClient(editingId, nome.trim(), pIva.trim() || undefined);
    } else {
      onAddClient(nome.trim(), pIva.trim() || undefined);
    }
    setIsAdding(false);
    setEditingId(null);
  };

  const sorted = [...clients].sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-900">Anagrafica Clienti</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase">Registro condiviso con l'ecosistema GV</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-end">
            {!isAdding && (
              <button
                onClick={startAdd}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all"
              >
                <Plus size={14} /> Nuovo Cliente
              </button>
            )}
          </div>

          {isAdding && (
            <div className="flex flex-col sm:flex-row gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
              <input
                autoFocus
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ragione sociale / Nome"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <input
                value={pIva}
                onChange={e => setPIva(e.target.value)}
                placeholder="P.IVA / Codice Fiscale"
                className="sm:w-56 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <div className="flex gap-2 shrink-0">
                <button onClick={save} className="p-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600"><Check size={16} /></button>
                <button onClick={cancel} className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300"><X size={16} /></button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
            {sorted.length === 0 && !isAdding && (
              <div className="p-6 text-center text-sm text-slate-400">Nessun cliente registrato.</div>
            )}
            {sorted.map(client => (
              <div key={client.id} className="flex items-center gap-3 px-4 py-3 bg-white">
                {editingId === client.id ? (
                  <>
                    <input
                      autoFocus
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                    />
                    <input
                      value={pIva}
                      onChange={e => setPIva(e.target.value)}
                      placeholder="P.IVA / CF"
                      className="w-40 px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                    />
                    <button onClick={save} className="p-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"><Check size={14} /></button>
                    <button onClick={cancel} className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 truncate">{client.nome}</span>
                        {client.externalSource && (
                          <span title="Importato da DirettoreCantiere" className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-full shrink-0">
                            <Globe size={10} /> DirettoreCantiere
                          </span>
                        )}
                      </div>
                      {client.pIva && <span className="text-xs text-slate-400">{client.pIva}</span>}
                    </div>
                    <button onClick={() => startEdit(client)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"><Edit2 size={14} /></button>
                    <button onClick={() => onDeleteClient(client.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
