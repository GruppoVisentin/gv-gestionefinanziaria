import { Transaction, CEData, SPSnapshot, BudgetData, RimanenzeAnno } from '../types';

// ─── AGGREGAZIONE MENSILE ────────────────────────────────────────

export const aggregateByMonthAndType = (
  transactions: Transaction[],
  anno: number,
  modalita: 'cassa' | 'competenza' = 'cassa'
): Record<string, number[]> => {
  // Inizializza 12 mesi a zero per ogni ceType
  const result: Record<string, number[]> = {};
  const ceTypes = [
    'ricavo_core', 'ricavo_altro', 'ricavo_immobiliare',
    'costo_variabile', 'costo_fisso',
    'costo_studio', 'ammortamento', 'onere_finanziario', 'provento_finanziario',
    'imposta_ce', 'solo_cashflow', 'capex', 'straordinario', 'distribuzione_utile'
  ];
  ceTypes.forEach(t => result[t] = Array(12).fill(0));

  transactions
    .filter(tx => tx.ceType)
    .forEach(tx => {
      const type = tx.ceType!;
      const isRicavo = type.startsWith('ricavo') ||
        type === 'provento_finanziario' ||
        (type === 'straordinario' && tx.type === 'INCOME');

      // Per competenza: i ricavi usano invoiceDate se disponibile
      // I costi rimangono sempre per cassa (data pagamento)
      let dataRiferimento = tx.date;
      if (modalita === 'competenza' && isRicavo && tx.invoiceDate) {
        dataRiferimento = tx.invoiceDate;
      }

      // Filtra per anno in base alla data di riferimento scelta
      const dataObj = new Date(dataRiferimento);
      if (dataObj.getFullYear() !== anno) return; // potrebbe spostarsi in altro anno

      const month = dataObj.getMonth();
      if (result[type]) {
        result[type][month] += isRicavo ? Math.abs(tx.amount) : -Math.abs(tx.amount);
      }
    });

  return result;
};

// ─── COSTRUZIONE DATI CE ─────────────────────────────────────────

export const buildCEData = (
  transactions: Transaction[],
  anno: number,
  manualOverrides?: Partial<CEData>,
  modalita: 'cassa' | 'competenza' = 'cassa'
): CEData => {
  const agg = aggregateByMonthAndType(transactions, anno, modalita);

  return {
    anno,
    ricaviCore:           manualOverrides?.ricaviCore ?? agg['ricavo_core'],
    ricaviImmobiliare:    manualOverrides?.ricaviImmobiliare ?? agg['ricavo_immobiliare'],
    ricaviAltro:          manualOverrides?.ricaviAltro ?? agg['ricavo_altro'],
    costiVariabili:       manualOverrides?.costiVariabili ?? agg['costo_variabile'].map(v => Math.abs(v)),
    costiFissi:           manualOverrides?.costiFissi ?? agg['costo_fisso'].map(v => Math.abs(v)),
    costiStudio:          manualOverrides?.costiStudio ?? agg['costo_studio'].map(v => Math.abs(v)),
    ammortamenti:         manualOverrides?.ammortamenti ?? 
      (agg['ammortamento'].some(v => v !== 0) 
        ? agg['ammortamento'].map(v => Math.abs(v)) 
        : Array(12).fill(0)),
    oneriFin:             manualOverrides?.oneriFin ?? agg['onere_finanziario'].map(v => Math.abs(v)),
    proventiFin:          manualOverrides?.proventiFin ?? agg['provento_finanziario'].map(v => Math.abs(v)),
    straordinario:        manualOverrides?.straordinario ?? agg['straordinario'],
    imposte:              manualOverrides?.imposte ?? Array(12).fill(0),
    compensoImprenditore: manualOverrides?.compensoImprenditore ?? agg['distribuzione_utile'].map(v => Math.abs(v)),
  };
};

// ─── CALCOLI CE DERIVATI ─────────────────────────────────────────

export const calcCEMetrics = (ce: CEData, transactions: Transaction[] = []) => {
  const sum12 = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const add12 = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
  const sub12 = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);

  const totRicavi       = add12(add12(ce.ricaviCore, ce.ricaviAltro), ce.ricaviImmobiliare);
  const totCostiVar     = ce.costiVariabili;
  const primoMargine    = sub12(totRicavi, totCostiVar);
  
  const totCostiFissiSenzaAmm = add12(ce.costiFissi, ce.costiStudio);
  const ebitda          = sub12(primoMargine, totCostiFissiSenzaAmm); // EBITDA vero
  const ebit            = sub12(ebitda, ce.ammortamenti); // EBIT
  const ebt             = add12(sub12(ebit, ce.oneriFin), ce.proventiFin);
  const utileNetto      = sub12(add12(ebt, ce.straordinario), ce.imposte);

  const fatturato       = sum12(totRicavi);
  const ebitdaTot       = sum12(ebitda);
  const ebitTot         = sum12(ebit);
  const utileNettoTot   = sum12(utileNetto);
  const primoMargineTot = sum12(primoMargine);
  const costiStudioTot  = sum12(ce.costiStudio);
  const costiFissiOperativiTot = sum12(totCostiFissiSenzaAmm);           // SENZA ammortamenti — per incidenze e overhead
  const ammortamentiTot        = sum12(ce.ammortamenti);
  const costiFissiTot          = costiFissiOperativiTot + ammortamentiTot; // CON ammortamenti — solo per break-even contabile

  // Punto di pareggio
  const pctCostiVar = fatturato > 0
    ? sum12(totCostiVar) / fatturato
    : 0;
  const breakEven = (1 - pctCostiVar) > 0
    ? costiFissiTot / (1 - pctCostiVar)
    : 0;

  // Break-even di cassa (nuovo):
  // Costi fissi di cassa = costi fissi operativi SENZA ammortamenti
  // + quota capitale rate finanziamenti (ceType 'capex' categoria '[FINANZA] Quota Capitale Rate Finanziamenti')
  const costiCapitaleRate = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === ce.anno &&
        tx.category === '[FINANZA] Quota Capitale Rate Finanziamenti';
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  const costiFissiCassa = sum12(add12(ce.costiFissi, ce.costiStudio)) + costiCapitaleRate;
  // Nota: ammortamenti esclusi perché non monetari

  const breakEvenCassa = (1 - pctCostiVar) > 0
    ? costiFissiCassa / (1 - pctCostiVar)
    : 0;

  // Proiezioni a fine anno basate su previsionali reali
  const oggi = new Date();
  const isCurrentYear = ce.anno === oggi.getFullYear();
  
  const getForecastSum = (types: string[]) => {
    if (!isCurrentYear) return 0;
    return transactions
      .filter(tx => 
        tx.isForecast && 
        new Date(tx.date).getFullYear() === ce.anno && 
        new Date(tx.date).getMonth() >= oggi.getMonth() &&
        tx.ceType && types.includes(tx.ceType)
      )
      .reduce((s, tx) => {
        const type = tx.ceType!;
        const isIncome = type.startsWith('ricavo') || type === 'provento_finanziario' || (type === 'straordinario' && tx.type === 'INCOME');
        return s + (isIncome ? Math.abs(tx.amount) : -Math.abs(tx.amount));
      }, 0);
  };

  const forecastRicavi = getForecastSum(['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare']);
  const forecastEbitda = getForecastSum(['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso', 'costo_studio']);
  
  // I-2 fix: aggiunto 'ricavo_immobiliare' per includere vendite immobiliari nelle proiezioni EBT
  const forecastEbt = getForecastSum([
    'ricavo_core', 'ricavo_altro', 'ricavo_immobiliare', 'costo_variabile', 'costo_fisso',
    'costo_studio', 'ammortamento', 'onere_finanziario',
    'provento_finanziario', 'straordinario'
  ]);

  // Aliquota fiscale effettiva dall'anno corrente (IRES 24% + IRAP ~3.9% = ~27.9%)
  // Se sono già presenti imposte manuali YTD, usare quelle come riferimento
  const imposteManualiYtd = ce.imposte.reduce((a: number, b: number) => a + b, 0);
  const ebtYtd = sum12(ebt);
  const aliquotaEffettiva = ebtYtd > 0 && imposteManualiYtd > 0
    ? imposteManualiYtd / ebtYtd          // aliquota reale dai dati inseriti
    : 0.279;                               // fallback: IRES 24% + IRAP 3.9%

  const forecastUtile = forecastEbt * (1 - aliquotaEffettiva);

  const mesiTrascorsi = ce.anno < oggi.getFullYear()
    ? 12
    : oggi.getMonth() + 1;

  const ricaviConInvoiceDate = transactions.filter(tx =>
    tx.invoiceDate &&
    new Date(tx.date).getFullYear() === ce.anno &&
    tx.ceType?.startsWith('ricavo')
  ).length;

  const totaleRicavi = transactions.filter(tx =>
    new Date(tx.date).getFullYear() === ce.anno &&
    tx.ceType?.startsWith('ricavo')
  ).length;

  const coperturainvoiceDate = totaleRicavi > 0
    ? ricaviConInvoiceDate / totaleRicavi
    : 0;

  return {
    // Mensili
    totRicavi, totCostiVar, primoMargine,
    ebitda, ebit, ebt, utileNetto,
    ebitArr: ebit,

    // Annuali YTD
    fatturato,
    primoMargineTot,
    primoMarginePercent: fatturato > 0 ? primoMargineTot / fatturato : 0,
    ebitdaTot,
    ebitdaPercent: fatturato > 0 ? ebitdaTot / fatturato : 0,
    ebitTot,
    utileNettoTot,
    utileNettoPercent: fatturato > 0 ? utileNettoTot / fatturato : 0,
    costiStudioTot,
    incidenzaStudio: fatturato > 0 ? costiStudioTot / fatturato : 0,
    costiFissiTot,
    incidenzaFissi: fatturato > 0 ? costiFissiOperativiTot / fatturato : 0,
    breakEven,
    breakEvenCassa,
    costiCapitaleRate,
    compensoImprenditore: sum12(ce.compensoImprenditore),
    oneriFin: sum12(ce.oneriFin),
    proventiFin: sum12(ce.proventiFin),
    straordinario: sum12(ce.straordinario),

    // Proiezioni a fine anno
    proiezioneFatturato:     isCurrentYear ? fatturato + forecastRicavi : fatturato,
    proiezioneEbitda:        isCurrentYear ? ebitdaTot + forecastEbitda : ebitdaTot,
    proiezioneUtile:         isCurrentYear ? utileNettoTot + forecastUtile : utileNettoTot,
    proiezioneBreakEven:     breakEven, 
    mesiTrascorsi,
    aliquotaEffettiva,
    ricaviConInvoiceDate,
    totaleRicavi,
    coperturainvoiceDate,
  };
};

export interface EffettoRimanenze {
  deltaWip: number;               // wipFine - wipInizio (positivo = aumento = ricavo)
  deltaMateriali: number;         // materialiFine - materialiInizio (positivo = aumento = meno costo)
  variazioneRimanenzeNetta: number; // deltaWip + deltaMateriali
  fatturatoCompetenzaRettificato: number; // fatturato cassa + deltaWip
  costiVariabiliRettificati: number;      // costi variabili - deltaMateriali
  utileRettificato: number;               // utile netto + variazioneRimanenzeNetta
  baseImponibileIRES: number;             // approssimazione base IRES
}

export const calcEffettoRimanenze = (
  rimanenze: RimanenzeAnno,
  ceMetrics: ReturnType<typeof calcCEMetrics>
): EffettoRimanenze => {

  const deltaWip = rimanenze.wipFine - rimanenze.wipInizio;
  const deltaMateriali = rimanenze.materialiFine - rimanenze.materialiInizio;
  const variazioneRimanenzeNetta = deltaWip + deltaMateriali;

  // Il deltaWip aumenta il fatturato di competenza
  // (hai prodotto valore non ancora fatturato)
  const fatturatoCompetenzaRettificato = ceMetrics.fatturato + deltaWip;

  // Il deltaMateriali riduce i costi variabili
  // (hai comprato materiali che sono ancora in magazzino, non ancora consumati)
  const costiVariabiliRettificati = ceMetrics.totCostiVar.reduce((a, b) => a + b, 0) - deltaMateriali;

  // Utile rettificato = utile per cassa + effetto rimanenze
  const utileRettificato = ceMetrics.utileNettoTot + variazioneRimanenzeNetta;

  // Base imponibile IRES approssimata
  // (EBIT di competenza — le rimanenze impattano sia ricavi che costi)
  const baseImponibileIRES = ceMetrics.ebitTot + variazioneRimanenzeNetta;

  return {
    deltaWip,
    deltaMateriali,
    variazioneRimanenzeNetta,
    fatturatoCompetenzaRettificato,
    costiVariabiliRettificati,
    utileRettificato,
    baseImponibileIRES,
  };
};

export interface PrevisioneFiscale {
  // BASE IMPONIBILE
  ebitCompetenza: number;              // EBIT + variazione rimanenze
  variazioneRimanenze: number;         // da modulo B
  baseImponibileIRES: number;          // ebitCompetenza (semplificato)
  baseImponibileIRAP: number;          // valore produzione netta (ricavi - costi operativi escluso personale)

  // IMPOSTE STIMATE
  aliquotaIRES: number;                // default 24%
  aliquotaIRAP: number;                // default 3.9% (varia per regione)
  iresStimata: number;
  irapStimata: number;
  totaleImposteStimate: number;

  // ACCONTI
  accontoGiugno: number;               // 40% del totale — scadenza 30 giugno
  accontoNovembre: number;             // 60% del totale — scadenza 30 novembre
  saldoAprilem: number;                // saldo anno precedente — scadenza 30 aprile (anno successivo)

  // CONFRONTO CON IMPOSTE GIÀ VERSATE
  impostePagate: number;               // F24 IRES/IRAP già registrati nel cash flow
  residuoDaVersare: number;            // totaleImposteStimate - impostePagate

  // UTILE NETTO STIMATO DOPO IMPOSTE
  utileDopoImposte: number;

  // META
  anno: number;
  hasRimanenze: boolean;
}

export const calcPrevisioneFiscale = (
  transactions: Transaction[],
  anno: number,
  ceMetrics: ReturnType<typeof calcCEMetrics>,
  rimanenze?: RimanenzeAnno,
  aliquotaIRES: number = 0.24,
  aliquotaIRAP: number = 0.039
): PrevisioneFiscale => {

  // Variazione rimanenze (da modulo B)
  const variazioneRimanenze = rimanenze
    ? (rimanenze.wipFine - rimanenze.wipInizio) +
      (rimanenze.materialiFine - rimanenze.materialiInizio)
    : 0;

  // Base imponibile IRES
  // = EBIT di competenza + variazione rimanenze
  // Nota: semplificazione — il commercialista applica variazioni permanenti/temporanee
  const ebitCompetenza = ceMetrics.ebitTot;
  const baseImponibileIRES = Math.max(0, ebitCompetenza + variazioneRimanenze);

  // Base imponibile IRAP
  // = Valore produzione (ricavi + deltaWIP) - Costi operativi ESCLUSO personale dipendente
  // Formula semplificata: ricavi + deltaWIP - costi variabili no personale - costi fissi no personale
  const deltaWip = rimanenze
    ? rimanenze.wipFine - rimanenze.wipInizio
    : 0;

  const valoreProduzione = ceMetrics.fatturato + deltaWip;

  // Costo del personale dipendente (escluso dall'IRAP)
  const costoPersonaleDipendente = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === anno &&
        !tx.isForecast &&
        (tx.category?.includes('[PERSONALE] Stipendi') ||
         tx.category?.includes('[PERSONALE] Contributi'));
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  // Costi operativi totali (variabili + fissi + studio)
  // Gli ammortamenti sono NON monetari e non deducibili dall'IRAP come costo operativo ordinario:
  // si ricalcolano da transazioni per escluderli dalla base IRAP
  const ammortamentiAnnoIRAP = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === anno &&
        !tx.isForecast &&
        tx.ceType === 'ammortamento';
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  // I compensi agli amministratori (CDA) NON sono deducibili ai fini IRAP
  const compensoAmministratoriIRAP = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === anno &&
        !tx.isForecast &&
        tx.category === '[PERSONALE] Compenso Amministratori';
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  // costiFissiTot include ammortamenti e costi studio (che include compenso amm.)
  const costiFissiSenzaAmmIRAP = ceMetrics.costiFissiTot - ammortamentiAnnoIRAP;

  const costiOperativiTotali =
    ceMetrics.totCostiVar.reduce((a, b) => a + b, 0) +
    costiFissiSenzaAmmIRAP;

  // Base IRAP = valore produzione - (costi operativi - personale dipendente - compensi amministratori)
  // Il personale dipendente e gli amministratori non sono deducibili dall'IRAP in questo modello base
  const costiDeducibiliIRAP = costiOperativiTotali - costoPersonaleDipendente - compensoAmministratoriIRAP;
  const baseImponibileIRAP = Math.max(0, valoreProduzione - costiDeducibiliIRAP);

  // Calcolo imposte
  const iresStimata = baseImponibileIRES * aliquotaIRES;
  const irapStimata = baseImponibileIRAP * aliquotaIRAP;
  const totaleImposteStimate = iresStimata + irapStimata;

  // Acconti
  // Acconto giugno = 40% del totale imposte dell'anno
  // Acconto novembre = 60% del totale imposte dell'anno
  // Saldo aprile anno successivo = differenza tra imposte effettive e acconti versati
  const accontoGiugno   = totaleImposteStimate * 0.40;
  const accontoNovembre = totaleImposteStimate * 0.60;
  const saldoAprilem    = 0; // calcolabile solo a consuntivo anno chiuso

  // Imposte già versate (F24 IRES/IRAP registrati nel cash flow)
  const impostePagate = transactions
    .filter(tx => {
      const d = new Date(tx.date);
      return d.getFullYear() === anno &&
        !tx.isForecast &&
        tx.category === '[FISCO] F24 — IRPEF / IRES / IRAP';
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  const residuoDaVersare = Math.max(0, totaleImposteStimate - impostePagate);

  // Utile netto stimato dopo imposte
  const utileDopoImposte = (ebitCompetenza + variazioneRimanenze) - totaleImposteStimate;

  return {
    ebitCompetenza,
    variazioneRimanenze,
    baseImponibileIRES,
    baseImponibileIRAP,
    aliquotaIRES,
    aliquotaIRAP,
    iresStimata,
    irapStimata,
    totaleImposteStimate,
    accontoGiugno,
    accontoNovembre,
    saldoAprilem,
    impostePagate,
    residuoDaVersare,
    utileDopoImposte,
    anno,
    hasRimanenze: !!rimanenze,
  };
};

// ─── CALCOLI SP DERIVATI ─────────────────────────────────────────

export const calcSPMetrics = (sp: SPSnapshot, ceMetrics: ReturnType<typeof calcCEMetrics>, transactions: Transaction[] = []) => {
  const totAttivoImm  = sp.immImmateriali + sp.immMateriali + sp.immobiliTerreni + sp.partecipazioni;
  const totAttivoCirc = sp.rimanenze + sp.creditiClienti + sp.creditiTributari + sp.liquidita;
  const totAttivo     = totAttivoImm + totAttivoCirc;
  const totPN         = sp.capitaleSociale + sp.riserve + sp.utileEsercizio;
  const totPassivoLT  = sp.mutuiLT + sp.leasingLT + sp.tfr;
  const totPassivoBT  = sp.fidiRT + sp.debitiFornitori + sp.debitiTributari + sp.accontiClienti + sp.altriDebitiBT + (sp.mutuiBT || 0);
  const totPassivo    = totPN + totPassivoLT + totPassivoBT;
  const pfn           = sp.mutuiLT + sp.leasingLT + sp.fidiRT + (sp.mutuiBT || 0) - sp.liquidita;
  const ebitda        = ceMetrics.ebitdaTot;

  const acquistiFornitoriAnno = transactions
    .filter(tx => 
      tx.ceType === 'costo_variabile' && 
      new Date(tx.date).getFullYear() === new Date(sp.dataRiferimento).getFullYear()
    )
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  return {
    totAttivoImm, totAttivoCirc, totAttivo,
    totPN, totPassivoLT, totPassivoBT, totPassivo,
    pfn,
    pfnSuEbitda:        ebitda !== 0 ? pfn / ebitda : 0,
    currentRatio:       totPassivoBT > 0 ? totAttivoCirc / totPassivoBT : 0,
    soliditaPatr:       totAttivo > 0 ? totPN / totAttivo : 0,
    coperturInteressi:  ceMetrics.oneriFin > 0 ? ebitda / ceMetrics.oneriFin : 0,
    dso:                ceMetrics.fatturato > 0
                          ? (sp.creditiClienti / ceMetrics.fatturato) * 365 : 0,
    dpo:                acquistiFornitoriAnno > 0
                          ? (sp.debitiFornitori / acquistiFornitoriAnno) * 365 : 0,
    quadratura:         Math.abs(totAttivo - totPassivo) < 1,
  };
};

export interface ScostamentoRiga {
  label: string;
  ceType: string;
  budget: number;
  previsionale: number;
  consuntivo: number;
  scostamentoBudget: number;       // consuntivo - budget
  scostamentoBudgetPct: number;    // (consuntivo - budget) / budget
  scostamentoPrevisionale: number; // consuntivo - previsionale
  scostamentoPrevPct: number;      // (consuntivo - previsionale) / previsionale
  isRicavo: boolean;               // true = scostamento positivo è buono
}

export const calcScostamenti = (
  transactions: Transaction[],
  anno: number,
  mese: number | null,  // null = YTD (tutti i mesi), 0-11 = mese specifico
  budgetData?: BudgetData,
  manualOverrides?: Partial<CEData>
): ScostamentoRiga[] => {

  const filtra = (tx: Transaction, isForecast: boolean) => {
    const d = new Date(tx.date);
    if (d.getFullYear() !== anno) return false;
    if (mese !== null && d.getMonth() !== mese) return false;
    if (!!tx.isForecast !== isForecast) return false;
    if (!tx.ceType) return false;
    // N11 fix: esclude forecast già liquidati (linkedForecastId) per non gonfiare il previsionale
    if (isForecast && transactions.some(act => !act.isForecast && act.linkedForecastId === tx.id)) return false;
    return true;
  };

  const sommaPerTipo = (isForecast: boolean, types: string[]) =>
    transactions
      .filter(tx => filtra(tx, isForecast) && types.includes(tx.ceType!))
      .reduce((s, tx) => {
        const isIncome = tx.ceType!.startsWith('ricavo') ||
          tx.ceType === 'provento_finanziario' ||
          (tx.ceType === 'straordinario' && tx.type === 'INCOME');
        return s + (isIncome ? Math.abs(tx.amount) : -Math.abs(tx.amount));
      }, 0);

  const getBudget = (ceType: string): number => {
    if (!budgetData) return 0;
    const riga = budgetData.righe.find(r => r.ceType === ceType);
    if (!riga) return 0;
    if (mese !== null) return riga.budgetMensile[mese] || 0;
    return riga.budgetAnnuo;
  };

  const voci = [
    { label: 'Ricavi Core',        ceType: 'ricavo_core',      isRicavo: true  },
    { label: 'Vendite Immobiliari', ceType: 'ricavo_immobiliare', isRicavo: true },
    { label: 'Altri Ricavi',       ceType: 'ricavo_altro',     isRicavo: true  },
    { label: 'Costi Variabili',    ceType: 'costo_variabile',  isRicavo: false },
    { label: 'Costi Studio',       ceType: 'costo_studio',     isRicavo: false },
    { label: 'Costi Fissi',        ceType: 'costo_fisso',      isRicavo: false },
    { label: 'Oneri Finanziari',   ceType: 'onere_finanziario',isRicavo: false },
    { label: 'Compenso Soci',      ceType: 'distribuzione_utile', isRicavo: false },
  ];

  return voci.map(voce => {
    const consuntivo  = Math.abs(sommaPerTipo(false, [voce.ceType]));
    const previsionale = Math.abs(sommaPerTipo(true,  [voce.ceType]));
    const budget      = getBudget(voce.ceType);

    const scostamentoBudget      = voce.isRicavo
      ? consuntivo - budget
      : budget - consuntivo;
    const scostamentoBudgetPct   = budget !== 0 ? scostamentoBudget / budget : 0;
    const scostamentoPrevisionale = voce.isRicavo
      ? consuntivo - previsionale
      : previsionale - consuntivo;
    const scostamentoPrevPct     = previsionale !== 0
      ? scostamentoPrevisionale / previsionale
      : 0;

    return {
      ...voce,
      budget,
      previsionale,
      consuntivo,
      scostamentoBudget,
      scostamentoBudgetPct,
      scostamentoPrevisionale,
      scostamentoPrevPct,
    };
  });
};

export interface PosizIonIVAMensile {
  mese: number;           // 0-11
  ivaIncassata: number;   // IVA su ricavi incassati (da clienti)
  ivaPagata: number;      // IVA su costi pagati (a fornitori)
  saldoIVA: number;       // ivaIncassata - ivaPagata (positivo = da versare)
  versamentoIVA: number;  // versamenti F24 IVA già registrati nel mese
  posizionNetta: number;  // saldoIVA - versamentoIVA (residuo da versare o credito)
}

export interface RiepilogoIVA {
  mensile: PosizIonIVAMensile[];
  totaleIvaIncassata: number;
  totaleIvaPagata: number;
  totaleVersato: number;
  creditoDebitoResiduo: number;  // positivo = debito residuo, negativo = credito
  frequenzaLiquidazione: 'mensile' | 'trimestrale';
}

export const calcPosizIoneIVA = (
  transactions: Transaction[],
  anno: number
): RiepilogoIVA => {

  const txAnno = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getFullYear() === anno && !tx.isForecast;
  });

  const mensile: PosizIonIVAMensile[] = Array.from({ length: 12 }, (_, mese) => {
    const txMese = txAnno.filter(tx => new Date(tx.date).getMonth() === mese);

    // IVA incassata = somma IVA su tutte le entrate con vatRate
    // Escludi 'solo_cashflow' (finanziamenti, F24) e 'capex' (rate capitale finanziamenti)
    const ivaIncassata = txMese
      .filter(tx => tx.type === 'INCOME' && (tx.vatRate || 0) > 0 && tx.ceType !== 'solo_cashflow' && tx.ceType !== 'capex')
      .reduce((s, tx) => s + tx.amount * (tx.vatRate! / 100), 0);

    // IVA pagata = somma IVA su tutte le uscite con vatRate
    // Escludi versamenti IVA/F24 stessi e rate capitale finanziamenti (ceType capex)
    const ivaPagata = txMese
      .filter(tx => tx.type === 'EXPENSE' && (tx.vatRate || 0) > 0 && tx.ceType !== 'solo_cashflow' && tx.ceType !== 'capex')
      .reduce((s, tx) => s + tx.amount * (tx.vatRate! / 100), 0);

    // Versamenti IVA già registrati (categoria specifica)
    const versamentoIVA = txMese
      .filter(tx =>
        tx.type === 'EXPENSE' &&
        tx.category === '[FISCO] Versamento IVA'
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);

    const saldoIVA = ivaIncassata - ivaPagata;
    const posizionNetta = saldoIVA - versamentoIVA;

    return { mese, ivaIncassata, ivaPagata, saldoIVA, versamentoIVA, posizionNetta };
  });

  const totaleIvaIncassata  = mensile.reduce((s, m) => s + m.ivaIncassata, 0);
  const totaleIvaPagata     = mensile.reduce((s, m) => s + m.ivaPagata, 0);
  const totaleVersato        = mensile.reduce((s, m) => s + m.versamentoIVA, 0);
  const creditoDebitoResiduo = totaleIvaIncassata - totaleIvaPagata - totaleVersato;

  // Stima frequenza liquidazione: se ci sono versamenti ogni mese = mensile
  const mesiConVersamento = mensile.filter(m => m.versamentoIVA > 0).length;
  const frequenzaLiquidazione: 'mensile' | 'trimestrale' =
    mesiConVersamento >= 6 ? 'mensile' : 'trimestrale';

  return {
    mensile,
    totaleIvaIncassata,
    totaleIvaPagata,
    totaleVersato,
    creditoDebitoResiduo,
    frequenzaLiquidazione,
  };
};

export interface RollingDSODPO {
  dsoRolling: number;
  dpoRolling: number;
  metodoDso: 'preciso' | 'stimato';
  metodoDpo: 'preciso' | 'stimato';
  transazioniDsoUsate: number;
  transazioniDpoUsate: number;
}

export const calcRollingDSODPO = (
  transactions: Transaction[]
): RollingDSODPO => {

  const oggi = new Date();
  const dodiciMesiFa = new Date(oggi.getFullYear(), oggi.getMonth() - 11, 1);

  const txRolling = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d >= dodiciMesiFa && d <= oggi && !tx.isForecast && tx.ceType;
  });

  // ── DSO ─────────────────────────────────────────────────────────
  // N1 fix: aggiunto 'ricavo_immobiliare' per includere vendite immobiliari nel calcolo DSO
  const incassiClienti = txRolling.filter(tx =>
    tx.type === 'INCOME' &&
    (tx.ceType === 'ricavo_core' || tx.ceType === 'ricavo_altro' || tx.ceType === 'ricavo_immobiliare')
  );

  const incassiConInvoiceDate = incassiClienti.filter(tx => tx.invoiceDate);

  let dsoRolling = 0;
  let metodoDso: 'preciso' | 'stimato' = 'stimato';

  if (incassiConInvoiceDate.length >= 3) {
    // Metodo preciso: lag medio tra data fattura e data incasso
    const lagTotale = incassiConInvoiceDate.reduce((sum, tx) => {
      const dataIncasso = new Date(tx.date);
      const dataFattura = new Date(tx.invoiceDate!);
      return sum + Math.max(0,
        (dataIncasso.getTime() - dataFattura.getTime()) / (1000 * 60 * 60 * 24)
      );
    }, 0);
    dsoRolling = Math.round(lagTotale / incassiConInvoiceDate.length);
    metodoDso = 'preciso';
  } else {
    // Metodo stimato: volume mensile medio → stima crediti aperti = 1.5 mesi
    const fatturatoRolling = incassiClienti.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const fatturatoMensile = fatturatoRolling / 12;
    dsoRolling = fatturatoMensile > 0 ? 45 : 0; // stima standard edilizia
  }

  // ── DPO ─────────────────────────────────────────────────────────
  const pagamentiFornitori = txRolling.filter(tx =>
    tx.type === 'EXPENSE' && tx.ceType === 'costo_variabile'
  );

  const pagamentiConInvoiceDate = pagamentiFornitori.filter(tx => tx.invoiceDate);

  let dpoRolling = 0;
  let metodoDpo: 'preciso' | 'stimato' = 'stimato';

  if (pagamentiConInvoiceDate.length >= 3) {
    // Metodo preciso: lag medio tra data fattura e data pagamento
    const lagTotale = pagamentiConInvoiceDate.reduce((sum, tx) => {
      const dataPagamento = new Date(tx.date);
      const dataFattura = new Date(tx.invoiceDate!);
      return sum + Math.max(0,
        (dataPagamento.getTime() - dataFattura.getTime()) / (1000 * 60 * 60 * 24)
      );
    }, 0);
    dpoRolling = Math.round(lagTotale / pagamentiConInvoiceDate.length);
    metodoDpo = 'preciso';
  } else {
    // Metodo stimato: stima standard settore edile
    const acquistiRolling = pagamentiFornitori.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    dpoRolling = acquistiRolling > 0 ? 60 : 0; // stima standard edilizia
  }

  return {
    dsoRolling,
    dpoRolling,
    metodoDso,
    metodoDpo,
    transazioniDsoUsate: incassiConInvoiceDate.length,
    transazioniDpoUsate: pagamentiConInvoiceDate.length,
  };
};
