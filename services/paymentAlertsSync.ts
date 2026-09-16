// Avvisi "pagamento fornitore in arrivo": pubblicati da Direttore Cantiere quando
// una lavorazione con un fornitore che ha pagamento_a_fine_lavorazione=true (vedi
// fornitoriSync.ts) viene segnata come finita. Gestione Finanziaria li legge e li
// segna come gestiti — vedi PagamentiFornitoriTab.
export type PaymentAlertSource = 'direttore_cantiere';

export interface PaymentAlert {
  id: string;
  source: PaymentAlertSource;
  sourceId: string;
  cantiereNome: string;
  fornitoreNome: string;
  lavorazioneNome: string;
  dataCompletamento: string | null;
  note: string | null;
  // % indicativa dalla rata di contratto che ha generato l'avviso (assente per il
  // vecchio flag generico pagamentoAFineLavorazione, che non ha una % associata).
  percentuale: number | null;
  letto: boolean;
  // false finché il Direttore di quel cantiere non conferma l'importo reale in
  // Direttore Cantiere: fino ad allora l'avviso è "provvisorio" per Gestione Finanziaria.
  validato: boolean;
  importoValidato: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAlertInput {
  source: PaymentAlertSource;
  sourceId: string;
  cantiereNome: string;
  fornitoreNome: string;
  lavorazioneNome: string;
  dataCompletamento?: string | null;
  note?: string | null;
  percentuale?: number | null;
}

export async function fetchPaymentAlerts(): Promise<PaymentAlert[]> {
  const res = await fetch('/api/avvisiPagamentoFornitori');
  if (!res.ok) throw new Error(`Errore lettura avvisi pagamento fornitori (${res.status})`);
  const data = await res.json();
  return data.avvisi || [];
}

export async function pushPaymentAlert(input: PaymentAlertInput): Promise<void> {
  const res = await fetch('/api/avvisiPagamentoFornitori', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Errore pubblicazione avviso pagamento fornitore (${res.status})`);
}

export async function setPaymentAlertRead(id: string, letto: boolean): Promise<void> {
  const res = await fetch('/api/avvisiPagamentoFornitori', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, letto }),
  });
  if (!res.ok) throw new Error(`Errore aggiornamento avviso pagamento fornitore (${res.status})`);
}

// Validazione dell'importo reale da parte del Direttore di quel cantiere — solo
// Direttore Cantiere scrive questi campi, mai Gestione Finanziaria.
export async function setPaymentAlertValidation(id: string, importoValidato: number): Promise<void> {
  const res = await fetch('/api/avvisiPagamentoFornitori', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, validato: true, importoValidato }),
  });
  if (!res.ok) throw new Error(`Errore validazione avviso pagamento fornitore (${res.status})`);
}
