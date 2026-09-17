import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

// Avvisi "pagamento fornitore in arrivo": pubblicati SOLO da Direttore Cantiere,
// quando una lavorazione assegnata a un fornitore con pagamento_a_fine_lavorazione=true
// (vedi fornitori_registry) viene segnata come finita, oppure quando scatta una rata di
// un contratto fornitore confermato (vedi SupplierContract in DC — in quel caso arriva
// anche `percentuale`). Nasce sempre "provvisorio" (validato=false): Gestione Finanziaria
// lo vede subito nella tab "Pagamenti Fornitori in Arrivo" con la % indicativa, ma è il
// Direttore di QUEL cantiere, in Direttore Cantiere, a validarlo scrivendo l'importo reale
// (importo_validato) — solo dopo passa da "in attesa di validazione" a confermato. `letto`
// resta la spunta di Gestione Finanziaria per segnarlo come gestito, indipendente da validato.
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
  await sql`ALTER TABLE avvisi_pagamento_fornitori ADD COLUMN IF NOT EXISTS percentuale NUMERIC`;
  await sql`ALTER TABLE avvisi_pagamento_fornitori ADD COLUMN IF NOT EXISTS validato BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE avvisi_pagamento_fornitori ADD COLUMN IF NOT EXISTS importo_validato NUMERIC`;
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toNumber(value: any): number | null {
  return value === null || value === undefined ? null : Number(value);
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
    percentuale: toNumber(row.percentuale),
    letto: row.letto,
    validato: row.validato,
    importoValidato: toNumber(row.importo_validato),
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
      const { source, sourceId, cantiereNome, fornitoreNome, lavorazioneNome, dataCompletamento, note, percentuale } = req.body || {};
      if (!source || !sourceId || !cantiereNome || !fornitoreNome || !lavorazioneNome) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, cantiereNome, fornitoreNome, lavorazioneNome' });
      }
      const id = `${source}:${sourceId}`;
      // Idempotente sull'id (progetto+lavorazione): un re-invio aggiorna i dati
      // descrittivi ma NON tocca "letto" né "validato"/"importo_validato", per non far
      // ricomparire come nuovo/non validato un avviso già gestito o già validato.
      const rows = await sql`
        INSERT INTO avvisi_pagamento_fornitori (id, source, source_id, cantiere_nome, fornitore_nome, lavorazione_nome, data_completamento, note, percentuale, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${cantiereNome}, ${fornitoreNome}, ${lavorazioneNome}, ${dataCompletamento ?? null}, ${note ?? null}, ${percentuale ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          cantiere_nome = EXCLUDED.cantiere_nome,
          fornitore_nome = EXCLUDED.fornitore_nome,
          lavorazione_nome = EXCLUDED.lavorazione_nome,
          data_completamento = EXCLUDED.data_completamento,
          note = EXCLUDED.note,
          percentuale = EXCLUDED.percentuale,
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ avviso: rowToAvviso(rows[0]) });
    }

    if (req.method === 'PATCH') {
      // Due scritture distinte sullo stesso avviso, ciascuna dalla sua app:
      // - letto: Gestione Finanziaria lo segna come gestito/da gestire.
      // - validato + importoValidato: il Direttore di quel cantiere, in Direttore
      //   Cantiere, conferma l'importo reale — mai scritto da Gestione Finanziaria.
      const { id, letto, validato, importoValidato } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Campo obbligatorio mancante: id' });
      if (typeof letto !== 'boolean' && typeof validato !== 'boolean') {
        return res.status(400).json({ error: 'Serve almeno uno tra letto e validato' });
      }
      const rows = typeof validato === 'boolean'
        ? await sql`
            UPDATE avvisi_pagamento_fornitori
            SET validato = ${validato}, importo_validato = ${importoValidato ?? null}, updated_at = now()
            WHERE id = ${id}
            RETURNING *
          `
        : await sql`
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
