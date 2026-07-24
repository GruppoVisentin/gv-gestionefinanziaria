import React from 'react';
import { Transaction, TransactionType } from '../types';
import { CURRENCY_FORMATTER, DATE_FORMATTER } from '../constants';
import { ArrowUpCircle, ArrowDownCircle, Trash2 } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (id: string) => void;
  isAuthorized?: boolean;
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions = [], onDelete, isAuthorized = false }) => {
  // Sort by date desc
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (transactions.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400">
        <p>Nessuna transazione ancora.</p>
        <p className="text-sm">Aggiungi la tua prima entrata o uscita!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedTransactions.map((transaction) => (
        <div 
          key={transaction.id} 
          className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between hover:border-slate-300 transition-colors group"
        >
          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-full ${transaction.type === TransactionType.INCOME ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {transaction.type === TransactionType.INCOME ? <ArrowUpCircle size={24} /> : <ArrowDownCircle size={24} />}
            </div>
            <div>
              <h4 className="font-medium text-slate-900">{transaction.description}</h4>
              <p className="text-xs text-slate-500">
                {DATE_FORMATTER.format(new Date(transaction.date))} • {transaction.category}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={`font-mono font-bold ${transaction.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-700'}`}>
                {transaction.type === TransactionType.INCOME ? '+' : '-'}{CURRENCY_FORMATTER.format(transaction.amount)}
              </div>
              {transaction.vatRate !== undefined && (
                <div className="text-[10px] text-slate-400">
                  IVA {transaction.vatRate === 0 ? 'esente' : `${transaction.vatRate}%`}
                  {transaction.vatRate > 0 && (
                    <span className="ml-1 text-slate-300">
                      (lordo {CURRENCY_FORMATTER.format(transaction.amount * (1 + transaction.vatRate / 100))})
                    </span>
                  )}
                </div>
              )}
            </div>
            {isAuthorized && (
              <button 
                onClick={() => onDelete(transaction.id)}
                className="p-2 text-slate-300 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Elimina"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionList;