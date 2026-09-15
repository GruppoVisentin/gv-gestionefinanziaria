export type SharedFornitoreSource = 'direttore_cantiere' | 'gestione_finanziaria';

export interface SharedFornitore {
  id: string;
  source: SharedFornitoreSource;
  sourceId: string;
  ragioneSociale: string;
  pIvaCf: string | null;
  indirizzo: string | null;
  telefono: string | null;
  email: string | null;
  pec: string | null;
  puntaNetIdCliFor: string | null;
  // Mestiere/categoria (es. "Elettricista") — scritto solo da Direttore Cantiere,
  // che ha la sezione dedicata a categorizzare i fornitori del registro condiviso.
  mestiere: string | null;
  updatedAt: string;
}

export interface SharedFornitoreInput {
  source: SharedFornitoreSource;
  sourceId: string;
  ragioneSociale: string;
  pIvaCf?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  email?: string | null;
  pec?: string | null;
  puntaNetIdCliFor?: string | null;
}

export async function fetchSharedFornitori(): Promise<SharedFornitore[]> {
  const res = await fetch('/api/fornitori');
  if (!res.ok) throw new Error(`Errore lettura registro fornitori (${res.status})`);
  const data = await res.json();
  return data.fornitori || [];
}

export async function pushSharedFornitore(input: SharedFornitoreInput): Promise<void> {
  const res = await fetch('/api/fornitori', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Errore scrittura registro fornitori (${res.status})`);
}

export async function setSharedFornitoreMestiere(source: SharedFornitoreSource, sourceId: string, mestiere: string | null): Promise<void> {
  const res = await fetch('/api/fornitori', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, sourceId, mestiere }),
  });
  if (!res.ok) throw new Error(`Errore aggiornamento mestiere fornitore (${res.status})`);
}

export async function deleteSharedFornitore(source: SharedFornitoreSource, sourceId: string): Promise<void> {
  const res = await fetch(`/api/fornitori?source=${encodeURIComponent(source)}&sourceId=${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Errore cancellazione registro fornitori (${res.status})`);
}
