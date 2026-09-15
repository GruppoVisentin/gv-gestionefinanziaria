import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

// Avvisi "pagamento fornitore in arrivo": pubblicati SOLO da Direttore Cantiere,
// quando una lavorazione assegnata a un fornitore con pagamento_a_fine_lavorazione=true
// (vedi fornitori_registry) viene segnata come finita. Gestione Finanziaria li legge
// nella tab "Pagamenti Fornitori in Arrivo" e li segna come gestiti (letto).
async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS avvisi_pagamento_fornitori (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      cantiere_nome TEXT NOT NULL,
      fornitore_nome TEXT NOT NULL,
      lavorazione_nome TEXT NOT NULL,
      data_completamento DATE,
      note TEXT,
      letto BOOLEAN NOT NULL DEFAULT false,
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

function rowToAvviso(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    cantiereNome: row.cantiere_nome,
    fornitoreNome: row.fornitore_nome,
    lavorazioneNome: row.lavorazione_nome,
    dataCompletamento: toDateStr(row.data_completamento),
    note: row.note,
    letto: row.letto,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM avvisi_pagamento_fornitori ORDER BY created_at DESC`;
      return res.status(200).json({ avvisi: rows.map(rowToAvviso) });
    }

    if (req.method === 'POST') {
      const { source, sourceId, cantiereNome, fornitoreNome, lavorazioneNome, dataCompletamento, note } = req.body || {};
      if (!source || !sourceId || !cantiereNome || !fornitoreNome || !lavorazioneNome) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, cantiereNome, fornitoreNome, lavorazioneNome' });
      }
      const id = `${source}:${sourceId}`;
      // Idempotente sull'id (progetto+lavorazione): un re-invio aggiorna i dati
      // descrittivi ma NON tocca "letto", per non far ricomparire come nuovo un
      // avviso che l'amministrazione ha già gestito.
      const rows = await sql`
        INSERT INTO avvisi_pagamento_fornitori (id, source, source_id, cantiere_nome, fornitore_nome, lavorazione_nome, data_completamento, note, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${cantiereNome}, ${fornitoreNome}, ${lavorazioneNome}, ${dataCompletamento ?? null}, ${note ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          cantiere_nome = EXCLUDED.cantiere_nome,
          fornitore_nome = EXCLUDED.fornitore_nome,
          lavorazione_nome = EXCLUDED.lavorazione_nome,
          data_completamento = EXCLUDED.data_completamento,
          note = EXCLUDED.note,
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ avviso: rowToAvviso(rows[0]) });
    }

    if (req.method === 'PATCH') {
      // Segna come gestito/da gestire — l'unica scrittura che fa Gestione Finanziaria.
      const { id, letto } = req.body || {};
      if (!id || typeof letto !== 'boolean') {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: id, letto' });
      }
      const rows = await sql`
        UPDATE avvisi_pagamento_fornitori SET letto = ${letto}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Avviso non trovato' });
      return res.status(200).json({ avviso: rowToAvviso(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: 'Parametro obbligatorio mancante: id' });
      await sql`DELETE FROM avvisi_pagamento_fornitori WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API avvisi pagamento fornitori:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
}
