import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS clienti (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      piva_cf TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

function rowToCliente(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    nome: row.nome,
    pIvaCf: row.piva_cf,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM clienti ORDER BY nome ASC`;
      return res.status(200).json({ clienti: rows.map(rowToCliente) });
    }

    if (req.method === 'POST') {
      const { source, sourceId, nome, pIvaCf } = req.body || {};
      if (!source || !sourceId || !nome) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, nome' });
      }
      const id = `${source}:${sourceId}`;
      const rows = await sql`
        INSERT INTO clienti (id, source, source_id, nome, piva_cf, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${nome}, ${pIvaCf ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          piva_cf = EXCLUDED.piva_cf,
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ cliente: rowToCliente(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const source = req.query?.source;
      const sourceId = req.query?.sourceId;
      if (!source || !sourceId) {
        return res.status(400).json({ error: 'Parametri obbligatori mancanti: source, sourceId' });
      }
      const id = `${source}:${sourceId}`;
      await sql`DELETE FROM clienti WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API clienti:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
}
