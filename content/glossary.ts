import { AppView } from '../types';

export interface FormulaPassaggio {
  label: string;
  formula: string;
}

export interface EsempioNumerico {
  dati: string;
  calcolo: string;
  risultato: string;
}

export interface SogliaEdilizia {
  ottimo?: string;
  buono?: string;
  attenzione?: string;
  critico?: string;
  nota?: string;
}

export interface TermineGlossario {
  id: string;
  nome: string;
  categoria: 'ce' | 'overhead' | 'orario' | 'rating' | 'iva' | 'fiscale' | 'concetti';
  origine: string;
  definizione: string;
  formulaTestuale?: string;
  formulaPassaggi?: FormulaPassaggio[];
  esempioNumerico?: EsempioNumerico;
  doveAppareNellApp: string[];
  sogliaEdilizia?: SogliaEdilizia;
  connessoCon?: string[];
  erroreComune?: string;
}

export const GLOSSARIO: TermineGlossario[] = [

  // ─── CONTO ECONOMICO ────────────────────────────────────────────

  {
    id: 'fatturato',
    nome: 'Fatturato / Ricavi Core',
    categoria: 'ce',
    origine: 'Dal latino "fattura" — il totale delle fatture emesse nell\'esercizio',
    definizione: 'È la somma di tutti i ricavi operativi principali: SAL emessi o incassati, saldi finali commessa, manutenzioni, vendite immobili e affitti attivi. Non include finanziamenti ricevuti, anticipi clienti o rimborsi — quelli non sono ricavi ma movimenti di cassa.',
    formulaTestuale: 'Fatturato = SAL + Saldi Finali + Manutenzioni + Vendite Immobili + Affitti Attivi',
    formulaPassaggi: [
      { label: 'Somma tutti i SAL incassati nel periodo', formula: 'Σ [CANTIERE] SAL — Stato Avanzamento Lavori' },
      { label: 'Aggiungi i saldi finali commessa', formula: '+ Σ [CANTIERE] Saldo Finale Commessa' },
      { label: 'Aggiungi manutenzioni e piccoli lavori', formula: '+ Σ [CANTIERE] Manutenzioni e Piccoli Lavori' },
      { label: 'Aggiungi vendite immobiliari e affitti', formula: '+ Σ [IMMOBILIARE] Vendita + Affitti Attivi' },
    ],
    esempioNumerico: {
      dati: 'SAL marzo €45.000 + Saldo finale Rossanese €28.000 + Manutenzione Condominio €3.200',
      calcolo: '45.000 + 28.000 + 3.200',
      risultato: 'Fatturato marzo = €76.200',
    },
    doveAppareNellApp: ['CEView — riga Ricavi Core', 'Dashboard — Entrate', 'AnalisiView — Numeri Sacri #1'],
    erroreComune: 'Non confondere il SAL con l\'acconto cliente. L\'acconto va in [CANTIERE] Anticipi da Clienti → solo cash flow, non fatturato. Il SAL è la fattura emessa per lavori eseguiti.',
    connessoCon: ['primo_margine', 'break_even', 'dso'],
  },

  {
    id: 'primo_margine',
    nome: 'Primo Margine',
    categoria: 'ce',
    origine: 'Detto anche "Gross Profit" o "Margine Lordo" — è il primo livello di redditività dopo i costi direttamente legati alla produzione',
    definizione: 'Quanto resta del Valore della Produzione dopo aver pagato tutto ciò che serve direttamente per fare i lavori: manodopera operativa, materiali, subappalti, noleggi, carburanti. Non include ancora i costi della struttura aziendale.',
    formulaTestuale: 'Primo Margine = Valore della Produzione (Ricavi ± Variazione Rimanenze) − Costi Variabili',
    formulaPassaggi: [
      { label: 'Parti dal Valore della Produzione', formula: 'Ricavi Core + Altri Ricavi ± Variazione Rimanenze' },
      { label: 'Sottrai tutti i costi variabili di cantiere', formula: '− Stipendi Operativi − Contributi Operativi − Materiali − Subappalti − Noleggi − Carburanti − Professionisti Cantiere' },
      { label: 'Il risultato è il Primo Margine', formula: '= Valore Produzione − Costi Variabili' },
    ],
    esempioNumerico: {
      dati: 'Fatturato €800.000, Costi Variabili totali: Stipendi operativi €120k + Contributi €40k + Materiali €220k + Subappalti €100k + Noleggi €20k',
      calcolo: '800.000 − (120.000 + 40.000 + 220.000 + 100.000 + 20.000) = 800.000 − 500.000',
      risultato: 'Primo Margine = €300.000 → 37,5% sul fatturato',
    },
    doveAppareNellApp: ['CEView — riga PRIMO MARGINE (A-B)', 'AnalisiView — Numeri Sacri #2'],
    sogliaEdilizia: {
      ottimo: '> 35%',
      buono: '25–35%',
      attenzione: '15–25%',
      critico: '< 15%',
      nota: 'Sotto il 20% con struttura aziendale, il pareggio è quasi impossibile',
    },
    connessoCon: ['fatturato', 'ebitda', 'overhead_rate_totale'],
    erroreComune: 'Un primo margine alto non significa utile: se la struttura aziendale costa troppo (overhead elevato) si può avere un buon primo margine e un EBITDA negativo.',
  },

  {
    id: 'ebitda',
    nome: 'EBITDA',
    categoria: 'ce',
    origine: 'Acronimo inglese: Earnings Before Interest, Taxes, Depreciation and Amortization — cioè "Utile prima di interessi, tasse, svalutazioni e ammortamenti"',
    definizione: 'È il margine operativo lordo — quello che l\'azienda produce con la sua attività operativa, prima di considerare come è finanziata (interessi) e prima delle scritture contabili non monetarie (ammortamenti). È l\'indicatore preferito dalle banche per valutare la capacità di rimborso dei finanziamenti.',
    formulaTestuale: 'EBITDA = Primo Margine − Costi Studio − Altri Costi Fissi',
    formulaPassaggi: [
      { label: 'Parti dal Primo Margine', formula: 'Ricavi − Costi Variabili' },
      { label: 'Sottrai i costi del personale tecnico e studio', formula: '− Stipendi Ufficio − Contributi Ufficio − Collaboratori − Compenso Amministratori' },
      { label: 'Sottrai gli altri costi fissi strutturali', formula: '− Affitti − Utenze − Software − Assicurazioni − Marketing − Consulenze − Tasse aziendali' },
      { label: 'Nota: gli ammortamenti NON si sottraggono qui', formula: 'Ammortamenti e oneri finanziari vengono dopo → EBIT e EBT' },
    ],
    esempioNumerico: {
      dati: 'Primo Margine €300.000, Costi Studio €60.000, Costi Fissi €80.000',
      calcolo: '300.000 − 60.000 − 80.000',
      risultato: 'EBITDA = €160.000 → 20% sul fatturato di €800k',
    },
    doveAppareNellApp: ['CEView — riga EBITDA', 'AnalisiView — Numeri Sacri #3', 'RatingView — EBITDA/Oneri Fin.', 'RatingView — PFN/EBITDA'],
    sogliaEdilizia: {
      ottimo: '> 15%',
      buono: '10–15%',
      attenzione: '5–10%',
      critico: '< 5%',
    },
    connessoCon: ['ebit', 'primo_margine', 'pfn_ebitda', 'copertura_interessi'],
    erroreComune: 'L\'EBITDA non è la cassa disponibile: non considera le rate dei mutui (rimborso capitale) né le tasse. Un EBITDA positivo non garantisce liquidità.',
  },

  {
    id: 'ebit',
    nome: 'EBIT',
    categoria: 'ce',
    origine: 'Acronimo inglese: Earnings Before Interest and Taxes — "Utile prima di interessi e tasse"',
    definizione: 'È l\'EBITDA al netto degli ammortamenti. Rappresenta il risultato operativo "vero" che include anche il consumo del valore dei beni strumentali nel tempo. È la misura più vicina alla redditività operativa reale per un\'impresa con macchinari e attrezzature.',
    formulaTestuale: 'EBIT = EBITDA − Ammortamenti',
    formulaPassaggi: [
      { label: 'Parti dall\'EBITDA', formula: 'Margine Operativo Lordo' },
      { label: 'Sottrai la quota di ammortamento del periodo', formula: '− Ammortamenti (inseriti manualmente nel CE annuale)' },
      { label: 'Il risultato è l\'EBIT', formula: '= Risultato Operativo Netto' },
    ],
    esempioNumerico: {
      dati: 'EBITDA €160.000, Ammortamenti annui €18.000 (escavatore €12k + software €6k)',
      calcolo: '160.000 − 18.000',
      risultato: 'EBIT = €142.000 — 17,75% sul fatturato',
    },
    doveAppareNellApp: ['CEView — riga EBIT', 'AnalisiView — Previsione Fiscale (base IRES)'],
    sogliaEdilizia: {
      ottimo: '> 10%',
      buono: '5—10%',
      attenzione: '2—5%',
      critico: '< 2%',
    },
    connessoCon: ['ebitda', 'ammortamento', 'ebt'],
    erroreComune: 'Gli ammortamenti nel CE dell\'app si inseriscono manualmente nella voce [STRUTTURA] Ammortamenti per rettificare l\'EBIT — se non li inserisci, EBIT = EBITDA. Nota: nello Stato Patrimoniale, invece, l\'ammortamento dei cespiti è calcolato automaticamente dal motore dell\'app.',
  },

  {
    id: 'ebt',
    nome: 'EBT',
    categoria: 'ce',
    origine: 'Acronimo inglese: Earnings Before Taxes — "Utile prima delle tasse"',
    definizione: 'È l\'EBIT al netto degli oneri finanziari (interessi passivi su mutui e fidi) e al lordo di eventuali proventi finanziari. È la base su cui si calcola approssimativamente l\'IRES.',
    formulaTestuale: 'EBT = EBIT − Oneri Finanziari + Proventi Finanziari',
    formulaPassaggi: [
      { label: 'Parti dall\'EBIT', formula: 'Risultato Operativo Netto' },
      { label: 'Sottrai gli interessi passivi su finanziamenti', formula: '− Interessi Passivi Finanziamenti − Commissioni Bancarie' },
      { label: 'Aggiungi eventuali proventi finanziari', formula: '+ Dividendi + Interessi Attivi' },
    ],
    esempioNumerico: {
      dati: 'EBIT €142.000, Interessi mutuo €8.500, Commissioni fido €1.200',
      calcolo: '142.000 − 8.500 − 1.200',
      risultato: 'EBT = €132.300',
    },
    doveAppareNellApp: ['CEView — riga EBT'],
    connessoCon: ['ebit', 'utile_netto', 'copertura_interessi'],
  },

  {
    id: 'utile_netto',
    nome: 'Utile Netto',
    categoria: 'ce',
    origine: 'Il "netto" indica che è il risultato dopo tutte le deduzioni possibili — è quanto rimane davvero all\'azienda',
    definizione: 'È il risultato finale dopo aver sottratto anche le imposte (IRES e IRAP) e aggiunto/sottratto i proventi/oneri straordinari. È l\'utile che appare nel bilancio civilistico e che può essere distribuito ai soci o reinvestito come riserva.',
    formulaTestuale: 'Utile Netto = EBT + Straordinari − Imposte',
    formulaPassaggi: [
      { label: 'Parti dall\'EBT', formula: 'Utile prima delle tasse' },
      { label: 'Aggiungi/sottrai poste straordinarie', formula: '± Proventi/Oneri Straordinari' },
      { label: 'Sottrai le imposte dell\'esercizio', formula: '− IRES − IRAP (inserite manualmente)' },
    ],
    esempioNumerico: {
      dati: 'EBT €132.300, Imposte stimate €36.900 (27,9%)',
      calcolo: '132.300 − 36.900',
      risultato: 'Utile Netto = €95.400 → 11,9% sul fatturato',
    },
    doveAppareNellApp: ['CEView — riga Utile Netto', 'AnalisiView — Numeri Sacri #4'],
    sogliaEdilizia: {
      ottimo: '> 8%',
      buono: '4–8%',
      attenzione: '1–4%',
      critico: '< 1% o negativo',
    },
    connessoCon: ['ebt', 'break_even'],
    erroreComune: 'Le imposte nel CE dell\'app si inseriscono manualmente nella riga Imposte — o si usa la Previsione Fiscale che le stima automaticamente.',
  },

  {
    id: 'break_even',
    nome: 'Punto di Pareggio (Break-even)',
    categoria: 'ce',
    origine: 'Dall\'inglese "break even" — il punto in cui entrate e uscite si pareggiano esattamente, né utile né perdita',
    definizione: 'È il fatturato minimo che l\'azienda deve raggiungere per coprire tutti i costi fissi. Sotto questo livello si va in perdita, sopra si genera utile. È uno degli indicatori più pratici per capire quanto si deve fatturare per sopravvivere.',
    formulaTestuale: 'Break-even = Costi Fissi Totali ÷ (1 − Costi Variabili / Fatturato)',
    formulaPassaggi: [
      { label: 'Calcola la percentuale costi variabili sul fatturato', formula: 'Costi Variabili ÷ Fatturato = es. 500k ÷ 800k = 62,5%' },
      { label: 'Calcola il margine di contribuzione', formula: '1 − 62,5% = 37,5%' },
      { label: 'Dividi i costi fissi per il margine di contribuzione', formula: 'Costi Fissi ÷ 37,5% = Break-even' },
    ],
    esempioNumerico: {
      dati: 'Costi Fissi annui €158.000 (studio €60k + fissi €80k + ammortamenti €18k), Costi Variabili 62,5% del fatturato',
      calcolo: '158.000 ÷ (1 − 0,625) = 158.000 ÷ 0,375',
      risultato: 'Break-even = €421.333 — devi fatturare almeno €421k per non perdere',
    },
    doveAppareNellApp: ['CEView — KPI card Punto di Pareggio', 'AnalisiView — Numeri Sacri #5'],
    sogliaEdilizia: {
      nota: 'Non ha una soglia assoluta — dipende dalla struttura. L\'importante è che il fatturato reale sia almeno 130-150% del break-even per avere un margine di sicurezza.',
    },
    connessoCon: ['ebitda', 'break_even_cassa', 'overhead_rate_totale'],
    erroreComune: 'Il break-even contabile include gli ammortamenti nei costi fissi. Quello di cassa li esclude ma include le rate capitale dei mutui. I due valori possono essere molto diversi.',
  },

  {
    id: 'break_even_cassa',
    nome: 'Break-even di Cassa',
    categoria: 'ce',
    origine: 'Variante del break-even classico che sostituisce gli ammortamenti (costo non monetario) con le rate capitale dei finanziamenti (uscita reale di cassa)',
    definizione: 'È il fatturato minimo necessario per coprire tutte le uscite reali di cassa, incluse le rate dei mutui e dei leasing. È più utile del break-even contabile per un\'impresa edile con mutui attivi, perché misura la capacità di far quadrare la cassa, non solo il bilancio.',
    formulaTestuale: 'Break-even Cassa = (Costi Fissi − Ammortamenti + Rate Capitale Mutui) ÷ (1 − Costi Variabili / Fatturato)',
    formulaPassaggi: [
      { label: 'Parti dai costi fissi operativi senza ammortamenti', formula: 'Costi Studio + Costi Fissi Puri (no ammortamenti)' },
      { label: 'Aggiungi le quote capitale delle rate finanziamenti', formula: '+ [FINANZA] Quota Capitale Rate Finanziamenti dell\'anno' },
      { label: 'Dividi per il margine di contribuzione', formula: '÷ (1 − Costi Variabili/Fatturato)' },
    ],
    esempioNumerico: {
      dati: 'Costi Fissi senza amm. €140.000, Rate capitale annue €35.000, Margine contribuzione 37,5%',
      calcolo: '(140.000 + 35.000) ÷ 0,375 = 175.000 ÷ 0,375',
      risultato: 'Break-even Cassa = €466.667 — più alto del contabile perché le rate pesano più degli ammortamenti',
    },
    doveAppareNellApp: ['CEView — KPI card Punto di Pareggio (riga Di cassa)', 'AnalisiView — Numeri Sacri #5 (Di cassa)'],
    connessoCon: ['break_even', 'ammortamento'],
  },

  {
    id: 'ammortamento',
    nome: 'Ammortamento',
    categoria: 'concetti',
    origine: 'Dal latino "ad mortem" — portare a morte, cioè ridurre progressivamente il valore di un bene fino a zero',
    definizione: 'È la quota annua con cui si "consuma" contabilmente il valore di un bene strumentale (escavatore, camion, software, fabbricato). Se compri un escavatore da €120.000 con vita utile 10 anni, ogni anno ammortizzi €12.000 — cioè riconosci che quell\'anno il bene si è svalutato di €12.000. Non è un\'uscita di cassa: i soldi li hai già spesi all\'acquisto (quello è il Capex).',
    formulaTestuale: 'Quota Ammortamento Annua = Valore Acquisto ÷ Anni Vita Utile',
    esempioNumerico: {
      dati: 'Escavatore acquistato €120.000, vita utile stimata 10 anni',
      calcolo: '120.000 ÷ 10',
      risultato: '€12.000/anno di ammortamento — nessuna uscita di cassa, solo costo contabile',
    },
    doveAppareNellApp: ['CEView — riga Ammortamenti (voce manuale)', 'SPView — Svalutazione Immobilizzazioni (calcolo automatico)'],
    erroreComune: 'L\'acquisto dell\'escavatore va registrato come [INVESTIMENTI] Acquisto Attrezzature → ceType CAPEX. L\'ammortamento va inserito manualmente ogni anno nel CE. Attenzione: nello Stato Patrimoniale l\'app svaluta i cespiti in automatico, non serve inserire nulla a mano per lo SP.',
    connessoCon: ['capex', 'ebit', 'break_even'],
  },

  {
    id: 'capex',
    nome: 'CAPEX',
    categoria: 'concetti',
    origine: 'Acronimo inglese: Capital Expenditure — "Spesa in Conto Capitale", cioè un investimento patrimoniale',
    definizione: 'È l\'acquisto di un bene durevole (macchinario, veicolo, terreno, immobile, software di valore significativo) che non è un costo operativo ma un investimento. Impatta la cassa nel momento dell\'acquisto ma non è un costo del Conto Economico — diventa un costo nel CE solo gradualmente tramite gli ammortamenti negli anni successivi.',
    formulaTestuale: 'Nessuna formula — è un movimento di cassa puro che non entra nel CE',
    esempioNumerico: {
      dati: 'Acquisto camion €85.000',
      calcolo: 'Anno 0: uscita cassa €85.000 (CAPEX) — Anno 1-10: costo CE €8.500/anno (ammortamento)',
      risultato: 'Il CE non vede i €85.000 ma €8.500 ogni anno per 10 anni',
    },
    doveAppareNellApp: ['Cash Flow Timeline — uscita reale', 'CE — NON appare come costo, solo tramite ammortamenti'],
    erroreComune: 'Se registri un acquisto di macchinario come costo fisso o variabile invece che come CAPEX/Investimento, il CE viene distorto con un costo enorme tutto in un anno.',
    connessoCon: ['ammortamento'],
  },

  {
    id: 'sal',
    nome: 'SAL — Stato Avanzamento Lavori',
    categoria: 'concetti',
    origine: 'Termine tecnico del settore edile italiano — il documento con cui l\'impresa certifica e fattura i lavori eseguiti fino a quel momento',
    definizione: 'È la fattura periodica che un\'impresa edile emette al committente in base ai lavori effettivamente eseguiti. In un cantiere da €500.000 che dura 18 mesi, si emettono tipicamente 3-4 SAL progressivi più un saldo finale. Ogni SAL è un ricavo core che entra nel CE.',
    doveAppareNellApp: ['Transazioni — categoria [CANTIERE] SAL', 'CEView — Ricavi Core', 'IVAView — IVA Incassata'],
    erroreComune: 'Non confondere il SAL con l\'anticipo del committente. L\'anticipo va in [CANTIERE] Anticipi da Clienti — non è un ricavo, è un debito verso il cliente finché i lavori non vengono eseguiti.',
    connessoCon: ['fatturato', 'dso', 'wip'],
  },

  {
    id: 'wip',
    nome: 'WIP — Work in Progress',
    categoria: 'concetti',
    origine: 'Dall\'inglese "lavori in corso" — in italiano detto anche "Lavori in Corso su Ordinazione" (LCO)',
    definizione: 'È il valore dei lavori eseguiti ma non ancora fatturati con un SAL. Se hai eseguito the 60% di un cantiere da €200.000 ma hai emesso SAL solo per €80.000, hai un WIP di €40.000 (120.000 eseguiti − 80.000 fatturati). Il WIP è una rimanenza attiva che il commercialista inserisce nel bilancio per rettificare il CE.',
    formulaTestuale: 'WIP = Lavori Eseguiti a Valori Contrattuali − SAL Già Fatturati',
    esempioNumerico: {
      dati: 'Cantiere contratto €200.000, avanzamento al 31/12 = 60% = €120.000 eseguiti, SAL emessi €80.000',
      calcolo: '120.000 − 80.000',
      risultato: 'WIP = €40.000 da inserire nelle rimanenze di fine anno',
    },
    doveAppareNellApp: ['CEView — sezione Rettifiche di Fine Anno (campo WIP Fine Anno)', 'AnalisiView — Previsione Fiscale'],
    connessoCon: ['sal', 'fatturato', 'competenza_vs_cassa'],
  },

  {
    id: 'competenza_vs_cassa',
    nome: 'Principio di Competenza vs Principio di Cassa',
    categoria: 'concetti',
    origine: 'Due principi contabili fondamentali che definiscono QUANDO un ricavo o un costo viene riconosciuto',
    definizione: 'Per CASSA: il ricavo/costo esiste quando i soldi entrano/escono dal conto corrente. Per COMPETENZA: il ricavo/costo esiste quando avviene il fatto economico (emissione fattura, esecuzione del lavoro), indipendentemente dal pagamento. Il commercialista usa la competenza. Il cash flow usa la cassa.',
    esempioNumerico: {
      dati: 'SAL emesso il 20/12/2024 per €50.000, incassato il 15/02/2025',
      calcolo: 'Per competenza → ricavo 2024. Per cassa → ricavo 2025',
      risultato: 'Il CE del commercialista mette €50k nel 2024. Il cash flow dell\'app li mette nel 2025 (quando arrivano sul conto)',
    },
    doveAppareNellApp: ['CEView — toggle Competenza/Cassa nell\'header'],
    erroreComune: 'Usare sempre il toggle "Per Cassa" per il cash flow quotidiano. Usare "Per Competenza" solo per confrontare con il CE del commercialista a fine anno.',
    connessoCon: ['sal', 'fatturato', 'dso'],
  },

  // ─── OVERHEAD E STRUTTURA ────────────────────────────────────────
 
  {
    id: 'overhead_rate_studio',
    nome: 'Overhead Rate Studio',
    categoria: 'overhead',
    origine: 'Misura la componente dell\'overhead relativa alla struttura tecnica dello studio e al personale',
    definizione: 'È il ricarico percentuale da applicare ai costi diretti di cantiere per coprire i costi legati al personale tecnico di studio, collaboratori di progettazione e stipendi degli uffici.',
    formulaTestuale: 'Overhead Rate Studio = Costi Studio ÷ Costi Diretti Cantiere',
    formulaPassaggi: [
      { label: 'Somma i costi dello studio e tecnici', formula: 'Σ costo_studio (stipendi ufficio + tecnici)' },
      { label: 'Somma tutti i costi diretti di cantiere', formula: 'Σ costo_variabile (materiali + subappalti)' },
      { label: 'Dividi costi studio per costi diretti', formula: 'Costi Studio ÷ Costi Diretti' },
    ],
    esempioNumerico: {
      dati: 'Costi Studio €60.000. Costi Diretti Cantiere €500.000',
      calcolo: '60.000 ÷ 500.000',
      risultato: 'Overhead Rate Studio = 12% — ogni €100 di costi diretti di cantiere, €12 coprono lo studio',
    },
    doveAppareNellApp: ['AnalisiView — Blocco B "Per i Preventivi"'],
    connessoCon: ['overhead_rate_totale', 'incidenza_studio_fatturato'],
  },
  {
    id: 'overhead_rate_fissi',
    nome: 'Overhead Rate — Costi Fissi (escl. Studio)',
    categoria: 'overhead',
    origine: 'Misura la componente dell\'overhead relativa alle spese di funzionamento e di gestione fisse',
    definizione: 'È il ricarico percentuale da applicare ai costi diretti di cantiere per coprire le spese fisse pure di funzionamento della società (sedi, affitti, commercialista, utenze, assicurazioni, marketing, ammortamenti).',
    formulaTestuale: 'Overhead Rate Costi Fissi (escl. Studio) = Costi Fissi Puri ÷ Costi Diretti Cantiere',
    formulaPassaggi: [
      { label: 'Somma i costi fissi strutturali', formula: 'Σ costo_fisso + ammortamento (sedi + utilities + professionisti)' },
      { label: 'Somma tutti i costi diretti di cantiere', formula: 'Σ costo_variabile (materiali + subappalti)' },
      { label: 'Dividi costi fissi per costi diretti', formula: 'Costi Fissi ÷ Costi Diretti' },
    ],
    esempioNumerico: {
      dati: 'Costi Fissi €80.000. Costi Diretti Cantiere €500.000',
      calcolo: '80.000 ÷ 500.000',
      risultato: 'Overhead Rate Costi Fissi (escl. Studio) = 16% — ogni €100 di costi diretti, €16 vanno per coprire le spese generali',
    },
    doveAppareNellApp: ['AnalisiView — Blocco B "Per i Preventivi"'],
    connessoCon: ['overhead_rate_totale', 'incidenza_fissi_fatturato'],
  },
 
  {
    id: 'overhead_rate_totale',
    nome: 'Overhead Rate — Costi Fissi Totali',
    categoria: 'overhead',
    origine: 'Dall\'inglese "overhead" — i costi che stanno "sopra" (over) la testa (head), cioè i costi di struttura che esistono indipendentemente dai cantieri',
    definizione: 'È la percentuale da aggiungere ai costi diretti di cantiere per coprire i costi della struttura aziendale (ufficio, tecnici, commercialista, assicurazioni, ecc.). È il numero da usare obbligatoriamente in ogni preventivo. Se non lo applichi, stai lavorando in perdita strutturale.',
    formulaTestuale: 'Overhead Rate Costi Fissi Totali = (Costi Studio + Costi Fissi Puri) ÷ Costi Diretti Cantiere',
    formulaPassaggi: [
      { label: 'Somma tutti i costi dello studio e tecnici', formula: 'Σ costo_studio (stipendi ufficio + tecnici + amministratori)' },
      { label: 'Somma tutti i costi fissi strutturali', formula: 'Σ costo_fisso (affitti + utenze + software + assicurazioni + marketing + ammortamenti)' },
      { label: 'Somma tutti i costi diretti di cantiere', formula: 'Σ costo_variabile (manodopera + materiali + subappalti + noleggi)' },
      { label: 'Dividi overhead totale per costi diretti', formula: '(Studio + Fissi) ÷ Diretti = Overhead Rate' },
    ],
    esempioNumerico: {
      dati: 'Costi Studio €60.000 + Costi Fissi €80.000 = Overhead €140.000. Costi Diretti Cantiere €500.000',
      calcolo: '140.000 ÷ 500.000',
      risultato: 'Overhead Rate = 28% — su ogni €100 di costi diretti, aggiungi €28 di struttura nel preventivo',
    },
    doveAppareNellApp: ['AnalisiView — Blocco B "Per i Preventivi"', 'AnalisiView — Calcolatore Preventivo'],
    sogliaEdilizia: {
      ottimo: '< 20%',
      buono: '20–30%',
      attenzione: '30–45%',
      critico: '> 45%',
    },
    connessoCon: ['incidenza_studio_fatturato', 'coefficiente_ricarico', 'incidenza_fissi_fatturato'],
    erroreComune: 'L\'overhead rate si applica sui COSTI DIRETTI, non sul prezzo finale. Applicarlo sul prezzo finale sottostima il valore e porta a preventivi troppo bassi.',
  },

  {
    id: 'incidenza_studio_fatturato',
    nome: 'Incidenza Studio sul Fatturato',
    categoria: 'overhead',
    origine: 'Indicatore di controllo di gestione — misura quanto pesa la struttura tecnica rispetto ai ricavi generati',
    definizione: 'Quanto costano lo studio e il personale tecnico in proporzione al fatturato. A differenza dell\'overhead rate (usato per i preventivi), questa percentuale si usa per il controllo mensile per verificare il dimensionamento della struttura tecnica. Le voci incluse sono: 1) Costi di Studio (Stipendi e Contributi Ufficio, Collaboratori Fissi, Compenso Amministratori) al numeratore. 2) Fatturato (SAL Cantieri, Saldi Finali Commessa, Manutenzioni, Vendita/Affitti Immobili, Rimborsi) al denominatore.',
    formulaTestuale: 'Incidenza Studio = Costi Studio ÷ Fatturato',
    formulaPassaggi: [
      { label: 'Costi Studio (Numeratore) — Somma le voci di:', formula: '[PERSONALE] Stipendi Ufficio + Contributi Ufficio + Collaboratori Fissi + Compenso Amministratori' },
      { label: 'Fatturato (Denominatore) — Somma le voci di:', formula: '[CANTIERE] SAL + Saldo Commessa + Manutenzioni + [IMMOBILIARE] Vendite/Affitti + [RIMBORSI] Rimborsi' },
    ],
    esempioNumerico: {
      dati: 'Costi Studio annui €60.000, Fatturato €800.000',
      calcolo: '60.000 ÷ 800.000',
      risultato: 'Incidenza Studio = 7,5% — ogni €100 di fatturato, €7,50 vanno alla struttura tecnica',
    },
    doveAppareNellApp: ['AnalisiView — Blocco A "Controllo di Gestione"', 'AnalisiView — Numeri Sacri #6'],
    sogliaEdilizia: {
      ottimo: '< 10%',
      buono: '10–15%',
      attenzione: '15–25%',
      critico: '> 25%',
    },
    connessoCon: ['overhead_rate_totale', 'incidenza_fissi_fatturato'],
    erroreComune: 'Se il fatturato cala ma i costi studio restano fissi, questa percentuale sale automaticamente — è il primo segnale che la struttura è sovradimensionata rispetto all\'attività.',
  },

  {
    id: 'incidenza_fissi_puro_fatturato',
    nome: 'Incidenza Costi Fissi (escl. Studio) sul Fatturato',
    categoria: 'overhead',
    origine: 'Misure di controllo di gestione — analizza l\'impatto della struttura fissa pura (escluso lo Studio/Personale) sul fatturato',
    definizione: 'Indica la quota di fatturato assorbita dalle spese generali di struttura fissa pura (affitti, utenze, assicurazioni, commercialista, software, marketing, ammortamenti), escludendo i costi del personale tecnico e di studio. Consente di misurare l\'efficienza dei costi fissi generali in modo indipendente dal costo delle risorse umane.',
    formulaTestuale: 'Incidenza Costi Fissi (escl. Studio) = Costi Fissi Puri ÷ Fatturato',
    formulaPassaggi: [
      { label: 'Costi Fissi Puri (Numeratore) — Somma delle voci di:', formula: '[STRUTTURA] Affitti + Utenze + Software + Assicurazioni + Marketing + Consulenze Generali + Ammortamenti' },
      { label: 'Fatturato (Denominatore) — Somma delle voci di:', formula: '[CANTIERE] SAL + Saldi Commessa + Manutenzioni + [IMMOBILIARE] Vendita/Affitti' },
    ],
    esempioNumerico: {
      dati: 'Costi Fissi Puri annui €80.000, Fatturato €800.000',
      calcolo: '80.000 ÷ 800.000',
      risultato: 'Incidenza Costi Fissi (escl. Studio) = 10% — ogni €100 di fatturato, €10 vanno per coprire le spese generali',
    },
    doveAppareNellApp: ['AnalisiView — Blocco A "Controllo di Gestione"'],
    sogliaEdilizia: {
      ottimo: '< 8%',
      buono: '8–12%',
      attenzione: '12–15%',
      critico: '> 15%',
    },
    connessoCon: ['incidenza_studio_fatturato', 'incidenza_fissi_fatturato'],
  },

  {
    id: 'incidenza_fissi_fatturato',
    nome: 'Incidenza Overhead Totale sul Fatturato',
    categoria: 'overhead',
    origine: 'Complementare all\'incidenza studio — misura tutto il peso della struttura aziendale sui ricavi',
    definizione: 'Quanto pesa l\'intera struttura aziendale (tecnici + ufficio + affitti + utenze + assicurazioni + tutto il resto) rispetto al fatturato. È la percentuale usata nel metodo Gasparotto per il controllo mensile della struttura dei costi. Le voci incluse sono: 1) Costi Studio + Costi Fissi Puri (Commercialista, Consulenti Fissi, SOA/ISO, Affitti Sedi, Utenze, Software, Cancelleria, Assicurazione Mezzi, Revisioni, Riparazioni Programmate, Assicurazioni Generali, Corsi, Visite Mediche, Pubblicità, IMU/TARI, Ammortamenti) al numeratore. 2) Fatturato al denominatore.',
    formulaTestuale: 'Incidenza Overhead Totale = (Costi Studio + Costi Fissi Puri) ÷ Fatturato',
    formulaPassaggi: [
      { label: 'Costi Studio + Costi Fissi Puri (Numeratore) — Somma delle voci:', formula: 'Stipendi/Contributi Ufficio + Collaboratori + Compenso Amministratori + Commercialista + Consulenti Fissi + SOA/ISO + Affitti + Utenze + Software + Cancelleria + Assicurazioni Mezzi/Generali + Revisioni + Riparazioni Programmate + Corsi + Visite Mediche + Pubblicità + IMU/TARI + Ammortamenti' },
      { label: 'Fatturato (Denominatore) — Somma delle voci:', formula: '[CANTIERE] SAL + Saldo Commessa + Manutenzioni + [IMMOBILIARE] Vendite/Affitti + [RIMBORSI] Rimborsi' },
    ],
    esempioNumerico: {
      dati: 'Studio €60.000 + Fissi €80.000 = €140.000. Fatturato €800.000',
      calcolo: '140.000 ÷ 800.000',
      risultato: 'Incidenza Overhead = 17,5% — ogni €100 di fatturato, €17,50 vanno alla struttura',
    },
    doveAppareNellApp: ['AnalisiView — Blocco A "Controllo di Gestione"', 'AnalisiView — Numeri Sacri #7'],
    sogliaEdilizia: {
      ottimo: '< 20%',
      buono: '20–30%',
      attenzione: '30–35%',
      critico: '> 35%',
    },
    connessoCon: ['incidenza_studio_fatturato', 'overhead_rate_totale'],
  },

  {
    id: 'oneri_finanziari_incidenza',
    nome: 'Incidenza Oneri Finanziari sul Fatturato',
    categoria: 'overhead',
    origine: 'Misura il peso del costo del capitale di debito sul fatturato complessivo dell\'azienda',
    definizione: 'Indica quanta percentuale del fatturato viene assorbita dagli oneri finanziari (interessi passivi, commissioni bancarie e bolli). Mostra la dipendenza finanziaria dalle banche e l\'onerosità del debito. Le voci incluse sono: 1) Oneri Finanziari (Interessi Passivi Finanziamenti, Commissioni e Bolli Bancari, Interessi su Mutuo Cantiere) al numeratore. 2) Fatturato al denominatore.',
    formulaTestuale: 'Incidenza Oneri Finanziari = Oneri Finanziari ÷ Fatturato',
    formulaPassaggi: [
      { label: 'Oneri Finanziari (Numeratore) — Somma le voci di:', formula: '[FINANZA] Interessi Passivi Finanziamenti + Commissioni e Bolli Bancari + Interessi su Mutuo Cantiere' },
      { label: 'Fatturato (Denominatore) — Somma le voci di:', formula: '[CANTIERE] SAL + Saldo Commessa + Manutenzioni + [IMMOBILIARE] Vendite/Affitti + [RIMBORSI] Rimborsi' },
    ],
    esempioNumerico: {
      dati: 'Oneri Finanziari €8.000, Fatturato €800.000',
      calcolo: '8.000 ÷ 800.000',
      risultato: 'Incidenza Oneri Finanziari = 1,0% — ogni €100 di fatturato, €1 va alle banche',
    },
    doveAppareNellApp: ['AnalisiView — Blocco A "Controllo di Gestione"'],
    sogliaEdilizia: {
      ottimo: '< 1,5%',
      buono: '1,5–3,0%',
      attenzione: '3,0–5,0%',
      critico: '> 5,0%',
    },
    connessoCon: ['copertura_interessi', 'ebitda'],
  },

  {
    id: 'coefficiente_ricarico',
    nome: 'Coefficiente di Ricarico',
    categoria: 'overhead',
    origine: 'Il fattore moltiplicativo da applicare ai costi diretti per ottenere il prezzo di vendita minimo',
    definizione: 'È il numero per cui moltiplichi i costi diretti di cantiere per ottenere direttamente il prezzo minimo da offrire. Incorpora overhead e margine. È lo strumento più veloce per fare un preventivo rapido in cantiere.',
    formulaTestuale: 'Coefficiente = Prezzo Minimo ÷ Costi Diretti',
    esempioNumerico: {
      dati: 'Costi diretti €100.000, Overhead Rate 28%, Margine target 10%',
      calcolo: 'Costo totale = 100.000 × 1,28 = 128.000. Prezzo = 128.000 ÷ (1−0,10) = 142.222. Coeff = 142.222 ÷ 100.000',
      risultato: 'Coefficiente = 1,42 — moltiplica i costi diretti per 1,42 e hai il prezzo minimo',
    },
    doveAppareNellApp: ['AnalisiView — Calcolatore Preventivo Cantiere'],
    connessoCon: ['overhead_rate_totale', 'coefficiente_ricarico'],
  },

  {
    id: 'costo_orario_reale',
    nome: 'Costo Orario Reale Operaio',
    categoria: 'orario',
    origine: 'Il costo effettivo per l\'azienda di un\'ora di lavoro di un operaio, calcolato dai pagamenti reali di cassa',
    definizione: 'Non è il costo contrattuale (quello che l\'operaio vede in busta paga) ma il costo totale che l\'azienda sostiene: stipendio lordo + contributi previdenziali (INPS, INAIL, Cassa Edile). Divide il totale pagato in un mese per le ore effettivamente lavorate in cantiere.',
    formulaTestuale: 'Costo Orario Reale = (Stipendi Operativi + Contributi Operativi del mese) ÷ Ore Cantiere del mese',
    formulaPassaggi: [
      { label: 'Somma le uscite per stipendi operativi del mese', formula: 'Σ [PERSONALE] Stipendi Dipendenti Operativi' },
      { label: 'Somma i contributi operativi del mese', formula: '+ Σ [PERSONALE] Contributi Dipendenti Operativi' },
      { label: 'Dividi per le ore inserite manualmente', formula: '÷ Ore Cantiere (da cartellini)' },
    ],
    esempioNumerico: {
      dati: 'Stipendi operativi marzo €18.500 + Contributi €6.200 = €24.700. Ore cantiere marzo: 820 ore',
      calcolo: '24.700 ÷ 820',
      risultato: 'Costo Orario Reale = €30,12/ora — vs costo contrattuale es. €26/ora → €4,12/ora di overhead nascosto',
    },
    doveAppareNellApp: ['AnalisiView — tab Costo Orario'],
    sogliaEdilizia: {
      nota: 'Il costo reale è tipicamente 1,35-1,50x il costo orario contrattuale. Se supera 1,60x verificare il rapporto ore-retribuzioni.',
    },
    connessoCon: ['overhead_rate_totale'],
    erroreComune: 'Non include TFR e ferie pagate (non sono uscite mensili di cassa). Per un costo orario pieno aggiungere circa il 20-25% agli accantonamenti impliciti.',
  },

  // ─── RATING BANCARIO ────────────────────────────────────────────

  {
    id: 'pfn',
    nome: 'PFN — Posizione Finanziaria Netta',
    categoria: 'rating',
    origine: 'La misura del debito finanziario "netto" dell\'azienda, cioè al netto della liquidità disponibile',
    definizione: 'È la somma di tutti i debiti finanziari (mutui, leasing, fidi utilizzati) meno la liquidità in cassa. Misura quanto l\'azienda è indebitata in termini netti. Una PFN negativa (rara) significa che hai più liquidità dei debiti.',
    formulaTestuale: 'PFN = Mutui LT + Leasing LT + Fidi BT + Mutui BT − Liquidità',
    esempioNumerico: {
      dati: 'Mutuo LT residuo €180.000 + Leasing €25.000 + Fido utilizzato €40.000 − Liquidità €35.000',
      calcolo: '180.000 + 25.000 + 40.000 − 35.000',
      risultato: 'PFN = €210.000',
    },
    doveAppareNellApp: ['SPView — Stato Patrimoniale', 'RatingView — indicatore PFN/EBITDA'],
    connessoCon: ['pfn_ebitda', 'current_ratio'],
  },

  {
    id: 'pfn_ebitda',
    nome: 'PFN / EBITDA',
    categoria: 'rating',
    origine: 'Il rapporto tra indebitamento netto e capacità di generare cassa operativa — l\'indicatore principale usato dalle banche (Basilea 3)',
    definizione: 'Misura in quanti anni l\'azienda potrebbe teoricamente ripagare tutti i debiti finanziari usando solo l\'EBITDA. Più è basso, meglio è. Le banche considerano 3x come soglia massima accettabile per il settore edile.',
    formulaTestuale: 'PFN/EBITDA = Posizione Finanziaria Netta ÷ EBITDA',
    esempioNumerico: {
      dati: 'PFN €210.000, EBITDA annuo €160.000',
      calcolo: '210.000 ÷ 160.000',
      risultato: 'PFN/EBITDA = 1,31x — eccellente, la banca legge: "ripaga i debiti in 1,3 anni di EBITDA"',
    },
    doveAppareNellApp: ['RatingView — indicatore PFN/EBITDA'],
    sogliaEdilizia: {
      ottimo: '< 1,5x',
      buono: '1,5–3x',
      attenzione: '3–5x',
      critico: '> 5x',
    },
    connessoCon: ['pfn', 'ebitda', 'copertura_interessi'],
  },

  {
    id: 'copertura_interessi',
    nome: 'EBITDA / Oneri Finanziari (Interest Coverage)',
    categoria: 'rating',
    origine: 'Dall\'inglese "Interest Coverage Ratio" — misura quante volte l\'EBITDA copre gli interessi passivi',
    definizione: 'Indica se l\'azienda genera abbastanza margine operativo per pagare gli interessi bancari senza stress. Un valore di 3x significa che l\'EBITDA è 3 volte gli interessi — c\'è ampio margine di sicurezza.',
    formulaTestuale: 'Copertura Interessi = EBITDA ÷ Oneri Finanziari',
    esempioNumerico: {
      dati: 'EBITDA €160.000, Oneri Finanziari annui €9.700 (interessi mutuo + commissioni fido)',
      calcolo: '160.000 ÷ 9.700',
      risultato: 'Coverage = 16,5x — molto solido',
    },
    doveAppareNellApp: ['RatingView — indicatore EBITDA/Oneri Fin.'],
    sogliaEdilizia: {
      ottimo: '> 6x',
      buono: '3–6x',
      attenzione: '1,5–3x',
      critico: '< 1,5x',
    },
    connessoCon: ['pfn_ebitda', 'ebitda'],
  },

  {
    id: 'current_ratio',
    nome: 'Current Ratio (Indice di Liquidità Corrente)',
    categoria: 'rating',
    origine: 'Dall\'inglese "current" = corrente — misura la capacità di far fronte agli impegni a breve con le risorse a breve',
    definizione: 'Quanto l\'attivo circolante (liquidità + crediti + rimanenze) copre le passività a breve termine (debiti fornitori + debiti tributari + rate mutuo entro 12 mesi + fidi). Un valore sopra 1,2 significa che hai il 20% di cuscinetto.',
    formulaTestuale: 'Current Ratio = Attivo Circolante ÷ Passivo a Breve Termine',
    esempioNumerico: {
      dati: 'Attivo Circolante: Liquidità €35k + Crediti Clienti €120k + Rimanenze €40k = €195k. Passivo BT: Fornitori €65k + Tributari €18k + Fidi €40k + Mutui BT €24k = €147k',
      calcolo: '195.000 ÷ 147.000',
      risultato: 'Current Ratio = 1,33 — la banca legge: "ha il 33% di attivi in più dei debiti a breve"',
    },
    doveAppareNellApp: ['RatingView — indicatore Current Ratio'],
    sogliaEdilizia: {
      ottimo: '> 1,5',
      buono: '1,2–1,5',
      attenzione: '1–1,2',
      critico: '< 1',
    },
    connessoCon: ['pfn', 'dso', 'dpo'],
  },

  {
    id: 'solidita_patrimoniale',
    nome: 'Solidità Patrimoniale',
    categoria: 'rating',
    origine: 'Misura quanto del totale delle attività è finanziato con mezzi propri (capitale e riserve) anziché con debiti',
    definizione: 'È la percentuale del patrimonio netto sul totale dell\'attivo. Indica quanto l\'azienda si finanzia con i propri mezzi. Una bassa solidità significa che quasi tutto è finanziato a debito — rischio alto. La si migliora lasciando gli utili in azienda invece di distribuirli.',
    formulaTestuale: 'Solidità Patrimoniale = Patrimonio Netto ÷ Totale Attivo',
    esempioNumerico: {
      dati: 'Patrimonio Netto €180.000 (Capitale €10k + Riserve €120k + Utile €50k), Totale Attivo €520.000',
      calcolo: '180.000 ÷ 520.000',
      risultato: 'Solidità = 34,6% — sopra la soglia del 30%, banca soddisfatta',
    },
    doveAppareNellApp: ['RatingView — indicatore Solidità Patrimoniale'],
    sogliaEdilizia: {
      ottimo: '> 40%',
      buono: '30–40%',
      attenzione: '20–30%',
      critico: '< 20%',
    },
    connessoCon: ['pfn', 'current_ratio'],
  },

  {
    id: 'dso',
    nome: 'DSO — Days Sales Outstanding',
    categoria: 'rating',
    origine: 'Dall\'inglese "giorni di vendita in sospeso" — quanti giorni passano mediamente tra emissione fattura e incasso',
    definizione: 'Misura la velocità con cui l\'azienda incassa i crediti dai clienti. Un DSO alto significa che i soldi restano fermi nei crediti invece di entrare in cassa. Nell\'edilizia i committenti (soprattutto pubblici) pagano lentamente — ma va monitorato.',
    formulaTestuale: 'DSO (da snapshot SP) = (Crediti Clienti ÷ Fatturato annuo) × 365',
    formulaPassaggi: [
      { label: 'Prendi i crediti clienti dallo Stato Patrimoniale', formula: 'Campo "Crediti Clienti" nello snapshot SP' },
      { label: 'Dividi per il fatturato annuo', formula: '÷ Fatturato annuo dal CE' },
      { label: 'Moltiplica per 365', formula: '× 365 = giorni medi di incasso' },
    ],
    esempioNumerico: {
      dati: 'Crediti Clienti al 31/12 €120.000, Fatturato annuo €800.000',
      calcolo: '(120.000 ÷ 800.000) × 365',
      risultato: 'DSO = 54,75 giorni — incassi mediamente in 55 giorni dalla fattura',
    },
    doveAppareNellApp: ['RatingView — indicatore DSO', 'RatingView — DSO Rolling 12 mesi'],
    sogliaEdilizia: {
      ottimo: '< 30 gg',
      buono: '30–60 gg',
      attenzione: '60–90 gg',
      critico: '> 90 gg',
    },
    connessoCon: ['dpo', 'current_ratio', 'competenza_vs_cassa'],
  },

  {
    id: 'dpo',
    nome: 'DPO — Days Payable Outstanding',
    categoria: 'rating',
    origine: 'Dall\'inglese "giorni di pagamento in sospeso" — quanti giorni passano mediamente tra ricezione fattura fornitore e pagamento',
    definizione: 'Misura la velocità con cui l\'azienda paga i fornitori. Un DPO troppo basso significa che paghi prima del necessario (spreco di liquidità). Un DPO troppo alto segnala difficoltà di cassa o tensione nei rapporti commerciali. La fascia sana è 30-90 giorni.',
    formulaTestuale: 'DPO (da snapshot SP) = (Debiti Fornitori ÷ Acquisti annui) × 365',
    esempioNumerico: {
      dati: 'Debiti Fornitori al 31/12 €65.000, Acquisti annui (costi variabili) €500.000',
      calcolo: '(65.000 ÷ 500.000) × 365',
      risultato: 'DPO = 47,45 giorni — paghi i fornitori mediamente in 47 giorni',
    },
    doveAppareNellApp: ['RatingView — indicatore DPO', 'RatingView — DPO Rolling 12 mesi'],
    sogliaEdilizia: {
      ottimo: '45–75 gg',
      buono: '30–90 gg',
      attenzione: '< 20 gg o > 90 gg',
      critico: '> 120 gg',
    },
    connessoCon: ['dso', 'current_ratio'],
  },

  // ─── IVA ────────────────────────────────────────────────────────

  {
    id: 'posizione_iva',
    nome: 'Posizione IVA / Saldo IVA',
    categoria: 'iva',
    origine: 'La differenza tra l\'IVA che hai incassato dai clienti (IVA a debito verso erario) e quella che hai pagato ai fornitori (IVA a credito)',
    definizione: 'Ogni volta che incassi un SAL con IVA 10%, quella IVA non è tua — la devi all\'Erario. Ma puoi scalare l\'IVA che hai pagato ai tuoi fornitori. Il saldo è quello che devi versare con l\'F24 periodico.',
    formulaTestuale: 'Saldo IVA = IVA Incassata (da clienti) − IVA Pagata (a fornitori)',
    esempioNumerico: {
      dati: 'SAL €50.000 + IVA 10% €5.000 incassata. Fatture fornitori €30.000 + IVA 22% €6.600 pagata',
      calcolo: '5.000 − 6.600',
      risultato: 'Saldo IVA = −€1.600 → credito IVA, non devi versare nulla quel mese',
    },
    doveAppareNellApp: ['IVAView — Saldo Periodo', 'IVAView — Posizione Netta'],
    erroreComune: 'Molte transazioni vengono inserite senza compilare il campo IVA — questo rende il calcolo della posizione IVA inaffidabile. Compilare sempre il campo aliquota IVA.',
    connessoCon: ['fatturato'],
  },

  // ─── FISCALE ────────────────────────────────────────────────────

  {
    id: 'ires',
    nome: 'IRES — Imposta sul Reddito delle Società',
    categoria: 'fiscale',
    origine: 'Istituita nel 2003 in sostituzione dell\'IRPEG — è la principale imposta sui profitti delle società di capitali italiane',
    definizione: 'È l\'imposta sui profitti delle Srl e SpA italiane. Si calcola sul reddito imponibile (approssimativamente l\'EBIT rettificato con le variazioni fiscali). L\'aliquota è fissa al 24% dal 2017. Si paga in due acconti (giugno e novembre) più un saldo ad aprile dell\'anno successivo.',
    formulaTestuale: 'IRES Stimata = Base Imponibile × 24%',
    esempioNumerico: {
      dati: 'EBIT €142.000 + Variazione Rimanenze €15.000 = Base Imponibile €157.000',
      calcolo: '157.000 × 24%',
      risultato: 'IRES Stimata = €37.680 — da versare in acconti a giugno (40%) e novembre (60%)',
    },
    doveAppareNellApp: ['AnalisiView — tab Previsione Fiscale'],
    erroreComune: 'La stima dell\'app è semplificata — non include deduzioni ACE, perdite fiscali pregresse, variazioni permanenti. Usarla come ordine di grandezza, non come cifra definitiva.',
    connessoCon: ['irap', 'ebit', 'break_even'],
  },

  {
    id: 'irap',
    nome: 'IRAP — Imposta Regionale sulle Attività Produttive',
    categoria: 'fiscale',
    origine: 'Istituita nel 1997 — è un\'imposta sul "valore aggiunto" prodotto dall\'azienda, non sull\'utile. Ha una logica diversa dall\'IRES.',
    definizione: 'A differenza dell\'IRES che tassa l\'utile, l\'IRAP tassa il valore della produzione netta — cioè ricavi meno costi operativi, ma senza dedurre il costo del personale dipendente. Questo la rende penalizzante per le imprese labour-intensive come quelle edili con molti dipendenti.',
    formulaTestuale: 'IRAP Stimata = (Ricavi + ΔWIP − Costi Operativi deducibili) × 3,9%',
    formulaPassaggi: [
      { label: 'Parti dal valore della produzione', formula: 'Fatturato + Variazione WIP' },
      { label: 'Sottrai i costi deducibili (ESCLUSO personale dipendente)', formula: '− Materiali − Subappalti − Noleggi − Costi Fissi deducibili' },
      { label: 'Moltiplica per l\'aliquota regionale', formula: '× 3,9% (Veneto — verifica con commercialista)' },
    ],
    esempioNumerico: {
      dati: 'Valore Produzione €815.000, Costi Deducibili €620.000 (escluso personale dipendente €160.000)',
      calcolo: '(815.000 − 620.000) × 3,9% = 195.000 × 3,9%',
      risultato: 'IRAP Stimata = €7.605',
    },
    doveAppareNellApp: ['AnalisiView — tab Previsione Fiscale'],
    erroreComune: 'Il personale dipendente (stipendi + contributi) NON è deducibile dall\'IRAP — questo è il motivo per cui un\'azienda edile con molti dipendenti paga più IRAP di una con soli subappalti.',
    connessoCon: ['ires', 'ebit', 'overhead_rate_totale'],
  },

  // ─── BUDGET E FORECAST ──────────────────────────────────────────

  {
    id: 'budget_annuo',
    nome: 'Budget Annuo',
    categoria: 'concetti',
    origine: 'Dall\'antico francese "bougette" — borsa o valigetta per contenere i conti dello Stato',
    definizione: 'È il valore programmatico (l\'obiettivo o limite massimo) stabilito per l\'intera durata dell\'anno solare per una specifica categoria economica. Si inserisce manualmente all\'inizio del periodo strategico e funge da traguardo fisso contro cui misurare le performance reali dell\'azienda.',
    doveAppareNellApp: ['BudgetView — Tabella Budget e Scostamenti (colonna gialla)'],
    connessoCon: ['consuntivo_ytd', 'scostamento_budget', 'avanzamento_budget'],
  },

  {
    id: 'consuntivo_ytd',
    nome: 'Consuntivo YTD (Year To Date)',
    categoria: 'concetti',
    origine: 'Dall\'inglese "Year To Date" — cioè dall\'inizio dell\'anno ad oggi',
    definizione: 'Rappresenta la somma totale dei ricavi effettivi o dei costi operativi reali registrati (transazioni non previsionali) dall\'inizio dell\'anno fiscale (1° gennaio) fino alla data odierna. È estratto automaticamente in tempo reale dalle transazioni completate nelle timeline.',
    doveAppareNellApp: ['BudgetView — Tabella Budget (colonna azzurra)', 'Dashboard'],
    connessoCon: ['budget_annuo', 'scostamento_budget', 'avanzamento_budget'],
  },

  {
    id: 'scostamento_budget',
    nome: 'Scostamento di Budget',
    categoria: 'concetti',
    origine: 'Dal verbo "scostare" — la distanza misurata tra il traguardo teorico ed il risultato pratico',
    definizione: 'È il differenziale calcolato parametrizzando i dati ad oggi. Per evitare distorsioni (es. confrontare 5 mesi reali con 12 mesi di obiettivo), il sistema divide l\'obiettivo annuale per i mesi trascorsi e sottrae il consuntivo accumulato nello stesso periodo. Indica se siamo in vantaggio (verde per ricavi) o in ritardo (rosso).',
    formulaTestuale: 'Scostamento = Consuntivo YTD − (Budget Annuo ÷ 12 × Mesi Trascorsi)',
    esempioNumerico: {
      dati: 'Budget annuo ricavi €120.000. Mesi trascorsi: 5 (gen-mag). Consuntivo YTD reale: €55.000',
      calcolo: 'Quota budget 5 mesi = €120.000 ÷ 12 × 5 = €50.000. Scostamento = €55.000 − €50.000',
      risultato: 'Scostamento = +€5.000 (Vantaggio del 10% sul pro-quota temporale)',
    },
    doveAppareNellApp: ['BudgetView — Tabella Budget (colonna verde/rossa)', 'CEView — Scostamenti'],
    connessoCon: ['budget_annuo', 'consuntivo_ytd', 'avanzamento_budget'],
  },

  {
    id: 'avanzamento_budget',
    nome: 'Avanzamento % di Budget',
    categoria: 'concetti',
    origine: 'La frazione di traguardo annuale già completata',
    definizione: 'Indica la percentuale complessiva dell\'obiettivo annuale che è stata effettivamente realizzata ad oggi. È calcolata dividendo il consuntivo cumulato YTD per il budget totale pianificato per l\'intero anno solare.',
    formulaTestuale: 'Avanzamento % = Consuntivo YTD ÷ Budget Annuo Totale',
    esempioNumerico: {
      dati: 'Consuntivo ricavi YTD ad oggi €60.000. Budget totale annuo stabilito €100.000',
      calcolo: '60.000 ÷ 100.000',
      risultato: 'Avanzamento = 60% dell\'obiettivo annuale raggiunto',
    },
    doveAppareNellApp: ['BudgetView — Tabella Budget (colonna destra indaco)'],
    connessoCon: ['budget_annuo', 'consuntivo_ytd', 'scostamento_budget'],
  },

];

export const getTermine = (id: string): TermineGlossario | undefined =>
  GLOSSARIO.find(t => t.id === id);

export const getTerminiPerCategoria = (cat: TermineGlossario['categoria']): TermineGlossario[] =>
  GLOSSARIO.filter(t => t.categoria === cat);

export const CATEGORIE_GLOSSARIO: Record<TermineGlossario['categoria'], string> = {
  ce: 'Conto Economico',
  overhead: 'Overhead e Struttura',
  orario: 'Costo Orario',
  rating: 'Rating Bancario',
  iva: 'IVA',
  fiscale: 'Fiscale',
  concetti: 'Concetti Fondamentali',
};
