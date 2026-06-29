import React from 'react';
import { CURRENCY_FORMATTER } from '../constants';
import { HelpCircle, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  amount: number;
  type: 'income' | 'expense' | 'balance';
  onInfoClick?: () => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, amount, type, onInfoClick }) => {
  let colorClass = '';
  let Icon = Wallet;

  if (type === 'income') {
    colorClass = 'text-emerald-600 bg-emerald-50';
    Icon = ArrowUpRight;
  } else if (type === 'expense') {
    colorClass = 'text-rose-600 bg-rose-50';
    Icon = ArrowDownRight;
  } else {
    colorClass = 'text-blue-600 bg-blue-50';
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between relative">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          {onInfoClick && (
            <button 
              onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-900 transition-colors"
              title="Mostra dettagli"
            >
              <HelpCircle size={14} />
            </button>
          )}
        </div>
        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
          {CURRENCY_FORMATTER.format(amount)}
        </h3>
      </div>
      <div className={`p-3 rounded-xl ${colorClass}`}>
        <Icon size={24} />
      </div>
    </div>
  );
};

export default SummaryCard;