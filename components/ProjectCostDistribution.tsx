import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import { CURRENCY_FORMATTER } from '../constants';
import { CalendarClock, Save, X, Edit, HardHat, Hammer, Truck, Users, ArrowRight, Shield } from 'lucide-react';

interface ProjectCostDistributionProps {
  projects: Project[];
  onUpdateProject: (project: Project) => void;
  isAuthorized?: boolean;
}

interface CostCell {
  labor: number;
  mat: number;
  sub: number;
  prof: number;
}

const ProjectCostDistribution: React.FC<ProjectCostDistributionProps> = ({ projects, onUpdateProject, isAuthorized = false }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [estDate, setEstDate] = useState('');
  const [estLabor, setEstLabor] = useState('');
  const [estLaborType, setEstLaborType] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL'); // New State
  const [estMaterials, setEstMaterials] = useState('');
  const [estSub, setEstSub] = useState('');
  const [estProf, setEstProf] = useState('');

  const activeProjects = projects.filter(p => p.status === 'ACTIVE' && p.name !== 'Altra tipologia di entrata');

  // --- LOGIC: GENERATE TIMELINE DATA ---
  const timelineData = useMemo<{
    months: Date[];
    data: Record<string, Record<string, CostCell>>;
  }>(() => {
    if (activeProjects.length === 0) return { months: [], data: {} };

    // 1. Determine Global Date Range
    let minDate = new Date();
    let maxDate = new Date();
    let hasEstimates = false;

    activeProjects.forEach(p => {
        if (p.estimatedStartDate) {
            hasEstimates = true;
            const start = new Date(p.estimatedStartDate);
            
            // Profs start 2 months before
            const profStart = new Date(start);
            profStart.setMonth(start.getMonth() - 2);
            if (profStart < minDate) minDate = profStart;

            // Subs end 18 months after start (6 months initial + 12 months subs)
            const end = new Date(start);
            end.setMonth(start.getMonth() + 18);
            if (end > maxDate) maxDate = end;
        }
    });

    if (!hasEstimates) return { months: [], data: {} };

    // 2. Generate Month Headers
    const months: Date[] = [];
    const curr = new Date(minDate);
    curr.setDate(1); // Normalize
    
    while (curr <= maxDate) {
        months.push(new Date(curr));
        curr.setMonth(curr.getMonth() + 1);
    }

    // 3. Distribute Costs per Project
    const data: Record<string, Record<string, CostCell>> = {};

    activeProjects.forEach(p => {
        if (!p.estimatedStartDate) return;
        
        data[p.id] = {};
        const start = new Date(p.estimatedStartDate);
        start.setDate(1);

        // A. Professionals: 2 months BEFORE start
        const profMonthly = (p.estimatedProfessionals || 0) / 2;
        if (profMonthly > 0) {
            for (let i = 2; i > 0; i--) {
                const d = new Date(start);
                d.setMonth(start.getMonth() - i);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                if (!data[p.id][key]) data[p.id][key] = { labor: 0, mat: 0, sub: 0, prof: 0 };
                data[p.id][key].prof += profMonthly;
            }
        }

        // B. Labor & Materials: First 6 months (Start -> Start + 5)
        const laborMonthly = (p.estimatedLabor || 0) / 6;
        const matMonthly = (p.estimatedMaterials || 0) / 6;
        if (laborMonthly > 0 || matMonthly > 0) {
            for (let i = 0; i < 6; i++) {
                const d = new Date(start);
                d.setMonth(start.getMonth() + i);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                if (!data[p.id][key]) data[p.id][key] = { labor: 0, mat: 0, sub: 0, prof: 0 };
                data[p.id][key].labor += laborMonthly;
                data[p.id][key].mat += matMonthly;
            }
        }

        // C. Subcontractors: Next 12 months (Start + 6 -> Start + 17)
        const subMonthly = (p.estimatedSubcontractors || 0) / 12;
        if (subMonthly > 0) {
            for (let i = 6; i < 18; i++) {
                const d = new Date(start);
                d.setMonth(start.getMonth() + i);
                const key = `${d.getFullYear()}-${d.getMonth()}`;
                if (!data[p.id][key]) data[p.id][key] = { labor: 0, mat: 0, sub: 0, prof: 0 };
                data[p.id][key].sub += subMonthly;
            }
        }
    });

    return { months, data };
  }, [activeProjects]);


  // Handlers
  const handleEditClick = (p: Project) => {
      setEstDate(p.estimatedStartDate || '');
      setEstLabor(p.estimatedLabor?.toString() || '');
      setEstLaborType(p.laborType || 'INTERNAL'); // Load saved type or default
      setEstMaterials(p.estimatedMaterials?.toString() || '');
      setEstSub(p.estimatedSubcontractors?.toString() || '');
      setEstProf(p.estimatedProfessionals?.toString() || '');
      setEditingId(p.id);
  };

  const handleSave = () => {
      if (!editingId) return;
      const projectToUpdate = projects.find(p => p.id === editingId);
      if (projectToUpdate) {
          onUpdateProject({
              ...projectToUpdate,
              estimatedStartDate: estDate,
              estimatedLabor: parseFloat(estLabor) || 0,
              laborType: estLaborType, // Save type
              estimatedMaterials: parseFloat(estMaterials) || 0,
              estimatedSubcontractors: parseFloat(estSub) || 0,
              estimatedProfessionals: parseFloat(estProf) || 0,
          });
      }
      setEditingId(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-800">Distribuzione Costi Commesse</h2>
                <span className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wide">Pianificazione</span>
            </div>

            {!isAuthorized && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-slate-600 text-sm animate-pulse">
                    <Shield size={16} />
                    <span>Sblocca il lucchetto in alto per abilitare l'editing</span>
                </div>
            )}
        </div>

        {/* --- EDIT MODAL --- */}
        {editingId && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <Edit size={20} className="text-slate-600" />
                            Stima Costi: {projects.find(p => p.id === editingId)?.name}
                        </h3>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Inizio Lavori Presunta</label>
                            <input type="date" value={estDate} onChange={e => setEstDate(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-slate-500" />
                            <p className="text-[10px] text-slate-400 mt-1">Questa data serve da riferimento per distribuire i costi nel tempo.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Users size={14} /> Costo Professionisti</label>
                            <input type="number" step="0.01" value={estProf} onChange={e => setEstProf(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500" placeholder="0.00" />
                            <p className="text-[10px] text-slate-500 mt-1 font-medium">Distribuito nei 2 mesi prec. inizio</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><HardHat size={14} /> Costo Manodopera</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={estLabor} 
                                    onChange={e => setEstLabor(e.target.value)} 
                                    className="w-2/3 border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500" 
                                    placeholder="0.00" 
                                />
                                <select 
                                    value={estLaborType} 
                                    onChange={e => setEstLaborType(e.target.value as 'INTERNAL' | 'EXTERNAL')}
                                    className="w-1/3 border border-slate-300 rounded-lg p-2 text-xs font-medium bg-slate-50 focus:border-slate-500 outline-none"
                                >
                                    <option value="INTERNAL">Interna</option>
                                    <option value="EXTERNAL">Esterna</option>
                                </select>
                            </div>
                            <p className="text-[10px] text-slate-600 mt-1 font-medium">Distribuito nei primi 6 mesi</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Hammer size={14} /> Costo Materiali</label>
                            <input type="number" step="0.01" value={estMaterials} onChange={e => setEstMaterials(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500" placeholder="0.00" />
                            <p className="text-[10px] text-slate-700 mt-1 font-medium">Distribuito nei primi 6 mesi</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><Truck size={14} /> Costo Subappalti</label>
                            <input type="number" step="0.01" value={estSub} onChange={e => setEstSub(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500" placeholder="0.00" />
                            <p className="text-[10px] text-slate-800 mt-1 font-medium">Distribuito nei mesi 7-18</p>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button onClick={handleSave} className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
                            <Save size={18} /> Salva Stime
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- PROJECT LIST --- */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Commesse Attive</h3>
                {activeProjects.length === 0 ? (
                    <div className="p-4 bg-white rounded-lg border border-slate-200 text-slate-400 text-sm italic">
                        Nessuna commessa attiva.
                    </div>
                ) : (
                    activeProjects.map(p => {
                        const totalEst = (p.estimatedLabor || 0) + (p.estimatedMaterials || 0) + (p.estimatedSubcontractors || 0) + (p.estimatedProfessionals || 0);
                        const hasData = !!p.estimatedStartDate;

                        return (
                            <div key={p.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-slate-400 transition-all group">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-slate-800 text-sm truncate w-3/4" title={p.name}>{p.name}</h4>
                                    {isAuthorized && (
                                        <button onClick={() => handleEditClick(p)} className="text-slate-300 hover:text-slate-900 transition-colors">
                                            <Edit size={16} />
                                        </button>
                                    )}
                                </div>
                                
                                {hasData ? (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>Inizio:</span>
                                            <span className="font-mono font-medium">{new Date(p.estimatedStartDate!).toLocaleDateString('it-IT')}</span>
                                        </div>
                                        <div className="flex justify-between text-xs text-slate-500">
                                            <span>Totale Stima:</span>
                                            <span className="font-mono font-bold text-slate-700">{CURRENCY_FORMATTER.format(totalEst)}</span>
                                        </div>
                                        
                                        {/* Labor Type Badge */}
                                        <div className="flex justify-between text-[10px] text-slate-400 pt-1">
                                            <span>Manodopera:</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.laborType === 'EXTERNAL' ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-700'}`}>
                                                {p.laborType === 'EXTERNAL' ? 'Esterna' : 'Interna'}
                                            </span>
                                        </div>

                                        <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden flex">
                                            <div className="h-full bg-slate-400" style={{width: `${(p.estimatedProfessionals||0)/totalEst*100}%`}}></div>
                                            <div className="h-full bg-slate-500" style={{width: `${(p.estimatedLabor||0)/totalEst*100}%`}}></div>
                                            <div className="h-full bg-slate-600" style={{width: `${(p.estimatedMaterials||0)/totalEst*100}%`}}></div>
                                            <div className="h-full bg-slate-700" style={{width: `${(p.estimatedSubcontractors||0)/totalEst*100}%`}}></div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-2">
                                        {isAuthorized ? (
                                            <button onClick={() => handleEditClick(p)} className="text-xs text-slate-900 font-medium hover:underline flex items-center justify-center gap-1 w-full">
                                                Inserisci Stime <ArrowRight size={12} />
                                            </button>
                                        ) : (
                                             <span className="text-xs text-slate-400 italic">Dati non inseriti</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* --- TIMELINE VISUALIZATION --- */}
            <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden min-h-[500px]">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <CalendarClock size={18} className="text-slate-600" />
                        Timeline Distribuzione Costi
                    </h3>
                    <div className="flex gap-3 text-[10px] font-medium">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400"></span>Professionisti (-2m)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500"></span>Manodopera (6m)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600"></span>Materiali (6m)</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-700"></span>Subappalti (12m succ.)</span>
                    </div>
                </div>

                <div className="overflow-x-auto flex-1">
                    {timelineData.months.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-10">
                            <CalendarClock size={48} className="mb-4 opacity-20" />
                            <p>Inserisci una data di inizio e dei costi stimati per visualizzare la distribuzione.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse min-w-max">
                            <thead className="text-xs uppercase bg-slate-50 text-slate-500 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 font-semibold border-r border-slate-200 min-w-[200px] sticky left-0 bg-slate-50 z-20">Commessa</th>
                                    {timelineData.months.map(m => (
                                        <th key={m.getTime()} className="px-2 py-2 border-r border-slate-200 text-center min-w-[100px]">
                                            {m.toLocaleString('it-IT', { month: 'short', year: '2-digit' })}
                                        </th>
                                    ))}
                                    <th className="px-2 py-2 text-center min-w-[120px] font-bold bg-slate-100">Totale</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs divide-y divide-slate-100">
                                {activeProjects.filter(p => !!p.estimatedStartDate).map(p => {
                                    // FORCE CAST: Explicitly tell TS the type of pData
                                    const pData = timelineData.data[p.id] as Record<string, CostCell> | undefined;
                                    if (!pData) return null;

                                    const totalRow = Object.values(pData).reduce((acc: number, v: CostCell) => acc + v.labor + v.mat + v.sub + v.prof, 0);

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-4 py-3 font-medium text-slate-800 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                                <div className="truncate w-[180px]" title={p.name}>{p.name}</div>
                                                <div className="text-[9px] text-slate-400 mt-0.5">Start: {new Date(p.estimatedStartDate!).toLocaleDateString()}</div>
                                            </td>
                                            {timelineData.months.map(m => {
                                                const key = `${m.getFullYear()}-${m.getMonth()}`;
                                                // FORCE CAST: Explicitly type cellData
                                                const cellData = pData[key] as CostCell | undefined;
                                                
                                                if (!cellData) return <td key={key} className="border-r border-slate-100"></td>;

                                                const totalCell = cellData.labor + cellData.mat + cellData.sub + cellData.prof;

                                                return (
                                                    <td key={key} className="px-1 py-2 border-r border-slate-100 text-center align-top">
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="font-mono font-bold text-slate-700 mb-1">{CURRENCY_FORMATTER.format(totalCell)}</span>
                                                            <div className="flex h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                {cellData.prof > 0 && <div className="h-full bg-slate-400" style={{width: `${(cellData.prof/totalCell)*100}%`}} title={`Prof: ${CURRENCY_FORMATTER.format(cellData.prof)}`}></div>}
                                                                {cellData.labor > 0 && <div className="h-full bg-slate-500" style={{width: `${(cellData.labor/totalCell)*100}%`}} title={`Mano: ${CURRENCY_FORMATTER.format(cellData.labor)}`}></div>}
                                                                {cellData.mat > 0 && <div className="h-full bg-slate-600" style={{width: `${(cellData.mat/totalCell)*100}%`}} title={`Mat: ${CURRENCY_FORMATTER.format(cellData.mat)}`}></div>}
                                                                {cellData.sub > 0 && <div className="h-full bg-slate-700" style={{width: `${(cellData.sub/totalCell)*100}%`}} title={`Sub: ${CURRENCY_FORMATTER.format(cellData.sub)}`}></div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-3 text-center font-mono font-bold text-slate-900 bg-slate-50 border-l border-slate-200">
                                                {CURRENCY_FORMATTER.format(totalRow)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default ProjectCostDistribution;