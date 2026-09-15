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
  // Aggiunte in un secondo momento (riepilogo economico per le insight della tab
  // "Mestieri Fornitori") — la tabella esisteva già in produzione, quindi vanno
  // aggiunte con ALTER, non basta il CREATE TABLE IF NOT EXISTS sopra.
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS numero_fatture INTEGER`;
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS fatturato_anno_corrente NUMERIC`;
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS fatturato_totale NUMERIC`;
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS ultima_fattura DATE`;
  // Termini di pagamento da contratto — scritti solo da Gestione Finanziaria (mai
  // da Direttore Cantiere, che li legge soltanto per decidere quando avvisare
  // l'amministrazione di un pagamento in arrivo).
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS pagamento_a_fine_lavorazione BOOLEAN`;
  await sql`ALTER TABLE fornitori_registry ADD COLUMN IF NOT EXISTS termini_pagamento_note TEXT`;
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
    numeroFatture: row.numero_fatture,
    fatturatoAnnoCorrente: row.fatturato_anno_corrente !== null ? Number(row.fatturato_anno_corrente) : null,
    fatturatoTotale: row.fatturato_totale !== null ? Number(row.fatturato_totale) : null,
    ultimaFattura: toDateStr(row.ultima_fattura),
    pagamentoAFineLavorazione: row.pagamento_a_fine_lavorazione,
    terminiPagamentoNote: row.termini_pagamento_note,
    updatedAt: row.updated_at,
  };
}

function toDateStr(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
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
      const {
        source, sourceId, ragioneSociale, pIvaCf, indirizzo, telefono, email, pec, puntaNetIdCliFor,
        numeroFatture, fatturatoAnnoCorrente, fatturatoTotale, ultimaFattura,
        pagamentoAFineLavorazione, terminiPagamentoNote,
      } = req.body || {};
      if (!source || !sourceId || !ragioneSociale) {
        return res.status(400).json({ error: 'Campi obbligatori mancanti: source, sourceId, ragioneSociale' });
      }
      const id = `${source}:${sourceId}`;
      const rows = await sql`
        INSERT INTO fornitori_registry (id, source, source_id, ragione_sociale, piva_cf, indirizzo, telefono, email, pec, punta_net_id_cli_for, numero_fatture, fatturato_anno_corrente, fatturato_totale, ultima_fattura, pagamento_a_fine_lavorazione, termini_pagamento_note, updated_at)
        VALUES (${id}, ${source}, ${sourceId}, ${ragioneSociale}, ${pIvaCf ?? null}, ${indirizzo ?? null}, ${telefono ?? null}, ${email ?? null}, ${pec ?? null}, ${puntaNetIdCliFor ?? null}, ${numeroFatture ?? null}, ${fatturatoAnnoCorrente ?? null}, ${fatturatoTotale ?? null}, ${ultimaFattura ?? null}, ${pagamentoAFineLavorazione ?? null}, ${terminiPagamentoNote ?? null}, now())
        ON CONFLICT (id) DO UPDATE SET
          ragione_sociale = EXCLUDED.ragione_sociale,
          piva_cf = EXCLUDED.piva_cf,
          indirizzo = EXCLUDED.indirizzo,
          telefono = EXCLUDED.telefono,
          email = EXCLUDED.email,
          pec = EXCLUDED.pec,
          punta_net_id_cli_for = EXCLUDED.punta_net_id_cli_for,
          numero_fatture = EXCLUDED.numero_fatture,
          fatturato_anno_corrente = EXCLUDED.fatturato_anno_corrente,
          fatturato_totale = EXCLUDED.fatturato_totale,
          ultima_fattura = EXCLUDED.ultima_fattura,
          pagamento_a_fine_lavorazione = EXCLUDED.pagamento_a_fine_lavorazione,
          termini_pagamento_note = EXCLUDED.termini_pagamento_note,
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
