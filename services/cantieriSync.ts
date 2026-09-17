export type SharedCantiereSource = 'direttore_cantiere' | 'gestione_finanziaria';

export interface SharedCantiere {
  id: string;
  source: SharedCantiereSource;
  sourceId: string;
  nome: string;
  cliente: string | null;
  luogo: string | null;
  dataInizio: string | null;
  dataConsegna: string | null;
  stato: string;
  // Id numerico PuntaNet del cantiere, collegato a mano qui in Gestione
  // Finanziaria — vedi fornitori_registry.perCantiere per come si usa.
  puntaNetCantiereId: number | null;
  updatedAt: string;
}

export interface SharedCantiereInput {
  source: SharedCantiereSource;
  sourceId: string;
  nome: string;
  cliente?: string | null;
  luogo?: string | null;
  dataInizio?: string | null;
  dataConsegna?: string | null;
  stato: string;
  puntaNetCantiereId?: number | null;
}

export async function fetchSharedCantieri(): Promise<SharedCantiere[]> {
  const res = await fetch('/api/cantieri');
  if (!res.ok) throw new Error(`Errore lettura registro cantieri (${res.status})`);
  const data = await res.json();
  return data.cantieri || [];
}

export async function pushSharedCantiere(input: SharedCantiereInput): Promise<void> {
  const res = await fetch('/api/cantieri', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Errore scrittura registro cantieri (${res.status})`);
}

export async function deleteSharedCantiere(source: SharedCantiereSource, sourceId: string): Promise<void> {
  const res = await fetch(`/api/cantieri?source=${encodeURIComponent(source)}&sourceId=${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Errore cancellazione registro cantieri (${res.status})`);
}
