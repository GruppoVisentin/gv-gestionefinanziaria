import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS fornitori_registry (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      ragione_sociale TEXT NOT NULL,
      piva_cf TEXT,
      indirizzo TEXT,
      telefono TEXT,
      email TEXT,
      pec TEXT,
      punta_net_id_cli_for TEXT,
      mestiere TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

function rowToFornitore(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    ragioneSociale: row.ragione_sociale,
    pIvaCf: row.piva_cf,
    indirizzo: row.indirizzo,
    telefono: row.telefono,
    email: row.email,
    pec: row.pec,
    puntaNetIdCliFor: row.punta_net_id_cli_for,
    mestiere: row.mestiere,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM fornitori_registry ORDER BY ragione_sociale ASC`;
      return res.status(200).json({ fornitori: rows.map(rowToFornitore) });
    }

    if (req.method === 'POST') {
      // Pubblica/aggiorna SOLO i dati anagrafici (fonte: Gestione Finanziaria, sia
      // fornitori inseriti a mano sia importati da PuntaNet). Non tocca mai la colonna
      // mestiere: quella si imposta solo da Direttore Cantiere (vedi PATCH sotto),
      // che è l'unica app con una sezione dedicata a categorizzare i fornitori per
      // mestiere — qui scrivendola andremmo a cancellare la categorizzazione fatta lì.
      const { source, sourceId, ragioneSociale, pIvaCf, indirizzo, telefono, email, pec, puntaNetIdCliFor } = req.body || {};
      if (!source || !sourceId || !ragioneSociale) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, ragioneSociale' });
      }
      const id = `${source}:${sourceId}`;
      const rows = await sql`
        INSERT INTO fornitori_registry (id, source, source_id, ragione_sociale, piva_cf, indirizzo, telefono, email, pec, punta_net_id_cli_for, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${ragioneSociale}, ${pIvaCf ?? null}, ${indirizzo ?? null}, ${telefono ?? null}, ${email ?? null}, ${pec ?? null}, ${puntaNetIdCliFor ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          ragione_sociale = EXCLUDED.ragione_sociale,
          piva_cf = EXCLUDED.piva_cf,
          indirizzo = EXCLUDED.indirizzo,
          telefono = EXCLUDED.telefono,
          email = EXCLUDED.email,
          pec = EXCLUDED.pec,
          punta_net_id_cli_for = EXCLUDED.punta_net_id_cli_for,
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ fornitore: rowToFornitore(rows[0]) });
    }

    if (req.method === 'PATCH') {
      // Imposta SOLO il mestiere — l'unico campo che Direttore Cantiere scrive su
      // questo registro, dalla sua sezione "Mestieri Fornitori".
      const { source, sourceId, mestiere } = req.body || {};
      if (!source || !sourceId) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId' });
      }
      const id = `${source}:${sourceId}`;
      const rows = await sql`
        UPDATE fornitori_registry SET mestiere = ${mestiere || null}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Fornitore non trovato nel registro' });
      return res.status(200).json({ fornitore: rowToFornitore(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const source = req.query?.source;
      const sourceId = req.query?.sourceId;
      if (!source || !sourceId) {
        return res.status(400).json({ error: 'Parametri obbligatori mancanti: source, sourceId' });
      }
      const id = `${source}:${sourceId}`;
      await sql`DELETE FROM fornitori_registry WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API fornitori:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
}
