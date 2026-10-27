// Mappatura condivisa Excel -> app (nessun side effect: solo dati ed export, sicuro da importare da
// qualunque script). Estratta da confrontaFlussoCassaExcel.mjs ed esportata anche per
// elencaMovimentiPerCategoria.mjs, che la usa per risolvere un filtro categoria scritto nel nome
// Excel (es. "NUOVE ATTREZZATURE") sul/sui nome/i app corrispondente/i — prima la teneva duplicata
// in un confronto per sottostringa sul solo nome app, che falliva silenziosamente ogni volta che il
// nome Excel non compariva come sottostringa in quello app (trovato in review: Codex, PR #47,
// 2026-10-27). Un'unica fonte evita anche che le due mappature si disallineino nel tempo.

// Excel (nome vecchio, USCITE) → categorie app corrispondenti. Dove l'Excel aveva UNA voce e l'app
// l'ha splittata in piu' categorie, qui si sommano per tornare comparabili. `incerta: true` segnala
// una mappatura dedotta per nome o uno split non documentato esplicitamente in
// CATEGORY_MIGRATION_MAP — da verificare a mano, non è detto che il confronto per quella riga sia
// affidabile.
export const MAPPATURA_USCITE = {
  'RIPARAZIONI MACCHINARI E ATTREZZATURE': { app: ['[MEZZI] Riparazioni Macchinari Programmate', '[MEZZI] Riparazioni Macchinari Urgenti'], incerta: true },
  'NUOVE ATTREZZATURE': { app: ['[INVESTIMENTI] Acquisto Attrezzature e Macchinari'], incerta: false },
  'TASSE': { app: ['[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)', '[CANTIERE] Oneri Comunali, Abaco e Occupazioni'], incerta: true },
  'SANZIONI': { app: ['[STRAORDINARI] Sanzioni e Penali'], incerta: false },
  'VERSAMENTO IVA': { app: ['[FISCO] Versamento IVA'], incerta: false },
  'RATE E INTERESSI FINANZIAMENTI': { app: ['[FINANZA] Interessi Passivi Finanziamenti', '[FINANZA] Quota Capitale Rate Finanziamenti'], incerta: true },
  'SPESE BANCARIE': { app: ['[FINANZA] Commissioni e Bolli Bancari'], incerta: false },
  'ADDEBITO CARTE DI CREDITO': { app: [], incerta: true }, // NESSUNA mappatura trovata ne' in CATEGORY_MIGRATION_MAP ne' in MAPPA_USCITE di ImportStoricoModal.tsx
  'RITENUTE SU BONIFICI': { app: ["[FISCO] Ritenute su Bonifici (versate)"], incerta: false },
  'IMPREVISTI': { app: ['[STRAORDINARI] Imprevisti Straordinari'], incerta: false },
  'REVISIONE MACCHINARI': { app: ['[MEZZI] Revisione Macchinari'], incerta: false },
  "PUBBLICITA' E MARKETING": { app: ['[MARKETING] Pubblicità e Marketing'], incerta: false },
  'AFFITTI SEDI': { app: ['[STRUTTURA] Affitti Sedi'], incerta: false },
  'UTENZE SEDI': { app: ['[STRUTTURA] Utenze Sedi', '[CANTIERE] Utenze Cantiere'], incerta: true },
  'CANCELLERIA': { app: ['[STRUTTURA] Cancelleria e Materiali Ufficio'], incerta: false },
  'SOFTWARE': { app: ['[STRUTTURA] Software e Abbonamenti'], incerta: false },
  'ASSICURAZIONE MEZZI E BOLLI': { app: ['[MEZZI] Assicurazione Mezzi e Bolli'], incerta: false },
  'ASSICURAZIONI GENERALI': { app: ['[COMPLIANCE] Assicurazioni Generali'], incerta: false },
  'CORSI DIPENDENTI': { app: ['[COMPLIANCE] Corsi Dipendenti'], incerta: false },
  'VISITE MEDICHE DIPENDENTI': { app: ['[COMPLIANCE] Visite Mediche Dipendenti'], incerta: false },
  'STIPENDI DIPENDENTI UFFICIO': { app: ['[PERSONALE] Stipendi Dipendenti Ufficio'], incerta: false },
  'CONTRIBUTI DIPENDENTI UFFICIO': { app: ['[PERSONALE] Contributi Dipendenti Ufficio'], incerta: false },
  'COLLABORATORI FISSI': { app: ['[PERSONALE] Collaboratori Fissi'], incerta: false },
  'CONSULENTI OPEX20': { app: ['[CONSULENZE] Consulenti Fissi'], incerta: false },
  'SOA E ISO': { app: ['[CONSULENZE] SOA e ISO'], incerta: false },
  'COMMERCIALISTA': { app: ['[CONSULENZE] Commercialista'], incerta: false },
  'VOLONTARIATO': { app: ['[STRAORDINARI] Volontariato e Donazioni'], incerta: false },
  'COMPENSO AMMINISTRATORI': { app: ['[PERSONALE] Compenso Amministratori'], incerta: false },
  'PRELIEVO UTILE SOCI + RITENUTA': { app: ['[SOCI] Prelievo Utile Soci', '[SOCI] Ritenuta su Prelievo Soci'], incerta: true },
  'CARBURANTI': { app: ['[CANTIERE] Carburanti'], incerta: false },
  'NOLEGGI': { app: ['[CANTIERE] Noleggi Attrezzature e Mezzi'], incerta: false },
  'ASSICURAZIONE CANTIERI': { app: ['[CANTIERE] Assicurazione Cantieri'], incerta: false },
  "RITENUTE D'ACCONTO SU PROFESSIONISTI": { app: ["[FISCO] Ritenute d'Acconto su Professionisti"], incerta: false },
  'PRANZI': { app: ['[CANTIERE] Pranzi e Trasferte Cantiere'], incerta: false },
  'RIFIUTI E MACERIE': { app: ['[CANTIERE] Rifiuti e Macerie'], incerta: false },
  'STIPENDI DIPENDENTI OPERATIVI': { app: ['[PERSONALE] Stipendi Dipendenti Operativi'], incerta: false },
  'CONTRIBUTI DIPENDENTI OPERATIVI': { app: ['[PERSONALE] Contributi Dipendenti Operativi'], incerta: false },
  'SUBAPPALTI MANODOPERA': { app: ['[PERSONALE] Subappalti Manodopera'], incerta: false },
  'FORNITORI MATERIALI': { app: ['[FORNITORI] Fornitori Materiali'], incerta: false },
  'SUBAPPALTI SU CANTIERI': { app: ['[FORNITORI] Subappalti su Cantieri'], incerta: false },
  'PROFESSIONISTI ESTERNI': { app: ['[CONSULENZE] Professionisti Esterni di Cantiere'], incerta: false },
  'ACQUISIZIONE TERRENI o IMMOBILI': { app: ['[INVESTIMENTI] Acquisto Terreni per Sviluppo', '[INVESTIMENTI] Acquisto Immobili per Sviluppo'], incerta: true },
  "NUOVA SOCIETA'": { app: ['[INVESTIMENTI] Investimento in Nuova Società'], incerta: false },
};

// Excel (nome vecchio, ENTRATE) → categorie app corrispondenti. Vedi confrontaFlussoCassaExcel.mjs
// per il contesto completo su come viene calcolato il lato Excel di queste due voci.
export const MAPPATURA_ENTRATE = {
  'INCASSI CLIENTI (somma righe nel foglio, mappate su SAL dall\'importer storico)': { app: ['[CANTIERE] SAL — Stato Avanzamento Lavori'], incerta: true },
  'FINANZIAMENTI (riga "ENTRATE DA ALTRI FINANZIAMENTI" nel riepilogo liquidita\')': { app: ['[FINANZA] Finanziamenti Ricevuti'], incerta: false },
};
