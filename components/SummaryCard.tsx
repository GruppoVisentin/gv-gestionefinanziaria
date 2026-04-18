import React from 'react';
import { CURRENCY_FORMATTER } from '../constants';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';

interface SummaryCardProps {
  title: string;
  amount: number;
  type: 'income' | 'expense' | 'balance';
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, amount, type }) => {
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
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
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