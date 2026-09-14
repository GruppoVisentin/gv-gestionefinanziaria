export type SharedClienteSource = 'direttore_cantiere' | 'gestione_finanziaria';

export interface SharedCliente {
  id: string;
  source: SharedClienteSource;
  sourceId: string;
  nome: string;
  pIvaCf: string | null;
  updatedAt: string;
}

export interface SharedClienteInput {
  source: SharedClienteSource;
  sourceId: string;
  nome: string;
  pIvaCf?: string | null;
}

export async function fetchSharedClienti(): Promise<SharedCliente[]> {
  const res = await fetch('/api/clienti');
  if (!res.ok) throw new Error(`Errore lettura anagrafica clienti (${res.status})`);
  const data = await res.json();
  return data.clienti || [];
}

export async function pushSharedCliente(input: SharedClienteInput): Promise<void> {
  const res = await fetch('/api/clienti', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Errore scrittura anagrafica clienti (${res.status})`);
}

export async function deleteSharedCliente(source: SharedClienteSource, sourceId: string): Promise<void> {
  const res = await fetch(`/api/clienti?source=${encodeURIComponent(source)}&sourceId=${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Errore cancellazione anagrafica clienti (${res.status})`);
}
