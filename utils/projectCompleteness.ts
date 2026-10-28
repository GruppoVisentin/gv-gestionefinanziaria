import { Project } from '../types';

// Campi amministrativi di competenza esclusiva di Gestione Finanziaria (mai
// inviati da DirettoreCantiere: una commessa importata da lì arriva sempre
// con questi vuoti) — usati dal banner "dati amministrativi mancanti" in
// App.tsx e dal riepilogo per commessa in ProjectManager.tsx, così una
// commessa importata da un'altra app non resta dimenticata a metà. Non
// includono puntaNetCantiereId (è un collegamento, non un dato da
// compilare) né client/location (arrivano già valorizzati dal registro
// condiviso, quando l'altra app li ha).
export const CAMPI_AMMINISTRATIVI_COMMESSA: { chiave: keyof Project; etichetta: string }[] = [
  { chiave: 'jobType', etichetta: 'Tipo lavoro' },
  { chiave: 'metodoPagamento', etichetta: 'Metodo di pagamento (SAL/Acconto)' },
  { chiave: 'intestatari', etichetta: 'Intestatari fattura' },
  { chiave: 'estimatedStartDate', etichetta: 'Data inizio stimata' },
  { chiave: 'estimatedLabor', etichetta: 'Manodopera stimata' },
  { chiave: 'laborType', etichetta: 'Tipo manodopera' },
  { chiave: 'estimatedMaterials', etichetta: 'Materiali stimati' },
  { chiave: 'estimatedSubcontractors', etichetta: 'Subappalti stimati' },
  { chiave: 'estimatedProfessionals', etichetta: 'Professionisti stimati' },
  { chiave: 'estimatedRevenue', etichetta: 'Ricavo stimato' },
];

export function campiAmministrativiMancanti(p: Project): string[] {
  return CAMPI_AMMINISTRATIVI_COMMESSA
    .filter(c => {
      const v = p[c.chiave];
      if (c.chiave === 'intestatari') return !Array.isArray(v) || v.length === 0;
      return v === undefined || v === null || v === '';
    })
    .map(c => c.etichetta);
}
