import { Transaction } from '../types';

export interface OverheadRates {
  // BASE DI CALCOLO
  totaleCostiDiretti: number;      // Livello 1 — base per overhead rate
  totaleCostiStudio: number;       // Livello 2 — personale tecnico/studio
  totaleOverheadPuro: number;      // Livello 3 — struttura fissa pura
  totaleOneriFin: number;          // Livello 4 — oneri finanziari (informativo)
  totaleOverheadCompleto: number;  // Livello 2 + 3 — tutto l'overhead
  fatturato: number;               // Ricavi core per confronto

  // OVERHEAD RATE (base = costi diretti) — per PREVENTIVI
  overheadRateStudio: number;      // studio / costi diretti
  overheadRateFissi: number;       // overhead puro / costi diretti
  overheadRateCompleto: number;    // overhead totale / costi diretti

  // INCIDENZA SU FATTURATO — per CONTROLLO DI GESTIONE (Gasparotto)
  incidenzaStudioFatturato: number;
  incidenzaFissiFatturato: number;
  incidenzaCompletaFatturato: number;

  // PROIEZIONE A FINE ANNO
  overheadRateProiettato: number;  // basato su proiezione 12 mesi
  mesiTrascorsi: number;

  // COMPENSO SOCI (per 7+1 numeri sacri)
  compensoSoci: number;

  // ANNO DI RIFERIMENTO
  anno: number;
}

export const calculateOverheadRates = (
  transactions: Transaction[],
  anno: number
): OverheadRates => {

  const txAnno = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getFullYear() === anno && tx.ceType && !tx.isForecast;
  });

  const sumByType = (types: string[]) =>
    txAnno
      .filter(tx => types.includes(tx.ceType ?? ''))
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const totaleCostiDiretti    = sumByType(['costo_variabile']);
  const totaleCostiStudio     = sumByType(['costo_studio']);
  const totaleOverheadPuro    = sumByType(['costo_fisso', 'ammortamento']);
  const totaleOneriFin        = sumByType(['onere_finanziario']);
  const totaleOverheadCompleto = totaleCostiStudio + totaleOverheadPuro;
  const fatturato             = sumByType(['ricavo_core', 'ricavo_altro', 'ricavo_immobiliare']);

  // Compenso Soci: costo_studio con categoria che contiene 'Compenso Amministratori' o 'Soci'
  const compensoSoci = txAnno
    .filter(tx => 
      tx.ceType === 'costo_studio' && 
      (tx.category?.toLowerCase().includes('compenso amministratori') || 
       tx.category?.toLowerCase().includes('soci'))
    )
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  // Overhead rate — base costi diretti (per preventivi)
  const base = totaleCostiDiretti > 0 ? totaleCostiDiretti : 1;
  const overheadRateStudio    = totaleCostiStudio / base;
  const overheadRateFissi     = totaleOverheadPuro / base;
  const overheadRateCompleto  = totaleOverheadCompleto / base;

  // Incidenza su fatturato (per controllo di gestione)
  const baseFatt = fatturato > 0 ? fatturato : 1;
  const incidenzaStudioFatturato    = totaleCostiStudio / baseFatt;
  const incidenzaFissiFatturato     = totaleOverheadPuro / baseFatt;
  const incidenzaCompletaFatturato  = totaleOverheadCompleto / baseFatt;

  // Proiezione
  const oggi = new Date();
  const mesiTrascorsi = anno < oggi.getFullYear()
    ? 12
    : Math.max(1, oggi.getMonth() + 1);
  const fattoreProiezione = 12 / mesiTrascorsi;
  const overheadRateProiettato =
    (totaleOverheadCompleto * fattoreProiezione) /
    Math.max(1, totaleCostiDiretti * fattoreProiezione);

  return {
    totaleCostiDiretti,
    totaleCostiStudio,
    totaleOverheadPuro,
    totaleOneriFin,
    totaleOverheadCompleto,
    fatturato,
    overheadRateStudio,
    overheadRateFissi,
    overheadRateCompleto,
    incidenzaStudioFatturato,
    incidenzaFissiFatturato,
    incidenzaCompletaFatturato,
    overheadRateProiettato,
    mesiTrascorsi,
    compensoSoci,
    anno,
  };
};

// ─── CALCOLATORE PREVENTIVO CANTIERE (conto terzi) ───────────────

export interface PreventivoCantiereResult {
  costoDiretto: number;
  quotaStudio: number;
  quotaOverheadPuro: number;
  quotaOverheadTotale: number;
  margineEuro: number;
  prezzoMinimo: number;
  coefficienteRicarico: number;
  marginePercent: number;
  breakdown: {
    voce: string;
    importo: number;
    percentualeSuPrezzo: number;
  }[];
}

export const calcolaPreventivoCantiere = (
  costoDiretto: number,
  margineTargetPercent: number,  // es. 0.10 per 10%
  rates: OverheadRates
): PreventivoCantiereResult => {

  const quotaStudio       = costoDiretto * rates.overheadRateStudio;
  const quotaOverheadPuro = costoDiretto * rates.overheadRateFissi;
  const quotaOverheadTotale = quotaStudio + quotaOverheadPuro;
  const costoTotale       = costoDiretto + quotaOverheadTotale;

  // Il margine si calcola sul prezzo finale, non sul costo
  // Prezzo = CostoTotale / (1 - margine%)
  const prezzoMinimo = margineTargetPercent < 1
    ? costoTotale / (1 - margineTargetPercent)
    : costoTotale;

  const margineEuro         = prezzoMinimo - costoTotale;
  const coefficienteRicarico = costoDiretto > 0
    ? prezzoMinimo / costoDiretto
    : 1;

  const breakdown = [
    {
      voce: 'Costi diretti cantiere',
      importo: costoDiretto,
      percentualeSuPrezzo: prezzoMinimo > 0 ? costoDiretto / prezzoMinimo : 0,
    },
    {
      voce: 'Quota studio e personale tecnico',
      importo: quotaStudio,
      percentualeSuPrezzo: prezzoMinimo > 0 ? quotaStudio / prezzoMinimo : 0,
    },
    {
      voce: 'Quota overhead struttura',
      importo: quotaOverheadPuro,
      percentualeSuPrezzo: prezzoMinimo > 0 ? quotaOverheadPuro / prezzoMinimo : 0,
    },
    {
      voce: 'Margine utile',
      importo: margineEuro,
      percentualeSuPrezzo: margineTargetPercent,
    },
  ];

  return {
    costoDiretto,
    quotaStudio,
    quotaOverheadPuro,
    quotaOverheadTotale,
    margineEuro,
    prezzoMinimo,
    coefficienteRicarico,
    marginePercent: margineTargetPercent,
    breakdown,
  };
};

// ─── CALCOLATORE PREVENTIVO SVILUPPO IMMOBILIARE ─────────────────
// Logica diversa: overhead si applica SOLO sui costi di costruzione
// NON sul costo del terreno (che è un passthrough)

export interface PreventivoImmobiliareResult {
  costoTerreno: number;
  costoCostruzione: number;
  quotaOverheadSuCostruzione: number;
  costoTotaleOperazione: number;
  margineEuro: number;
  prezzoVenditaMinimo: number;
  marginePercent: number;
  margineNetto: number;          // dopo overhead
  roiOperazione: number;         // margine / investimento totale
  breakdown: {
    voce: string;
    importo: number;
    percentualeSuVendita: number;
  }[];
}

export const calcolaPreventivoImmobiliare = (
  costoTerreno: number,          // NON entra nella base overhead
  costoCostruzione: number,      // base per overhead
  margineTargetPercent: number,  // sul prezzo finale
  rates: OverheadRates
): PreventivoImmobiliareResult => {

  // L'overhead si applica solo sulla costruzione, non sul terreno
  const quotaOverheadSuCostruzione =
    costoCostruzione * rates.overheadRateCompleto;

  const costoTotaleOperazione =
    costoTerreno + costoCostruzione + quotaOverheadSuCostruzione;

  // Prezzo minimo per raggiungere il margine target
  const prezzoVenditaMinimo = margineTargetPercent < 1
    ? costoTotaleOperazione / (1 - margineTargetPercent)
    : costoTotaleOperazione;

  const margineEuro  = prezzoVenditaMinimo - costoTotaleOperazione;
  const margineNetto = prezzoVenditaMinimo - costoTerreno
                       - costoCostruzione - quotaOverheadSuCostruzione;
  const roiOperazione = costoTotaleOperazione > 0
    ? margineEuro / costoTotaleOperazione
    : 0;

  const breakdown = [
    {
      voce: 'Costo terreno (passthrough)',
      importo: costoTerreno,
      percentualeSuVendita: prezzoVenditaMinimo > 0
        ? costoTerreno / prezzoVenditaMinimo : 0,
    },
    {
      voce: 'Costo costruzione',
      importo: costoCostruzione,
      percentualeSuVendita: prezzoVenditaMinimo > 0
        ? costoCostruzione / prezzoVenditaMinimo : 0,
    },
    {
      voce: 'Quota overhead su costruzione',
      importo: quotaOverheadSuCostruzione,
      percentualeSuVendita: prezzoVenditaMinimo > 0
        ? quotaOverheadSuCostruzione / prezzoVenditaMinimo : 0,
    },
    {
      voce: 'Margine utile operazione',
      importo: margineEuro,
      percentualeSuVendita: margineTargetPercent,
    },
  ];

  return {
    costoTerreno,
    costoCostruzione,
    quotaOverheadSuCostruzione,
    costoTotaleOperazione,
    margineEuro,
    prezzoVenditaMinimo,
    marginePercent: margineTargetPercent,
    margineNetto,
    roiOperazione,
    breakdown,
  };
};

// ─── COSTO ORARIO OPERAIO ─────────────────────────────────────────

export interface CostoOrarioResult {
  costoMensileStipendi: number;
  costoMensileContributi: number;
  costoMensileTotale: number;
  oreCantiereInput: number;        // inserite manualmente
  costoOrarioReale: number;        // calcolato
  costoOrarioContrattuale: number; // inserito manualmente per confronto
  differenzaPerOra: number;        // reale - contrattuale
  anno: number;
  mese: number;
}

export const calcolaCostoOrario = (
  transactions: Transaction[],
  anno: number,
  mese: number,           // 1-12
  oreCantiereInput: number,
  costoOrarioContrattuale: number = 28
): CostoOrarioResult => {

  const txMese = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getFullYear() === anno
        && d.getMonth() + 1 === mese
        && (tx.ceType === 'costo_variabile')
        && (
          tx.category?.includes('[PERSONALE] Stipendi Dipendenti Operativi') ||
          tx.category?.includes('[PERSONALE] Contributi Dipendenti Operativi')
        );
  });

  const costoMensileStipendi = txMese
    .filter(tx => tx.category?.includes('Stipendi'))
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  const costoMensileContributi = txMese
    .filter(tx => tx.category?.includes('Contributi'))
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  const costoMensileTotale  = costoMensileStipendi + costoMensileContributi;
  const costoOrarioReale    = oreCantiereInput > 0
    ? costoMensileTotale / oreCantiereInput
    : 0;
  const differenzaPerOra    = costoOrarioReale - costoOrarioContrattuale;

  return {
    costoMensileStipendi,
    costoMensileContributi,
    costoMensileTotale,
    oreCantiereInput,
    costoOrarioReale,
    costoOrarioContrattuale,
    differenzaPerOra,
    anno,
    mese,
  };
};
