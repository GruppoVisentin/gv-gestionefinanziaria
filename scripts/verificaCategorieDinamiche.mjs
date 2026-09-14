import fs from 'fs';
import { FIXED_COST_CATEGORIES, VARIABLE_COST_CATEGORIES } from '../constants.ts';

const NAS_PATH = String.raw`\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\gv-cashflow_v2-import-puntanet-automatico.gvcf`;
const raw = JSON.parse(fs.readFileSync(NAS_PATH, 'utf8'));
const data = raw.data || raw;

const fixedReal = data.fixedCategories || [];
const varReal = data.variableCategories || [];

const fixedExtra = fixedReal.filter(c => !FIXED_COST_CATEGORIES.includes(c));
const fixedMissing = FIXED_COST_CATEGORIES.filter(c => !fixedReal.includes(c));
const varExtra = varReal.filter(c => !VARIABLE_COST_CATEGORIES.includes(c));
const varMissing = VARIABLE_COST_CATEGORIES.filter(c => !varReal.includes(c));

console.log('Costi Fissi extra (nel file ma non nella costante statica):', fixedExtra);
console.log('Costi Fissi mancanti (nella costante statica ma rimossi dal file):', fixedMissing);
console.log('Costi Variabili extra:', varExtra);
console.log('Costi Variabili mancanti:', varMissing);

const transactions = data.transactions || [];
const allExtra = [...fixedExtra, ...varExtra];
allExtra.forEach(cat => {
  const count = transactions.filter(t => t.category === cat).length;
  console.log(`  -> "${cat}": ${count} transazioni`);
});
