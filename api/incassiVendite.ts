import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

// Incassi delle vendite immobiliari: pubblicati SOLO da Gestione Immobiliare quando una rata
// del piano pagamenti di un cliente viene confermata da un operatore (o incassata). Qui si
// leggono e si scrivono soltanto le due spunte di Gestione Finanziaria: "letto" (gestito) e
// "in_cashflow" (già aggiunto come previsione nel cash flow). Se la rata torna indietro in
// Gestione Immobiliare dopo essere entrata nel cash flow, la riga resta con stato "Annullata".
async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS incassi_vendite (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      cliente_nome TEXT NOT NULL,
      intervento_nome TEXT,
      cantiere_id TEXT,
      unita_codice TEXT,
      tipo TEXT,
      descrizione TEXT,
      importo NUMERIC NOT NULL,
      scadenza DATE,
      stato TEXT NOT NULL,
      incassata_il DATE,
      confermata_da TEXT,
      letto BOOLEAN NOT NULL DEFAULT false,
      in_cashflow BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function rowToIncasso(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    clienteNome: row.cliente_nome,
    interventoNome: row.intervento_nome,
    unitaCodice: row.unita_codice,
    tipo: row.tipo,
    descrizione: row.descrizione,
    importo: Number(row.importo),
    scadenza: toDateStr(row.scadenza),
    stato: row.stato,
    incassataIl: toDateStr(row.incassata_il),
    confermataDa: row.confermata_da,
    letto: row.letto,
    inCashflow: row.in_cashflow,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM incassi_vendite ORDER BY scadenza ASC NULLS LAST, created_at DESC`;
      return res.status(200).json({ incassi: rows.map(rowToIncasso) });
    }
    if (req.method === 'PATCH') {
      const { id, letto, inCashflow } = req.body || {};
      if (!id || (typeof letto !== 'boolean' && typeof inCashflow !== 'boolean')) {
        return res.status(400).json({ error: 'Servono id e letto o inCashflow' });
      }
      const r = await sql`
        UPDATE incassi_vendite SET
          letto = COALESCE(${typeof letto === 'boolean' ? letto : null}::boolean, letto),
          in_cashflow = COALESCE(${typeof inCashflow === 'boolean' ? inCashflow : null}::boolean, in_cashflow)
        WHERE id = ${String(id)} RETURNING *`;
      if (!r.length) return res.status(404).json({ error: 'Incasso non trovato' });
      return res.status(200).json({ incasso: rowToIncasso(r[0]) });
    }
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API incassi vendite:', error);
    return res.status(500).json({ error: 'Errore interno' });
  }
}
