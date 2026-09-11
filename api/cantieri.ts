import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.GV_SHARED_DB_DATABASE_URL!);

async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS cantieri (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      cliente TEXT,
      luogo TEXT,
      data_inizio DATE,
      data_consegna DATE,
      stato TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function rowToCantiere(row: any) {
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    nome: row.nome,
    cliente: row.cliente,
    luogo: row.luogo,
    dataInizio: toDateStr(row.data_inizio),
    dataConsegna: toDateStr(row.data_consegna),
    stato: row.stato,
    updatedAt: row.updated_at,
  };
}

export default async function handler(req: any, res: any) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM cantieri ORDER BY updated_at DESC`;
      return res.status(200).json({ cantieri: rows.map(rowToCantiere) });
    }

    if (req.method === 'POST') {
      const { source, sourceId, nome, cliente, luogo, dataInizio, dataConsegna, stato } = req.body || {};
      if (!source || !sourceId || !nome || !stato) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, nome, stato' });
      }
      const id = `${source}:${sourceId}`;
      const rows = await sql`
        INSERT INTO cantieri (id, source, source_id, nome, cliente, luogo, data_inizio, data_consegna, stato, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${nome}, ${cliente ?? null}, ${luogo ?? null}, ${dataInizio ?? null}, ${dataConsegna ?? null}, ${stato}, now())
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          cliente = EXCLUDED.cliente,
          luogo = EXCLUDED.luogo,
          data_inizio = EXCLUDED.data_inizio,
          data_consegna = EXCLUDED.data_consegna,
          stato = EXCLUDED.stato,
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ cantiere: rowToCantiere(rows[0]) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API cantieri:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
}
