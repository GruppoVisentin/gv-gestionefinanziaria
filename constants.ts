
export const CURRENCY_FORMATTER = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
});

export const DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

// --- NEW CATEGORIZATION ---

export const FIXED_COST_CATEGORIES: string[] = [
  // ─── PERSONALE STRUTTURA ───────────────────────────────────────
  "[PERSONALE] Stipendi Dipendenti Ufficio",
  "[PERSONALE] Contributi Dipendenti Ufficio",
  "[PERSONALE] Collaboratori Fissi",
  "[PERSONALE] Compenso Amministratori",

  // ─── CONSULENZE E PROFESSIONISTI ──────────────────────────────
  "[CONSULENZE] Commercialista",
  "[CONSULENZE] Consulenti Fissi",        // era: CONSULENTI OPEX20
  "[CONSULENZE] SOA e ISO",

  // ─── SEDE E STRUTTURA ─────────────────────────────────────────
  "[STRUTTURA] Affitti Sedi",
  "[STRUTTURA] Utenze Sedi",
  "[STRUTTURA] Software e Abbonamenti",
  "[STRUTTURA] Cancelleria e Materiali Ufficio",

  // ─── MEZZI E ATTREZZATURE ─────────────────────────────────────
  "[MEZZI] Assicurazione Mezzi e Bolli",
  "[MEZZI] Revisione Macchinari",
  "[MEZZI] Riparazioni Macchinari Programmate",  // era: RIPARAZIONI MACCHINARI
                                                  // (la parte urgente/imprevista
                                                  //  va nei variabili di cantiere)

  // ─── COMPLIANCE E FORMAZIONE ──────────────────────────────────
  "[COMPLIANCE] Assicurazioni Generali",
  "[COMPLIANCE] Corsi Dipendenti",
  "[COMPLIANCE] Visite Mediche Dipendenti",

  // ─── MARKETING ────────────────────────────────────────────────
  "[MARKETING] Pubblicità e Marketing",

  // ─── TASSE PATRIMONIALI ───────────────────────────────────────
  "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)",

  // ─── AMMORTAMENTI ─────────────────────────────────────────────
  // Voce NON monetaria: non genera uscita reale di cassa.
  // Va inserita manualmente ogni mese con importo simbolico (0 o valore reale)
  // per mantenere il CE corretto quando verrà integrato.
  // Nel Cash Flow non impatta il saldo bancario.
  "[STRUTTURA] Ammortamenti",             // VOCE NUOVA — era completamente assente

  // ─── ONERI FINANZIARI ─────────────────────────────────────────
  // Sono uscite reali di cassa — restano nel cash flow.
  // Il ceType 'onere_finanziario' le escluderà dal calcolo EBITDA nel CE futuro.
  "[FINANZA] Interessi Passivi Finanziamenti",  // era parte di: RATE E INTERESSI
  "[FINANZA] Commissioni e Bolli Bancari",
  // NOTA: la quota CAPITALE delle rate finanziamento non è un costo —
  // è rimborso di debito. Registrarla in [INVESTIMENTI] qui sotto.

  // ─── MOVIMENTI FISCALI ────────────────────────────────────────
  // Non sono costi aziendali — sono trasferimenti di cassa verso il fisco.
  // Restano nel cash flow perché impattano il saldo bancario.
  // Il ceType 'solo_cashflow' le escluderà totalmente dal CE futuro.
  "[FISCO] Versamento IVA",
  "[FISCO] F24 — IRPEF / IRES / IRAP",
  "[FISCO] Ritenute su Bonifici (versate)",     // era: RITENUTE SU BONIFICI

  // ─── STRAORDINARI ─────────────────────────────────────────────
  "[STRAORDINARI] Sanzioni e Penali",           // era: SANZIONI
  "[STRAORDINARI] Imprevisti Straordinari",     // era: IMPREVISTI
  "[STRAORDINARI] Volontariato e Donazioni",    // era: VOLONTARIATO

  // ─── DISTRIBUZIONE UTILE E SOCI ───────────────────────────────
  // Non è un costo aziendale ma è un'uscita reale di cassa.
  // Il ceType 'distribuzione_utile' la gestirà correttamente nel CE futuro.
  "[SOCI] Prelievo Utile Soci",                 // era: PRELIEVO UTILE SOCI + RITENUTA
  "[SOCI] Ritenuta su Prelievo Soci",           // separata per chiarezza
];

export const VARIABLE_COST_CATEGORIES: string[] = [
  // ─── MANODOPERA DIRETTA DI CANTIERE ───────────────────────────
  "[PERSONALE] Stipendi Dipendenti Operativi",
  "[PERSONALE] Contributi Dipendenti Operativi",
  "[PERSONALE] Subappalti Manodopera",

  // ─── MATERIALI E FORNITURE ────────────────────────────────────
  "[FORNITORI] Fornitori Materiali",
  "[CANTIERE] Noleggi Attrezzature e Mezzi",
  "[CANTIERE] Carburanti",

  // ─── SUBAPPALTI E PROFESSIONISTI DI CANTIERE ──────────────────
  "[FORNITORI] Subappalti su Cantieri",
  "[CONSULENZE] Professionisti Esterni di Cantiere",

  // ─── COSTI DIRETTI DI CANTIERE ────────────────────────────────
  "[CANTIERE] Assicurazione Cantieri",
  "[CANTIERE] Oneri Comunali",
  "[CANTIERE] Rifiuti e Macerie",
  "[CANTIERE] Pranzi e Trasferte Cantiere",           // era: PRANZI

  // ─── RIPARAZIONI URGENTI ──────────────────────────────────────
  // Le riparazioni urgenti/impreviste variano con l'attività
  // e vanno nei variabili — quelle programmate restano nei fissi.
  "[MEZZI] Riparazioni Macchinari Urgenti",           // era parte di: RIPARAZIONI MACCHINARI

  // ─── RITENUTE SU PROFESSIONISTI ───────────────────────────────
  // Non è un costo aziendale (è anticipo imposta del professionista)
  // ma è un'uscita di cassa reale — resta nel cash flow.
  // ceType 'solo_cashflow' la escluderà dal CE futuro.
  "[FISCO] Ritenute d'Acconto su Professionisti",     // era: RITENUTE D'ACCONTO...

  // ─── INVESTIMENTI E ACQUISIZIONI ──────────────────────────────
  // Non sono costi operativi — sono movimenti patrimoniali (CAPEX).
  // Restano nel cash flow perché impattano il saldo bancario.
  // Il ceType 'capex' le escluderà totalmente dal CE futuro.
  "[INVESTIMENTI] Acquisto Attrezzature e Macchinari",  // era: NUOVE ATTREZZATURE
  "[INVESTIMENTI] Acquisto Terreni per Sviluppo",       // era: ACQUISIZIONE TERRENI o IMMOBILI
  "[INVESTIMENTI] Acquisto Immobili per Sviluppo",
  "[INVESTIMENTI] Investimento in Nuova Società",       // era: NUOVA SOCIETA'
  "[FINANZA] Quota Capitale Rate Finanziamenti",        // era parte di: RATE E INTERESSI
];

export const EXPENSE_CATEGORIES = [...FIXED_COST_CATEGORIES, ...VARIABLE_COST_CATEGORIES];

export const INCOME_CATEGORIES: string[] = [
  // ─── RICAVI OPERATIVI CORE ────────────────────────────────────
  // Formano il fatturato ufficiale — entreranno nel CE come ricavi core.
  // "Pagamenti Commesse" era troppo generico: non permetteva di sapere
  // da quale attività arrivano i ricavi e quale linea di business guadagna.
  "[CANTIERE] SAL — Stato Avanzamento Lavori",        // era parte di: Pagamenti Commesse
  "[CANTIERE] Saldo Finale Commessa",                  // era parte di: Pagamenti Commesse
  "[CANTIERE] Caparra Confirmatoria",                  // fuori campo IVA — importo recuperato nel saldo
  "[CANTIERE] Manutenzioni e Piccoli Lavori",          // era parte di: Pagamenti Commesse
  "[IMMOBILIARE] Vendita Immobili e Terreni",          // era parte di: Pagamenti Commesse
  "[IMMOBILIARE] Affitti Attivi",                      // era parte di: Pagamenti Commesse

  // ─── ALTRI RICAVI OPERATIVI ───────────────────────────────────
  // Entreranno nel CE ma non come fatturato core.
  "[RIMBORSI] Rimborsi Spese da Clienti",              // era: Rimborsi (generico)
  "[RIMBORSI] Rimborsi Assicurativi",                  // era: Rimborsi (generico)
  "[RIMBORSI] Contributi e Incentivi Pubblici",        // era assente — sempre più frequente

  // ─── PROVENTI FINANZIARI ──────────────────────────────────────
  // Non sono ricavi operativi — entreranno nel CE come proventi finanziari.
  "[FINANZA] Ritorno da Investimenti / Dividendi",     // era: Ritorno da Investimenti

  // ─── SOLO CASH FLOW ───────────────────────────────────────────
  // Non sono ricavi — sono movimenti finanziari che impattano il conto
  // corrente ma non entrano mai nel CE come ricavi.
  "[FINANZA] Finanziamenti Ricevuti",                  // era: Finanziamenti
  "[CANTIERE] Anticipi da Clienti su Commessa",        // era assente — critico per edile

  // ─── STRAORDINARI ─────────────────────────────────────────────
  "[STRAORDINARI] Proventi Straordinari",              // era: Regali / Altro
  "[STRAORDINARI] Vendita Attrezzature e Cespiti",     // era assente

  // ─── GENERICO (da usare il meno possibile) ────────────────────
  // Mantenuto solo per compatibilità con transazioni esistenti.
  // In futuro: ogni voce dovrebbe avere la sua categoria specifica.
  "Altro / Non Classificato",                          // era: Altro
];

import { CEType } from './types';

export const CATEGORY_TO_CE_TYPE: Record<string, CEType> = {
  // RICAVI CORE
  "[CANTIERE] SAL — Stato Avanzamento Lavori":        'ricavo_core',
  "[CANTIERE] Saldo Finale Commessa":                  'ricavo_core',
  "[CANTIERE] Caparra Confirmatoria":                  'solo_cashflow',
  "[CANTIERE] Manutenzioni e Piccoli Lavori":          'ricavo_core',
  "[IMMOBILIARE] Vendita Immobili e Terreni":          'ricavo_immobiliare',
  "[IMMOBILIARE] Affitti Attivi":                      'ricavo_core',

  // RICAVI ALTRO
  "[RIMBORSI] Rimborsi Spese da Clienti":              'ricavo_altro',
  "[RIMBORSI] Rimborsi Assicurativi":                  'ricavo_altro',
  "[RIMBORSI] Contributi e Incentivi Pubblici":        'ricavo_altro',
  "[STRAORDINARI] Proventi Straordinari":              'ricavo_altro',
  "[STRAORDINARI] Vendita Attrezzature e Cespiti":     'straordinario',

  // PROVENTI FINANZIARI
  "[FINANZA] Ritorno da Investimenti / Dividendi":     'provento_finanziario',

  // SOLO CASH FLOW — MAI NEL CE
  "[FINANZA] Finanziamenti Ricevuti":                  'solo_cashflow',
  "[CANTIERE] Anticipi da Clienti su Commessa":        'solo_cashflow',
  "Altro / Non Classificato":                          'solo_cashflow',

  // COSTI VARIABILI
  "[PERSONALE] Stipendi Dipendenti Operativi":         'costo_variabile',
  "[PERSONALE] Contributi Dipendenti Operativi":       'costo_variabile',
  "[PERSONALE] Subappalti Manodopera":                 'costo_variabile',
  "[FORNITORI] Fornitori Materiali":                   'costo_variabile',
  "[CANTIERE] Noleggi Attrezzature e Mezzi":           'costo_variabile',
  "[CANTIERE] Carburanti":                             'costo_variabile',
  "[FORNITORI] Subappalti su Cantieri":                'costo_variabile',
  "[CONSULENZE] Professionisti Esterni di Cantiere":   'costo_variabile',
  "[CANTIERE] Assicurazione Cantieri":                 'costo_variabile',
  "[CANTIERE] Oneri Comunali":                         'costo_variabile',
  "[CANTIERE] Rifiuti e Macerie":                      'costo_variabile',
  "[CANTIERE] Pranzi e Trasferte Cantiere":            'costo_variabile',
  "[MEZZI] Riparazioni Macchinari Urgenti":            'costo_variabile',

  // COSTI FISSI (Studio e Struttura)
  "[PERSONALE] Stipendi Dipendenti Ufficio":           'costo_studio',
  "[PERSONALE] Contributi Dipendenti Ufficio":         'costo_studio',
  "[PERSONALE] Collaboratori Fissi":                   'costo_studio',
  "[PERSONALE] Compenso Amministratori":               'costo_studio',
  "[CONSULENZE] Commercialista":                       'costo_fisso',
  "[CONSULENZE] Consulenti Fissi":                     'costo_fisso',
  "[CONSULENZE] SOA e ISO":                            'costo_fisso',
  "[STRUTTURA] Affitti Sedi":                          'costo_fisso',
  "[STRUTTURA] Utenze Sedi":                           'costo_fisso',
  "[STRUTTURA] Software e Abbonamenti":                'costo_fisso',
  "[STRUTTURA] Cancelleria e Materiali Ufficio":       'costo_fisso',
  "[MEZZI] Assicurazione Mezzi e Bolli":               'costo_fisso',
  "[MEZZI] Revisione Macchinari":                      'costo_fisso',
  "[MEZZI] Riparazioni Macchinari Programmate":        'costo_fisso',
  "[COMPLIANCE] Assicurazioni Generali":               'costo_fisso',
  "[COMPLIANCE] Corsi Dipendenti":                     'costo_fisso',
  "[COMPLIANCE] Visite Mediche Dipendenti":            'costo_fisso',
  "[MARKETING] Pubblicità e Marketing":                'costo_fisso',
  "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)":'costo_fisso',

  // AMMORTAMENTO
  "[STRUTTURA] Ammortamenti":                          'ammortamento',

  // ONERI FINANZIARI (sotto EBITDA nel CE)
  "[FINANZA] Interessi Passivi Finanziamenti":         'onere_finanziario',
  "[FINANZA] Commissioni e Bolli Bancari":             'onere_finanziario',
  // SOLO CASH FLOW — FISCALE
  "[FISCO] Versamento IVA":                            'solo_cashflow',
  "[FISCO] F24 — IRPEF / IRES / IRAP":                'solo_cashflow',
  "[FISCO] Ritenute su Bonifici (versate)":            'solo_cashflow',
  "[FISCO] Ritenute d'Acconto su Professionisti":      'solo_cashflow',

  // CAPEX — SOLO CASH FLOW
  "[INVESTIMENTI] Acquisto Attrezzature e Macchinari": 'capex',
  "[INVESTIMENTI] Acquisto Terreni per Sviluppo":      'capex',
  "[INVESTIMENTI] Acquisto Immobili per Sviluppo":     'capex',
  "[INVESTIMENTI] Investimento in Nuova Società":      'capex',
  "[FINANZA] Quota Capitale Rate Finanziamenti":       'capex',

  // STRAORDINARI
  "[STRAORDINARI] Sanzioni e Penali":                  'straordinario',
  "[STRAORDINARI] Imprevisti Straordinari":            'straordinario',
  "[STRAORDINARI] Volontariato e Donazioni":           'straordinario',

  // DISTRIBUZIONE UTILE
  "[SOCI] Prelievo Utile Soci":                        'distribuzione_utile',
  "[SOCI] Ritenuta su Prelievo Soci":                  'distribuzione_utile',
};

export const CATEGORY_MIGRATION_MAP: Record<string, string> = {
  // ENTRATE
  "Pagamenti Commesse":                    "[CANTIERE] SAL — Stato Avanzamento Lavori",
  "Ritorno da Investimenti":               "[FINANZA] Ritorno da Investimenti / Dividendi",
  "Finanziamenti":                         "[FINANZA] Finanziamenti Ricevuti",
  "Regali":                                "[STRAORDINARI] Proventi Straordinari",
  "Rimborsi":                              "[RIMBORSI] Rimborsi Spese da Clienti",
  "Altro":                                 "Altro / Non Classificato",

  // USCITE — ex fissi
  "RIPARAZIONI MACCHINARI E ATTREZZATURE": "[MEZZI] Riparazioni Macchinari Programmate",
  "NUOVE ATTREZZATURE":                    "[INVESTIMENTI] Acquisto Attrezzature e Macchinari",
  "TASSE":                                 "[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)",
  "SANZIONI":                              "[STRAORDINARI] Sanzioni e Penali",
  "VERSAMENTO IVA":                        "[FISCO] Versamento IVA",
  "RATE E INTERESSI FINANZIAMENTI":        "[FINANZA] Interessi Passivi Finanziamenti",
  "SPESE BANCARIE":                        "[FINANZA] Commissioni e Bolli Bancari",
  "[FINANZA] Spese e Commissioni Bancarie": "[FINANZA] Commissioni e Bolli Bancari",
  "RITENUTE SU BONIFICI":                  "[FISCO] Ritenute su Bonifici (versate)",
  "IMPREVISTI":                            "[STRAORDINARI] Imprevisti Straordinari",
  "REVISIONE MACCHINARI":                  "[MEZZI] Revisione Macchinari",
  "PUBBLICITA' E MARKETING":               "[MARKETING] Pubblicità e Marketing",
  "AFFITTI SEDI":                          "[STRUTTURA] Affitti Sedi",
  "UTENZE SEDI":                           "[STRUTTURA] Utenze Sedi",
  "CANCELLERIA":                           "[STRUTTURA] Cancelleria e Materiali Ufficio",
  "SOFTWARE":                              "[STRUTTURA] Software e Abbonamenti",
  "ASSICURAZIONE MEZZI E BOLLI":           "[MEZZI] Assicurazione Mezzi e Bolli",
  "ASSICURAZIONI GENERALI":               "[COMPLIANCE] Assicurazioni Generali",
  "CORSI DIPENDENTI":                      "[COMPLIANCE] Corsi Dipendenti",
  "VISITE MEDICHE DIPENDENTI":             "[COMPLIANCE] Visite Mediche Dipendenti",
  "STIPENDI DIPENDENTI UFFICIO":           "[PERSONALE] Stipendi Dipendenti Ufficio",
  "CONTRIBUTI DIPENDENTI UFFICIO":         "[PERSONALE] Contributi Dipendenti Ufficio",
  "COLLABORATORI FISSI":                   "[PERSONALE] Collaboratori Fissi",
  "CONSULENTI OPEX20":                     "[CONSULENZE] Consulenti Fissi",
  "SOA E ISO":                             "[CONSULENZE] SOA e ISO",
  "COMMERCIALISTA":                        "[CONSULENZE] Commercialista",
  "VOLONTARIATO":                          "[STRAORDINARI] Volontariato e Donazioni",
  "COMPENSO AMMINISTRATORI":               "[PERSONALE] Compenso Amministratori",
  "PRELIEVO UTILE SOCI + RITENUTA":        "[SOCI] Prelievo Utile Soci",

  // USCITE — ex variabili
  "CARBURANTI":                            "[CANTIERE] Carburanti",
  "NOLEGGI":                               "[CANTIERE] Noleggi Attrezzature e Mezzi",
  "ASSICURAZIONE CANTIERI":                "[CANTIERE] Assicurazione Cantieri",
  "RITENUTE D'ACCONTO SU PROFESSIONISTI":  "[FISCO] Ritenute d'Acconto su Professionisti",
  "PRANZI":                                "[CANTIERE] Pranzi e Trasferte Cantiere",
  "RIFIUTI E MACERIE":                     "[CANTIERE] Rifiuti e Macerie",
  "STIPENDI DIPENDENTI OPERATIVI":         "[PERSONALE] Stipendi Dipendenti Operativi",
  "CONTRIBUTI DIPENDENTI OPERATIVI":       "[PERSONALE] Contributi Dipendenti Operativi",
  "SUBAPPALTI MANODOPERA":                 "[PERSONALE] Subappalti Manodopera",
  "FORNITORI MATERIALI":                   "[FORNITORI] Fornitori Materiali",
  "SUBAPPALTI SU CANTIERI":                "[FORNITORI] Subappalti su Cantieri",
  "PROFESSIONISTI ESTERNI":                "[CONSULENZE] Professionisti Esterni di Cantiere",
  "ACQUISIZIONE TERRENI o IMMOBILI":       "[INVESTIMENTI] Acquisto Terreni per Sviluppo",
  "NUOVA SOCIETA'":                        "[INVESTIMENTI] Investimento in Nuova Società",
};

// Mapping Category -> Suppliers/Subcategories
export const SUPPLIER_PRESETS: Record<string, string[]> = {
  '[MEZZI] Riparazioni Macchinari Programmate': [
    'Officina Fantin di Fantin Vito', 'Aci per girare con camion', 'Bollettino gru INAIL', 'Cenpi srl',
    'Guidolin', 'Visentin Tarcisio', "Autopiu'", 'Carrozzeria Basso', 'Ormet', 'Carrozzeria Piave',
    'Artigomme', 'Menegon Vittorio', 'Dal Bon studio', 'Mechanical Line solutions', 'Glasspoint service',
    'Sernagiotto Srl', 'Perin Vittoriono gommista', 'Tvm service', 'Miozzo Srl'
  ],
  '[INVESTIMENTI] Acquisto Attrezzature e Macchinari': ['Dametto Wanda'],
  '[FISCO] Tasse e Tributi Aziendali (IMU, TARI, ecc.)': [
    'Riferite all\'anno 2023 e acconti 2024', 'Comune di Altivole', 'Abaco comune di Caerano', 'Comune di Treviso',
    'Proloco Altivole e Caselle di Altivole', 'Versamento bollatura libri sociali', 'Codice Lei',
    'Abaco di Montebelluna', 'Abaco di Romano d\'Ezzelino', 'Abaco di Valdobbiadene', 'Ambienti',
    'Abaco Jesolo', 'Camera di commercio', 'Imu', 'Comune di Montebelluna'
  ],
  '[MEZZI] Revisione Macchinari': ['I.P.I. srl'],
  '[MARKETING] Pubblicità e Marketing': [
    'Marigraf', 'Pixartprinting', 'Pubblicarello', 'Gallo pubblicità', 'Stampasi', 'Neders italy',
    'Tpc group', 'Elegerbertt strassu', 'Grafi Comunicazione', 'Aruba', 'Pubblielle', 'Gift campaign', 'Eliocartotecnica'
  ],
  '[STRUTTURA] Utenze Sedi': ['Enel Energia', 'Api Reti Gas', 'a2a energia', 'Tim spa', 'Duferco'],
  '[STRUTTURA] Cancelleria e Materiali Ufficio': ['Team Ufficio', 'Felkart'],
  '[STRUTTURA] Software e Abbonamenti': ['Bs sistemi', 'Svar', 'Ots sistemi', 'We tech system', 'Acca', 'Puntanet'],
  '[MEZZI] Assicurazione Mezzi e Bolli': [
    'Polizza camion mercedes UNIPOL', 'Polizza camion man GENERALI', 'Polizza furgone daily 7 posti TUA ASSICURAZIONI',
    'Polizza assic. Escavatore', 'Assicurazione camion mercedes', 'Assicurazione fiorino',
    'Assicurazione jeep', 'Polizza daily vecchio'
  ],
  '[COMPLIANCE] Assicurazioni Generali': [
    'Rata annuale polizza ambiente - I.S.P.', 'Assicur. Poliza Infortuni GV', 'Assicur. Polizza Rc cantieri GV',
    'Assic. Responsabilità verso terzi', 'Assicurazione magazzini', 'Polizza assicurat. Intesa san paolo',
    'Polizza fidejussoria acquisto terreno contea', 'Spadavecchia & partners', 'Polizza catastrofali',
    'Assicurazione catastrofali', 'Polizza fidejussoria + car + postuma cond. Hop', 'Polizza investimento rischio con Generali'
  ],
  '[COMPLIANCE] Corsi Dipendenti': ['Ikon srls', 'Gestione ambienti'],
  '[COMPLIANCE] Visite Mediche Dipendenti': ['Labormedica'],
  '[PERSONALE] Stipendi Dipendenti Ufficio': ['Visentin Andrea', 'Bellini Simone', 'Troncon Nicola', 'Martignago Ilaria'],
  '[PERSONALE] Contributi Dipendenti Ufficio': ['Edilcassa Veneto + Udine', 'Cna', 'Coim'],
  '[PERSONALE] Collaboratori Fissi': ['De Filippo Giovanni', 'Selmedin Nesimoski'],
  '[CONSULENZE] SOA e ISO': ['Esna Soa', 'Bureau veritas'],
  '[CANTIERE] Carburanti': ['Oil Italia'],
  '[CANTIERE] Noleggi Attrezzature e Mezzi': [
    'Gr box', 'Sebach', 'Tailorsan', 'Service Ponteggi', 'Servizio ecologici su wc',
    'Ideal service', 'Vello', 'Sfedil', 'Unipol Move', 'Treviso Macchine'
  ],
  '[CANTIERE] Assicurazione Cantieri': [
    'Polizza CAR Condominio Solare - Godego', 'Polizza postuma Mihali Ioan', 'Polizza postuma Fruscalzo',
    'Polizza Car condominio Rose Blu', 'Polizza Car condominio Villa Eleonora', 'Polizza postuma Cond. Solare',
    'Polizza postuma De Marchi', 'Polizza Car Sernagiotto', 'Polizza postuma Cond. Caselle', 'Polizza postuma Feltrin',
    'Polizza postuma Gazzola', 'Polizza postuma villa eleonora', 'Polizza car Rossanese',
    'Fidejussioni cond. Sunflower Bon + F Restauri', 'Zurich insurance', 'Assicurazione postuma Gazzola',
    'Polizza postuma Gazzola', 'Deposito vincolo polizza fidejussoria zurich', 'Normatempo',
    'Fidejussione su app.to Cecchetto', 'Fidejussione De Rossi - Hop', 'Agenzia Asolo Generali fidejussione Lazzari',
    'Decennale postuma Sernagiotto', 'Decennale postuma Agenzia Generali', 'Decennale postuma rossanese'
  ],
  '[CANTIERE] Pranzi e Trasferte Cantiere': [
    'Al Ponte Levatoio', 'Trattoria al Giardino', 'Osteria La Caneva', 'Ai Galli ristorante',
    'Merlo Gino trattoria', 'Trattoria da Toni', 'Trattoria da Mason Valentina', 'Trattoria Bristol',
    'Trattoria Vecia Osteria', 'Smania Flavio', 'Bau Maria', 'Il filo srls', 'Osteria Guarnier',
    'Antica Casada', 'Mulinar Udine', 'Nord ristorazione', 'Gioia snc Udine', 'Ma.gi.ca. ristorante',
    'Trattoria da Ciccio', 'Pizzeria ristorante la rossa belluno', 'Albergo ristorante alle Crosere',
    'Roma Michele', 'Trattoria all\'Alpino', 'Altebas', 'Pizzeria Al Gabbiano'
  ],
  '[CANTIERE] Rifiuti e Macerie': ['Dal Zotto', 'Trentin Ghiaia', 'Marifer', 'Vello', 'Marcon'],
  '[PERSONALE] Stipendi Dipendenti Operativi': [
    'Cservenschi Cristian', 'Ferro Emilio', 'Kaloci Sokol', 'Mihali Ioan', 'Zandonà Denis', 'Bonetto Cristian', 'Nuovo operaio'
  ],
  '[PERSONALE] Contributi Dipendenti Operativi': ['Edilcassa Veneto + Udine', 'Cna', 'Coim'],
  '[PERSONALE] Subappalti Manodopera': [
    'Sauca Petru Marian', 'Giem Edile', 'Shijaku Azem', 'Berisha Blerim', 'Euroedil', 'New Edil',
    'Markedil', 'Costruzioni Nadi srls', 'fkf costruzioni', 'Dm costruzioni srl', 'Cielle di Caon', 'Muca Eqrem'
  ],
  '[FORNITORI] Fornitori Materiali': [
    'Edilserrajotto', 'Feltrin T.', 'L\'artibeni di Ferronato', 'Meta chiodatrici', 'Peri srl', 'Superbeton',
    'E.A. laser', 'Marmi 88', 'Artuso impianti', 'Vibetonpiave', 'Cidienne', 'Bmi Italia', 'Zanutta spa',
    'Calcestruzzi Ladano', 'Palmarini', 'Carniello', 'Accredito per fornitura da Edilcassa', 'Savio manufatti',
    'Dps srl ferramenta', 'Edile pedemontana', 'Andreazza', 'Artuso Legnami', 'Aces Srl', 'Epiu\' srl',
    'Betonrossi', 'Comin costruzioni', 'Immobiliare massimo', 'Sirio 7 di Pia Simone', 'Sfedil', 'Duferco',
    'Cossio Attilio', 'Ferrobeton', 'Bin sistemi', 'Mazzero', 'Pellizzari building', 'Torresan', 'Zilio nico',
    'Bongiorno antiforntunistica', 'Geoconsult', 'Cofiloc', 'J & D Favretto', 'Dametto Wanda', 'Kilotuu italia',
    'F.lli Bisol', 'Vudafieri f.lli', 'Tvm service', 'Solsider', 'Brunato', 'Rgm prove', 'Spurgatori riese',
    'A.a.a.m.p. estintori', 'Fornaci grigolin', 'Mavis', 'Novalinea arredo', 'Isolex', 'Stanghellini',
    'F.lli Pizziolo', 'Camini Dumont', 'Bellotto legnami', 'Alto trevigiano Servizi', 'La idroferramenta',
    'Dpm dalla Mora', 'Corpo nazionale dei vigili del fuoco', 'Cav Cestaro', 'Sd group', 'Rotho Blass',
    'Panalex', 'Mangh', 'Nuova costruzione sas', 'Gazzola srls', 'Newgips', 'Fai da Te di Zollo Luca',
    'Amr srl', 'RR Group', 'Issepon', 'Arredil', 'Consorizio Piave', 'Consorizio Bonifica Piave',
    'Cementart', 'E-distribuzione', 'Enel Energia'
  ],
  '[FORNITORI] Subappalti su Cantieri': [
    'Munaretto', 'Solar system', 'Lattoneria Rossanese', 'Asolo Pavimenti', 'il fabbro srl', 'Nart Sonia',
    'Decorgesso srls', 'Galliazzo Ivano', 'Visentin & Gasparetto', 'Geosolar', 'Agostini Sergio',
    'Aeerre costruzioni', 'Conte Ambienti Esterni', 'Falegnameria Trentin', 'Visentin Francesco',
    'Dkh srls', 'Masaro Fabio', 'Roccon Silvio', 'Pozzobon Serramenti', 'M.N. costruzioni srls',
    'Edilmuli di zogaj', 'Timexpert', 'Termoidraulica G.sc.', 'Cbm martignago', 'Tm toniolo',
    'Ganeo adriano', 'Bs impianti', 'Colordesign', 'E.p. ponteggi', 'Az. Florovivaistica Giandino',
    'Bonetto', 'Miftaroski Fikmet', 'Metope', 'Tm toniolo massimo', 'Serramenti Ruffato',
    'Ikon tecnology', 'Edilmonastier', 'Pedemontana Serramenti', 'Guritenco Igor', 'Soligo Damiano',
    'Contarin', 'Dametto Simone', 'Dm Posa srls', 'Moro serrande', 'Cetos srl', 'Eurocostruzioni srls',
    'Giuliano coperture srls', 'Nicola metal design', 'Libra serramenti', 'Paesaggi umbri consorzio',
    'Sbrissa sebastiano giardini', 'Moretto scavi', 'Lillo Coperture', 'Alpac', 'Edile coperture',
    'Pizzolato Jody', 'Edillux di Abo Ghazalah', 'Visentin Costruzioni Srl', 'Storgato'
  ],
  '[CONSULENZE] Professionisti Esterni di Cantiere': [
    'Csb centro sviluppo brevetti', 'Cusinato', 'Stradiotto Riccardo', 'Sbrissa Michele', 'Studio Dal Bon',
    'Bizzotto', 'Gallina Steven', 'Lappo', 'Roncato', 'Franceschini', 'Credit safe', 'Mazzocato',
    'Brera Rossella', 'Ragionier Ferreri', 'Gazzola Edoardo', 'Gazzola Alessia', 'Lottizzaz. Ambito 6 saldo rata',
    'Studio Spoladori', 'Mason Gianfilippo', 'Mountech Srl Stp', 'R.Z. Progetti', 'Dega investimenti',
    'Normatempo', 'Favero Luca', 'Berton', 'Semenzin e Sernagiotto', 'Torresan associati', 'Bordignon Simone',
    'Avvocato Lazzaron', 'Avvocati caesoldi', 'Bonardi Arch. Mattia', 'Ballon Davide', 'Studio Piovesan',
    'Geologo Bernardi', '593 studio', 'De Vecchi fotografo', 'Notaio Imparato', 'Menti pratiche',
    'Abaco comuni vari', 'Zone intermediazione immobiliare', 'Studio legale per valutazione',
    'Avvocato Talluto Tommaso', 'Presidia Group', 'Ordine architetti', 'Agenzia immobiliare Lellis',
    'Bresolin Ing. Marco', 'Agenzia accordi di Marini', 'Gobbo architetto', 'Brun Luca', 'Sicura spa',
    'Bureau veritas italia ( iso )', 'Condominio Caselle', 'Pasetto Alfrino', 'Libralato Michele',
    'Comune di Castelfranco per zogaj', 'Puntanet', 'Prevedi per Nicola', 'Adecco italia',
    'Amministratore lottizz. Contea', 'Rete group'
  ],
  '[INVESTIMENTI] Acquisto Terreni per Sviluppo': ['Venditore terreno', 'Notaio per terreno', 'Tasse per terreno'],
  '[INVESTIMENTI] Investimento in Nuova Società': ['Notaio per nuova società', 'Capitale sociale nuova società', 'Finanziamenti su nuova società']
};
