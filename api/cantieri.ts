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
  // Id numerico PuntaNet del cantiere (Project.puntaNetCantiereId), collegato a
  // mano da Gestione Finanziaria — permette a Direttore Cantiere di incrociare,
  // per un proprio cantiere nativo, quali fornitori del registro condiviso
  // risultano avervi fatturato secondo PuntaNet (vedi fornitori_registry.per_cantiere).
  await sql`ALTER TABLE cantieri ADD COLUMN IF NOT EXISTS punta_net_cantiere_id INTEGER`;
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  // The driver returns DATE columns as JS Date objects; String(date) gives
  // toString() ("Sun Jan 15 2024 ...") not an ISO string, so slicing that
  // silently drops the year. Format explicitly instead.
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
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
    puntaNetCantiereId: row.punta_net_cantiere_id,
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
      const { source, sourceId, nome, cliente, luogo, dataInizio, dataConsegna, stato, puntaNetCantiereId } = req.body || {};
      if (!source || !sourceId || !nome || !stato) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, nome, stato' });
      }
      const id = `${source}:${sourceId}`;
      // puntaNetCantiereId non è mai obbligatorio e non viene mai inviato da Direttore
      // Cantiere: se assente in questa richiesta non va toccato (COALESCE sul valore
      // già presente), altrimenti ogni pubblicazione di Direttore Cantiere lo
      // azzererebbe di nuovo.
      const rows = await sql`
        INSERT INTO cantieri (id, source, source_id, nome, cliente, luogo, data_inizio, data_consegna, stato, punta_net_cantiere_id, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${nome}, ${cliente ?? null}, ${luogo ?? null}, ${dataInizio ?? null}, ${dataConsegna ?? null}, ${stato}, ${puntaNetCantiereId ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome,
          cliente = EXCLUDED.cliente,
          luogo = EXCLUDED.luogo,
          data_inizio = EXCLUDED.data_inizio,
          data_consegna = EXCLUDED.data_consegna,
          stato = EXCLUDED.stato,
          punta_net_cantiere_id = COALESCE(EXCLUDED.punta_net_cantiere_id, cantieri.punta_net_cantiere_id),
          updated_at = now()
        RETURNING *
      `;
      return res.status(200).json({ cantiere: rowToCantiere(rows[0]) });
    }

    if (req.method === 'DELETE') {
      const source = req.query?.source;
      const sourceId = req.query?.sourceId;
      if (!source || !sourceId) {
        return res.status(400).json({ error: 'Parametri obbligatori mancanti: source, sourceId' });
      }
      const id = `${source}:${sourceId}`;
      await sql`DELETE FROM cantieri WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Metodo non consentito' });
  } catch (error: any) {
    console.error('Errore API cantieri:', error);
    return res.status(500).json({ error: error.message || 'Errore interno' });
  }
}
