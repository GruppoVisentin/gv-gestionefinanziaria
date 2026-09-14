import fs from 'fs';
import { buildCEData, calcCEMetrics, calcPrevisioneFiscale } from '../utils/gasCoreEngine.ts';

const NAS_PATH = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\gv-cashflow_v2-import-puntanet-automatico.gvcf`;

const raw = JSON.parse(fs.readFileSync(NAS_PATH, 'utf8'));
const data = raw.data || raw;

const transactions = data.transactions || [];
const projects = data.projects || [];
const initialData = data.initialData;
const rimanenze = data.rimanenze || {};
const aliquotaIRESpct = data.aliquoteFiscali?.ires ?? 24;
const aliquotaIRAPpct = data.aliquoteFiscali?.irap ?? 3.9;

console.log('Top-level keys:', Object.keys(data));
console.log('aliquoteFiscali (raw field):', JSON.stringify(data.aliquoteFiscali));
console.log('Aliquote usate: IRES', aliquotaIRESpct, '% | IRAP', aliquotaIRAPpct, '%');
console.log('# transactions:', transactions.length);
console.log('rimanenze anni disponibili:', Object.keys(rimanenze));
console.log('initialData:', initialData ? JSON.stringify(initialData) : null);
console.log('');

function run(anno) {
  const ceManual = data.ceManualData ? data.ceManualData[String(anno)] : undefined;
  const ceData = buildCEData(transactions, anno, ceManual, 'competenza', projects, initialData);
  const rawMetrics = calcCEMetrics(ceData, transactions, projects, initialData, rimanenze[String(anno)]);

  for (const includeForecast of [false, true]) {
    const pf = calcPrevisioneFiscale(
      transactions,
      anno,
      rawMetrics,
      rimanenze[String(anno)],
      aliquotaIRESpct / 100,
      aliquotaIRAPpct / 100,
      includeForecast,
      initialData
    );
    console.log(`--- Anno ${anno} | includeForecast=${includeForecast} (${includeForecast ? 'PROIEZIONE' : 'CONSUNTIVO/YTD'}) ---`);
    console.log('ebtCompetenza:', pf.ebtCompetenza.toFixed(2));
    console.log('variazioneRimanenze:', pf.variazioneRimanenze.toFixed(2));
    console.log('baseImponibileIRES (netta, dopo ded. IRAP):', pf.baseImponibileIRES.toFixed(2));
    console.log('baseImponibileIRAP:', pf.baseImponibileIRAP.toFixed(2));
    console.log('valoreProduzione:', pf.valoreProduzione.toFixed(2));
    console.log('costiDeducibiliIRAP:', pf.costiDeducibiliIRAP.toFixed(2));
    console.log('iresStimata:', pf.iresStimata.toFixed(2));
    console.log('irapStimata:', pf.irapStimata.toFixed(2));
    console.log('totaleImposteStimate:', pf.totaleImposteStimate.toFixed(2));
    console.log('utileDopoImposte:', pf.utileDopoImposte.toFixed(2));
    console.log('');
  }

  console.log('rawMetrics.fatturato:', rawMetrics.fatturato.toFixed(2));
  console.log('rawMetrics.ebtTot:', rawMetrics.ebtTot.toFixed(2));
  console.log('rawMetrics.proiezioneFatturato:', rawMetrics.proiezioneFatturato.toFixed(2));
  console.log('rawMetrics.proiezioneEbt:', rawMetrics.proiezioneEbt.toFixed(2));
  console.log('rawMetrics.totCostiVar sum:', rawMetrics.totCostiVar.reduce((a,b)=>a+b,0).toFixed(2));
  console.log('rawMetrics.proiezioneCostiVariabili:', rawMetrics.proiezioneCostiVariabili.toFixed(2));
  console.log('rawMetrics.proiezioneCostiFissi:', rawMetrics.proiezioneCostiFissi.toFixed(2));
  console.log('rawMetrics.proiezioneCostiStudio:', rawMetrics.proiezioneCostiStudio.toFixed(2));
  console.log('rawMetrics.proiezioneAmmortamenti:', rawMetrics.proiezioneAmmortamenti.toFixed(2));
  console.log('rawMetrics.proiezioneOneriFin:', rawMetrics.proiezioneOneriFin.toFixed(2));
  console.log('rawMetrics.proiezioneProventiFin:', rawMetrics.proiezioneProventiFin.toFixed(2));
  console.log('rawMetrics.proiezioneStraordinario:', rawMetrics.proiezioneStraordinario.toFixed(2));
  console.log('rawMetrics.proiezioneEbitda:', rawMetrics.proiezioneEbitda.toFixed(2));
  console.log('rawMetrics.proiezioneEbit:', rawMetrics.proiezioneEbit.toFixed(2));
  console.log('====================================================');
  console.log('');
}

run(2025);
run(2026);
