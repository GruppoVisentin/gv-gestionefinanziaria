import React, { useState, useEffect } from 'react';
import { Transaction, TransactionType, Project, LoanDetails } from '../types';
import { CURRENCY_FORMATTER } from '../constants';
import { suggestCategory, fetchEuriborRates } from '../services/geminiService';
import { suggerisciAliquotaIVADaCategoria } from '../utils/puntaNetImporter';
import { getLocalYMD } from '../utils/gasCoreEngine';
import { Wand2, Loader2, Save, X, Briefcase, Percent, Layers, CalendarRange, FileText, User, Landmark, Calendar, Info, Search, RefreshCw } from 'lucide-react';
import { RinegoziazioneMutuo } from '../types';

interface TransactionFormProps {
  onSave: (transaction: Omit<Transaction, 'id'>) => void;
  onCancel: () => void;
  availableProjects?: Project[]; 
  initialData?: Transaction;
  fixedCategories: string[];
  variableCategories: string[];
  incomeCategories: string[];
  supplierPresets: Record<string, string[]>;
}

const TransactionForm: React.FC<TransactionFormProps> = ({ 
  onSave, 
  onCancel, 
  availableProjects = [], 
  initialData, 
  fixedCategories, 
  variableCategories,
  incomeCategories,
  supplierPresets
}) => {
  const [description, setDescription] = useState(initialData?.description || '');
  const [amount, setAmount] = useState(initialData?.amount?.toString() || '');
  const [vatRate, setVatRate] = useState(initialData?.vatRate?.toString() || '22');
  const [type, setType] = useState<TransactionType>(initialData?.type || TransactionType.EXPENSE);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [clientName, setClientName] = useState('');
  
  // New State for Expense Type (Fixed vs Variable)
  const [expenseType, setExpenseType] = useState<'FIXED' | 'VARIABLE'>(() => {
    if (initialData && initialData.type === TransactionType.EXPENSE) {
       return variableCategories.includes(initialData.category) ? 'VARIABLE' : 'FIXED';
    }
    return 'FIXED';
  });

  const [category, setCategory] = useState(initialData?.category || fixedCategories[0]);
  const [date, setDate] = useState(initialData?.date || getLocalYMD());
  const [project, setProject] = useState(initialData?.project || '');
  const [isForecast, setIsForecast] = useState(initialData?.isForecast || false);
  const [applyToAllMonths, setApplyToAllMonths] = useState(false); 
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoiceDate || '');

  // Loan Specific State
  const [loanInterestRate, setLoanInterestRate] = useState(initialData?.loanDetails?.interestRate?.toString() || '');
  const [loanRateType, setLoanRateType] = useState<'FIXED' | 'VARIABLE'>(initialData?.loanDetails?.rateType || 'FIXED');
  const [loanInterestStart, setLoanInterestStart] = useState(initialData?.loanDetails?.interestStartDate || '');
  const [loanPrincipalStart, setLoanPrincipalStart] = useState(initialData?.loanDetails?.principalStartDate || '');
  const [loanEndDate, setLoanEndDate] = useState(initialData?.loanDetails?.endDate || '');

  // Tasso variabile — Euribor
  const [spread, setSpread]                         = useState(initialData?.loanDetails?.spread?.toString() || '1.5');
  const [indiceDiRif, setIndiceDiRif]               = useState(initialData?.loanDetails?.indiceDiRiferimento || 'Euribor 3M');
  const [euriborData, setEuriborData]               = useState<Record<string, any>>({});
  const [loadingEuribor, setLoadingEuribor]         = useState(false);
  const [euriborErrore, setEuriborErrore]           = useState<string | null>(null);

  // Rinegoziazioni
  const [rinegoziazioni, setRinegoziazioni]         = useState<RinegoziazioneMutuo[]>(
    initialData?.loanDetails?.rinegoziazioni || []
  );
  const [showAddRinegoziazione, setShowRinegoziazione] = useState(false);
  const [nuovaRineg, setNuovaRineg]                 = useState<Partial<RinegoziazioneMutuo>>({
    nuovoTipoTasso: 'FIXED', nuovoTasso: 0, spread: 1.5, dataInizio: ''
  });

  // Sync Category when Type or ExpenseType changes
  useEffect(() => {
    let validCategories: string[] = [];
    if (type === TransactionType.INCOME) {
        validCategories = incomeCategories;
    } else {
        validCategories = expenseType === 'FIXED' ? fixedCategories : variableCategories;
    }

    if (!validCategories.includes(category) && !initialData) {
        setCategory(validCategories[0]);
    } else if (!validCategories.includes(category) && initialData) {
        const initialIsFixed = fixedCategories.includes(initialData.category);
        const currentIsFixed = expenseType === 'FIXED';
        
        if (type !== initialData.type) {
             setCategory(validCategories[0]);
        } else if (type === TransactionType.EXPENSE && initialIsFixed !== currentIsFixed) {
             setCategory(validCategories[0]);
        }
    }
  }, [type, expenseType, fixedCategories, variableCategories, incomeCategories, category, initialData]);

  // Suggerimento automatico IVA quando cambia la categoria
  useEffect(() => {
    const aliquota = suggerisciAliquotaIVADaCategoria(category);
    if (aliquota !== null) {
      setVatRate(aliquota.toString());
    }
  }, [category]);

  const cercaEuribor = async () => {
    setLoadingEuribor(true);
    setEuriborErrore(null);
    try {
      const parsed = await fetchEuriborRates();
      if (parsed) {
        setEuriborData({
          'Euribor 1M':  parsed.euribor_1m,
          'Euribor 3M':  parsed.euribor_3m,
          'Euribor 6M':  parsed.euribor_6m,
          'Euribor 12M': parsed.euribor_12m,
          '_data': parsed.data_aggiornamento,
        });
        // Aggiorna automaticamente il tasso con indice + spread
        const key = `euribor_${indiceDiRif.toLowerCase().replace('euribor ', '')}`;
        const valoreIndice = (parsed as any)[key];
        if (valoreIndice !== undefined && valoreIndice !== null && spread) {
          const tassoTotale = (valoreIndice + parseFloat(spread)).toFixed(3);
          setLoanInterestRate(tassoTotale);
        }
      } else {
        throw new Error('Formato risposta non valido');
      }
    } catch (e) {
      setEuriborErrore('Impossibile recuperare i tassi. Inserisci manualmente.');
    }
    setLoadingEuribor(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !description) return;

    let finalDescription = description;
    
    if (type === TransactionType.INCOME && clientName.trim()) {
        finalDescription = `${clientName.trim()} - ${description}`;
    }

    if (invoiceRef.trim()) {
        finalDescription = `${finalDescription} (Rif. ${invoiceRef.trim()})`;
    }

    // Build Loan Details object if category is Finanziamenti
    let loanDetails: LoanDetails | undefined = undefined;
    if (type === TransactionType.INCOME && category === '[FINANZA] Finanziamenti Ricevuti') {
        loanDetails = {
          interestRate: parseFloat(loanInterestRate) || 0,
          rateType: loanRateType,
          spread: loanRateType === 'VARIABLE' ? parseFloat(spread) || undefined : undefined,
          indiceDiRiferimento: loanRateType === 'VARIABLE' ? indiceDiRif : undefined,
          interestStartDate: loanInterestStart,
          principalStartDate: loanPrincipalStart,
          endDate: loanEndDate,
          rinegoziazioni: rinegoziazioni.length > 0 ? rinegoziazioni : undefined,
        };
    }

    const baseData = {
      amount: parseFloat(amount),
      vatRate: parseFloat(vatRate),
      type,
      category,
      description: finalDescription,
      project,
      isForecast,
      loanDetails, // Include new field
      invoiceDate: invoiceDate || undefined
    };

    if (applyToAllMonths && isForecast && !initialData) {
        const parts = date.split('-');
        const year = parseInt(parts[0], 10);
        const day = parseInt(parts[2], 10);

        for (let i = 0; i < 12; i++) {
            const daysInMonth = new Date(year, i + 1, 0).getDate();
            const safeDay = Math.min(day, daysInMonth);

            const mStr = String(i + 1).padStart(2, '0');
            const dStr = String(safeDay).padStart(2, '0');
            const dateStr = `${year}-${mStr}-${dStr}`;

            onSave({
                ...baseData,
                date: dateStr
            });
        }
    } else {
        onSave({
            ...baseData,
            date
        });
    }
  };

  const handleAISuggest = async () => {
    if (!description) return;
    setIsSuggesting(true);
    const suggested = await suggestCategory(description, type);
    if (suggested) {
      setCategory(suggested);
      if (fixedCategories.includes(suggested)) setExpenseType('FIXED');
      if (variableCategories.includes(suggested)) setExpenseType('VARIABLE');
    }
    setIsSuggesting(false);
  };

  const numAmount = parseFloat(amount) || 0;
  const numVat = parseFloat(vatRate) || 0;
  const grossAmount = numAmount * (1 + numVat / 100);
  const suggestedSuppliers = supplierPresets[category] || [];

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-lg mx-auto animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-slate-800">
          {initialData ? 'Modifica Transazione' : 'Nuova Transazione'}
        </h2>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={24} />
        </button>
      </div>

      {/* Type Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
        <button
          type="button"
          onClick={() => setType(TransactionType.EXPENSE)}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            type === TransactionType.EXPENSE 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Uscita
        </button>
        <button
          type="button"
          onClick={() => setType(TransactionType.INCOME)}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
            type === TransactionType.INCOME 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Entrata
        </button>
      </div>

      {/* Expense Type Selector */}
      {type === TransactionType.EXPENSE && (
          <div className="flex gap-4 mb-6 px-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${expenseType === 'FIXED' ? 'border-slate-900' : 'border-slate-300'}`}>
                      {expenseType === 'FIXED' && <div className="w-2 h-2 rounded-full bg-slate-900"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={expenseType === 'FIXED'} onChange={() => setExpenseType('FIXED')} />
                  <span className={`text-sm font-medium ${expenseType === 'FIXED' ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>Costi Fissi</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${expenseType === 'VARIABLE' ? 'border-slate-900' : 'border-slate-300'}`}>
                      {expenseType === 'VARIABLE' && <div className="w-2 h-2 rounded-full bg-slate-900"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={expenseType === 'VARIABLE'} onChange={() => setExpenseType('VARIABLE')} />
                  <span className={`text-sm font-medium ${expenseType === 'VARIABLE' ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>Costi Variabili</span>
              </label>
          </div>
      )}

      <div className="space-y-4">
        {/* Forecast Options */}
        <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
                <input
                    type="checkbox"
                    id="isForecast"
                    checked={isForecast}
                    onChange={(e) => setIsForecast(e.target.checked)}
                    className="w-4 h-4 text-slate-900 rounded focus:ring-slate-500 cursor-pointer"
                />
                <label htmlFor="isForecast" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                    Segna come Previsione (Budget)
                </label>
            </div>

            {isForecast && !initialData && (
                <div className="ml-7 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                    <input
                        type="checkbox"
                        id="applyAll"
                        checked={applyToAllMonths}
                        onChange={(e) => setApplyToAllMonths(e.target.checked)}
                        className="w-3.5 h-3.5 text-slate-900 rounded focus:ring-slate-500 cursor-pointer border-slate-300"
                    />
                    <label htmlFor="applyAll" className="text-xs font-medium text-slate-600 cursor-pointer select-none flex items-center gap-1">
                        <CalendarRange size={12} />
                        Applica a tutti i mesi dell'anno
                    </label>
                </div>
            )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{category === '[FINANZA] Finanziamenti Ricevuti' && type === TransactionType.INCOME ? 'Capitale Prestato (€)' : 'Imponibile (€)'}</label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-lg font-mono"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Aliquota IVA</label>
            <div className="relative">
              <Percent className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white appearance-none h-[46px]"
              >
                <option value="0">0% (Esente/Minimi)</option>
                <option value="4">4%</option>
                <option value="10">10%</option>
                <option value="22">22%</option>
              </select>
            </div>
          </div>
        </div>

        {amount && (
            <div className="flex justify-end text-sm text-slate-500">
                <span>Totale Ivato: </span>
                <span className="font-bold text-slate-800 ml-2">{CURRENCY_FORMATTER.format(grossAmount)}</span>
            </div>
        )}

        {/* --- LOAN DETAILS SECTION (Specific for Finanziamenti) --- */}
        {type === TransactionType.INCOME && category === '[FINANZA] Finanziamenti Ricevuti' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3 animate-in fade-in duration-300">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-200 pb-2 mb-2">
                    <Landmark size={16} />
                    Dettagli Finanziamento Bancario
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Interesse (%)</label>
                        <input
                            type="number"
                            step="0.01"
                            value={loanInterestRate}
                            onChange={(e) => setLoanInterestRate(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm focus:border-slate-500 outline-none"
                            placeholder="es. 4.5"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Tipo Tasso</label>
                        <select 
                            value={loanRateType}
                            onChange={(e) => setLoanRateType(e.target.value as 'FIXED' | 'VARIABLE')}
                            className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm bg-white focus:border-slate-500 outline-none"
                        >
                            <option value="FIXED">Fisso</option>
                            <option value="VARIABLE">Variabile</option>
                        </select>
                    </div>
                </div>

                {/* ── SEZIONE TASSO VARIABILE ── */}
                {loanRateType === 'VARIABLE' && (
                  <div className="space-y-3 pt-2 border-t border-slate-200 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase font-bold text-slate-600">
                        Indice di riferimento
                      </label>
                      <button
                        type="button"
                        onClick={cercaEuribor}
                        disabled={loadingEuribor}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-[10px] font-black hover:bg-blue-100 transition-colors disabled:opacity-50"
                      >
                        {loadingEuribor
                          ? <><Loader2 size={11} className="animate-spin" /> Ricerca...</>
                          : <><Search size={11} /> Cerca tassi live</>
                        }
                      </button>
                    </div>

                    {/* Selezione indice */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {['Euribor 1M', 'Euribor 3M', 'Euribor 6M', 'Euribor 12M'].map(idx => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setIndiceDiRif(idx);
                            // Aggiorna tasso se abbiamo già i dati
                            if (euriborData[idx] !== undefined && euriborData[idx] !== null) {
                              setLoanInterestRate((euriborData[idx]! + parseFloat(spread || '0')).toFixed(3));
                            }
                          }}
                          className={`py-2 rounded-lg text-[10px] font-black border transition-all ${
                            indiceDiRif === idx
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <div>{idx.replace('Euribor ', '')}</div>
                          {euriborData[idx] !== undefined && (
                            <div className={`text-[9px] mt-0.5 font-mono ${euriborData[idx] !== null ? 'text-blue-600' : 'text-slate-300'}`}>
                              {euriborData[idx] !== null ? `${euriborData[idx]!.toFixed(3)}%` : 'n.d.'}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Spread */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                          Spread bancario (%)
                        </label>
                        <input
                          type="number" step="0.01" min="0"
                          value={spread}
                          onChange={e => {
                            setSpread(e.target.value);
                            if (euriborData[indiceDiRif] !== undefined && euriborData[indiceDiRif] !== null) {
                              setLoanInterestRate((euriborData[indiceDiRif]! + parseFloat(e.target.value || '0')).toFixed(3));
                            }
                          }}
                          className="w-full px-2 py-1.5 rounded border border-slate-200 text-sm focus:border-slate-500 outline-none"
                          placeholder="es. 1.50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">
                          Tasso totale applicato (%)
                        </label>
                        <input
                          type="number" step="0.001"
                          value={loanInterestRate}
                          onChange={e => setLoanInterestRate(e.target.value)}
                          className="w-full px-2 py-1.5 rounded border border-emerald-300 bg-emerald-50 text-sm font-bold text-emerald-800 focus:border-emerald-500 outline-none"
                          placeholder="es. 4.234"
                        />
                      </div>
                    </div>

                    {/* Data aggiornamento Euribor */}
                    {euriborData['_data'] && (
                      <p className="text-[9px] text-blue-400 italic">
                        Tassi aggiornati al {euriborData['_data']}
                      </p>
                    )}
                    {euriborErrore && (
                      <p className="text-[9px] text-red-500">{euriborErrore}</p>
                    )}
                  </div>
                )}

                {/* ── SEZIONE RINEGOZIAZIONI ── */}
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-slate-600 flex items-center gap-1.5">
                      <RefreshCw size={11} />
                      Rinegoziazioni
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowRinegoziazione(!showAddRinegoziazione)}
                      className="text-[9px] font-black text-slate-500 hover:text-slate-800 px-2 py-1 bg-slate-100 rounded-lg"
                    >
                      {showAddRinegoziazione ? '− Chiudi' : '+ Aggiungi rinegoziazione'}
                    </button>
                  </div>

                  {/* Lista rinegoziazioni esistenti */}
                  {rinegoziazioni.length > 0 && (
                    <div className="space-y-1.5">
                      {rinegoziazioni
                        .sort((a, b) => a.dataInizio.localeCompare(b.dataInizio))
                        .map((r, i) => (
                          <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <div>
                              <span className="text-[10px] font-black text-amber-800">
                                Dal {new Date(r.dataInizio).toLocaleDateString('it-IT')}
                              </span>
                              <span className="text-[10px] text-amber-600 ml-2">
                                → {r.nuovoTasso}%
                                {r.nuovoTipoTasso === 'VARIABLE' && r.spread ? ` (${r.indiceDiRiferimento} + ${r.spread}%)` : ''}
                                {' '}({r.nuovoTipoTasso === 'FIXED' ? 'Fisso' : 'Variabile'})
                              </span>
                              {r.note && <p className="text-[9px] text-amber-500 mt-0.5">{r.note}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => setRinegoziazioni(prev => prev.filter((_, j) => j !== i))}
                              className="text-amber-400 hover:text-red-500 ml-2"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Form nuova rinegoziazione */}
                  {showAddRinegoziazione && (
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 space-y-2 animate-in fade-in duration-200">
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">
                        Nuova rinegoziazione
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-amber-600 mb-1">Data decorrenza</label>
                          <input
                            type="date"
                            value={nuovaRineg.dataInizio || ''}
                            onChange={e => setNuovaRineg(prev => ({ ...prev, dataInizio: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs bg-white focus:border-amber-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-amber-600 mb-1">Tipo nuovo tasso</label>
                          <select
                            value={nuovaRineg.nuovoTipoTasso}
                            onChange={e => setNuovaRineg(prev => ({ ...prev, nuovoTipoTasso: e.target.value as 'FIXED' | 'VARIABLE' }))}
                            className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs bg-white focus:border-amber-400 outline-none"
                          >
                            <option value="FIXED">Fisso</option>
                            <option value="VARIABLE">Variabile</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[9px] uppercase font-bold text-amber-600 mb-1">
                            {nuovaRineg.nuovoTipoTasso === 'VARIABLE' ? 'Tasso attuale (indice + spread)' : 'Nuovo tasso fisso'} (%)
                          </label>
                          <input
                            type="number" step="0.001" min="0"
                            value={nuovaRineg.nuovoTasso || ''}
                            onChange={e => setNuovaRineg(prev => ({ ...prev, nuovoTasso: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs bg-white focus:border-amber-400 outline-none"
                            placeholder="es. 3.750"
                          />
                        </div>
                        {nuovaRineg.nuovoTipoTasso === 'VARIABLE' && (
                          <div>
                            <label className="block text-[9px] uppercase font-bold text-amber-600 mb-1">Indice di riferimento</label>
                            <select
                              value={nuovaRineg.indiceDiRiferimento || 'Euribor 3M'}
                              onChange={e => setNuovaRineg(prev => ({ ...prev, indiceDiRiferimento: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs bg-white focus:border-amber-400 outline-none"
                            >
                              <option>Euribor 1M</option>
                              <option>Euribor 3M</option>
                              <option>Euribor 6M</option>
                              <option>Euribor 12M</option>
                            </select>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[9px] uppercase font-bold text-amber-600 mb-1">Note (opzionale)</label>
                        <input
                          type="text"
                          value={nuovaRineg.note || ''}
                          onChange={e => setNuovaRineg(prev => ({ ...prev, note: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded border border-amber-200 text-xs bg-white focus:border-amber-400 outline-none"
                          placeholder="es. Rinegoziazione Banca Intesa — da variabile a fisso"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={!nuovaRineg.dataInizio || !nuovaRineg.nuovoTasso}
                        onClick={() => {
                          if (!nuovaRineg.dataInizio || !nuovaRineg.nuovoTasso) return;
                          setRinegoziazioni(prev => [...prev, nuovaRineg as RinegoziazioneMutuo]);
                          setNuovaRineg({ nuovoTipoTasso: 'FIXED', nuovoTasso: 0, spread: 1.5, dataInizio: '' });
                          setShowRinegoziazione(false);
                        }}
                        className="w-full py-2 bg-amber-500 text-white text-xs font-black rounded-lg disabled:opacity-40 hover:bg-amber-600 transition-colors"
                      >
                        Aggiungi rinegoziazione
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                         <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Inizio Interessi</label>
                         <div className="relative">
                            <Calendar size={12} className="absolute left-2 top-2 text-slate-300" />
                            <input
                                type="date"
                                value={loanInterestStart}
                                onChange={(e) => setLoanInterestStart(e.target.value)}
                                className="w-full pl-6 pr-2 py-1.5 rounded border border-slate-200 text-xs focus:border-slate-500 outline-none"
                            />
                         </div>
                    </div>
                    <div>
                         <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Inizio Rate (Capitale)</label>
                         <div className="relative">
                            <Calendar size={12} className="absolute left-2 top-2 text-slate-300" />
                            <input
                                type="date"
                                value={loanPrincipalStart}
                                onChange={(e) => setLoanPrincipalStart(e.target.value)}
                                className="w-full pl-6 pr-2 py-1.5 rounded border border-slate-200 text-xs focus:border-slate-500 outline-none"
                            />
                         </div>
                    </div>
                </div>

                <div>
                     <label className="block text-[10px] uppercase font-bold text-slate-600 mb-1">Data Estinzione / Fine</label>
                     <div className="relative">
                        <Calendar size={12} className="absolute left-2 top-2 text-slate-300" />
                        <input
                            type="date"
                            value={loanEndDate}
                            onChange={(e) => setLoanEndDate(e.target.value)}
                            className="w-full pl-6 pr-2 py-1.5 rounded border border-slate-200 text-xs focus:border-slate-500 outline-none"
                        />
                     </div>
                </div>
                
                <p className="text-[10px] text-slate-500 italic flex items-center gap-1">
                    <Info size={12} />
                    Le rate verranno proiettate automaticamente nelle Uscite.
                </p>
            </div>
        )}

        <div className="grid grid-cols-2 gap-4">
            <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Data Op.</label>
            <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
            />
            </div>

            {/* Mostra solo per entrate di tipo ricavo */}
            {type === TransactionType.INCOME && (
              <div className="space-y-2 col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <CalendarRange size={14} className="text-slate-500" />
                  Data Fattura
                  <span className="ml-2 text-slate-400 font-normal normal-case">(per CE competenza — opzionale)</span>
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-500"
                />
                <p className="text-[10px] text-slate-400">
                  Se diversa dalla data incasso — es. SAL emesso a dicembre incassato a febbraio.
                </p>
              </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Riferimento</label>
                <div className="relative">
                    <FileText className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                        type="text"
                        value={invoiceRef}
                        onChange={(e) => setInvoiceRef(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                        placeholder="n. 123"
                    />
                </div>
            </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between">
              <span>Categoria</span>
              {type === TransactionType.EXPENSE && (
                  <span className="text-[10px] text-slate-400 uppercase tracking-wide self-end">
                      {expenseType === 'FIXED' ? 'Lista Costi Fissi' : 'Lista Costi Variabili'}
                  </span>
              )}
          </label>
          <div className="relative">
            <Layers className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white appearance-none"
            >
                {type === TransactionType.EXPENSE ? (
                    expenseType === 'FIXED' ? (
                        fixedCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                    ) : (
                        variableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)
                    )
                ) : (
                    incomeCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))
                )}
            </select>
          </div>
        </div>

        {type === TransactionType.INCOME && (
             <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Cliente / Banca</label>
                <div className="relative">
                    <User className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                        placeholder="es. Banca Intesa"
                    />
                </div>
            </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Descrizione / Fornitore</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              list="suppliers-list"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              placeholder={suggestedSuppliers.length > 0 ? `es. ${suggestedSuppliers[0]}` : "es. Fattura acconto"}
            />
            {suggestedSuppliers.length > 0 && (
              <datalist id="suppliers-list">
                {suggestedSuppliers.map((s, i) => (
                  <option key={i} value={s} />
                ))}
              </datalist>
            )}
            <button
              type="button"
              onClick={handleAISuggest}
              disabled={!description || isSuggesting}
              className="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
              title="Suggerisci categoria con AI"
            >
              {isSuggesting ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Commessa (Opzionale)</label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-2.5 text-slate-400" size={18} />
            {availableProjects.length > 0 ? (
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white appearance-none"
              >
                <option value="">-- Seleziona Commessa --</option>
                <option value="Altra tipologia di entrata">Altra tipologia di entrata</option>
                {availableProjects.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                placeholder="es. Progetto Alpha"
              />
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <button
          type="submit"
          className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
        >
          <Save size={18} />
          {applyToAllMonths && isForecast && !initialData ? 'Salva Tutto (12 Mesi)' : 'Salva Transazione'}
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;