// Incassi delle vendite pubblicati da Gestione Immobiliare (vedi api/incassiVendite.ts).
export interface IncassoVendita {
  id: string;
  source: 'gestione_immobiliare';
  sourceId: string;
  clienteNome: string;
  interventoNome: string | null;
  unitaCodice: string | null;
  tipo: string | null;
  descrizione: string | null;
  importo: number;
  scadenza: string | null;
  stato: 'Confermata' | 'Incassata' | 'Annullata' | string;
  incassataIl: string | null;
  confermataDa: string | null;
  letto: boolean;
  inCashflow: boolean;
  updatedAt: string;
}

export async function fetchIncassiVendite(): Promise<IncassoVendita[]> {
  const res = await fetch('/api/incassiVendite');
  if (!res.ok) throw new Error(`Errore lettura incassi vendite (${res.status})`);
  const data = await res.json();
  return data.incassi || [];
}

export async function aggiornaIncassoVendita(id: string, campi: { letto?: boolean; inCashflow?: boolean }): Promise<void> {
  const res = await fetch('/api/incassiVendite', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...campi }),
  });
  if (!res.ok) throw new Error(`Errore salvataggio incasso vendita (${res.status})`);
}

// Riferimento scritto sulla previsione nel cash flow, per non aggiungerla due volte.
export const rifIncasso = (i: IncassoVendita) => `Gestione Immobiliare — rata ${i.sourceId}`;
