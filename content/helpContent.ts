export interface EsempioVisivo {
  titolo: string;
  descrizione: string;
  campi: { label: string; valore: string; nota?: string }[];
}

export interface ErroreComune {
  titolo: string;
  sbagliato: string;
  corretto: string;
  perche: string;
}

export interface SezioneHelp {
  id: string;
  titolo: string;
  sottotitolo: string;
  descrizione: string;
  aQuiServe: string[];
  comeSiCompila: string[];
  erroriComuni: ErroreComune[];
  esempiVisivi?: EsempioVisivo[];
  terminiCollegati: string[];
  faqRapide: { domanda: string; risposta: string }[];
}

export const HELP_CONTENT: Record<string, SezioneHelp> = {

  DASHBOARD: {
    id: 'DASHBOARD',
    titolo: 'Dashboard',
    sottotitolo: 'Il cruscotto dell\'anno in corso',
    descrizione: 'La Dashboard mostra un riepilogo immediato dell\'anno corrente: entrate lorde (IVA inclusa), uscite lorde e saldo. Tutte le cifre sono filtrate sull\'anno in corso e includono l\'IVA — perché quello che entra ed esce dal conto corrente include sempre l\'IVA.',
    aQuiServe: [
      'Avere un colpo d\'occhio immediato sull\'anno in corso',
      'Vedere la distribuzione delle spese per categoria nel grafico a torta',
      'Monitorare l\'andamento mensile degli ultimi 6 mesi nel grafico a barre',
    ],
    comeSiCompila: [
      'La Dashboard si popola automaticamente dalle transazioni inserite — non c\'è nulla da compilare manualmente',
      'Per avere dati significativi, assicurati che tutte le transazioni abbiano la categoria corretta',
      'Le transazioni marcate come "Previsionale" non appaiono nella Dashboard — solo i consuntivi reali',
    ],
    erroriComuni: [
      {
        titolo: 'Confondere il saldo Dashboard con il saldo bancario reale',
        sbagliato: 'Il saldo Dashboard è €180.000 — quindi ho €180.000 in banca',
        corretto: 'Il saldo Dashboard è il totale delle transazioni consuntive dell\'anno corrente nell\'app. Il saldo bancario reale si imposta nella Cash Flow Timeline come saldo iniziale dei conti.',
        perche: 'La Dashboard somma le transazioni inserite, non legge il conto bancario direttamente. Se non hai inserito tutte le transazioni, il saldo è parziale.',
      },
      {
        titolo: 'Aspettarsi di vedere i dati degli anni precedenti',
        sbagliato: 'A gennaio vedo quasi nulla nella Dashboard — è rotta',
        corretto: 'La Dashboard mostra solo l\'anno corrente. A gennaio ci sono poche transazioni perché l\'anno è appena iniziato. È corretto.',
        perche: 'La Dashboard è pensata per il controllo dell\'anno in corso, non per l\'analisi storica. Per anni precedenti usa il Conto Economico con il selettore anno.',
      },
    ],
    esempiVisivi: [
      {
        titolo: 'SAL incassato — come appare nella Dashboard',
        descrizione: 'Un SAL da €45.000 + IVA 10% appare così nelle Entrate della Dashboard',
        campi: [
          { label: 'Entrate Dashboard', valore: '€49.500', nota: 'Importo lordo IVA inclusa: 45.000 × 1,10' },
          { label: 'Categoria nel grafico', valore: '[CANTIERE] SAL — Stato Avanzamento Lavori', nota: 'La categoria determina dove appare nel grafico a torta' },
        ],
      },
    ],
    terminiCollegati: ['fatturato', 'sal', 'competenza_vs_cassa'],
    faqRapide: [
      { domanda: 'Perché le cifre della Dashboard differiscono dal CE?', risposta: 'La Dashboard usa importi lordi IVA inclusa e tutte le categorie (anche CAPEX e IVA). Il CE usa importi netti e solo le voci economiche — esclude CAPEX, IVA e finanziamenti.' },
      { domanda: 'Posso vedere anni precedenti nella Dashboard?', risposta: 'No — la Dashboard è solo per l\'anno corrente. Per gli anni precedenti vai nel Conto Economico e cambia l\'anno con le frecce.' },
    ],
  },

  TIMELINE: {
    id: 'TIMELINE',
    titolo: 'Cash Flow Timeline',
    sottotitolo: 'Il saldo bancario mese per mese',
    descrizione: 'È il cuore dell\'app: mostra come evolve il saldo bancario reale mese per mese per tutto l\'anno, distinguendo tra movimenti consuntivi (già avvenuti) e previsionali (attesi). Parte dal saldo iniziale dei conti bancari e lo fa avanzare con ogni entrata e uscita. I colori indicano la salute della liquidità: verde = sicuro, arancio = attenzione, rosso = critico.',
    aQuiServe: [
      'Sapere quanti soldi ci sono e ci saranno sul conto ogni mese',
      'Anticipare mesi con liquidità bassa prima che diventino un problema',
      'Pianificare quando fare investimenti o quando richiedere fidi',
      'Monitorare i rimborsi dei mutui e il debito residuo',
    ],
    comeSiCompila: [
      'Prima di tutto: configura il saldo iniziale cliccando l\'icona ingranaggio — inserisci il saldo reale di ogni conto bancario al 1° gennaio (o alla data di inizio utilizzo)',
      'Inserisci i mutui esistenti con importo residuo, tasso, date inizio/fine — l\'app calcola automaticamente le rate',
      'Inserisci le transazioni passate come Consuntivo (isForecast = false)',
      'Inserisci le transazioni attese come Previsionale (isForecast = true)',
      'Il saldo progressivo mensile si calcola automaticamente',
    ],
    erroriComuni: [
      {
        titolo: 'Non impostare il saldo iniziale',
        sbagliato: 'Inserisco le transazioni senza impostare il saldo iniziale',
        corretto: 'Prima imposta il saldo iniziale con i saldi reali dei conti bancari al 1° gennaio (o alla data di partenza)',
        perche: 'Senza saldo iniziale, il progressivo parte da zero e tutti i saldi mensili sono sbagliati.',
      },
      {
        titolo: 'Inserire un finanziamento ricevuto senza registrare il mutuo',
        sbagliato: 'Registro il finanziamento come entrata ma non aggiungo il mutuo nella configurazione',
        corretto: 'Aggiungi il mutuo nella sezione "Finanziamenti Attivi" — l\'app calcolerà automaticamente le rate future come uscite previsionali',
        perche: 'Se non registri il mutuo, le rate future non compaiono nel previsionale. NOTA: le uscite per mutui già registrate come transazioni sostituiscono le rate previste dal piano di ammortamento nel passato, evitando doppie conteggiature.',
      },
      {
        titolo: 'Confondere Previsionale e Consuntivo',
        sbagliato: 'Inserisco tutto come consuntivo anche per i mesi futuri',
        corretto: 'Usa Consuntivo solo per operazioni già avvenute e verificate in banca. Usa Previsionale per tutto ciò che è atteso ma non ancora avvenuto.',
        perche: 'La Timeline distingue i due flussi visivamente. Mescolarli rende impossibile capire cosa è certo e cosa è stimato.',
      },
    ],
    esempiVisivi: [
      {
        titolo: 'Configurazione saldo iniziale',
        descrizione: 'Come impostare i conti bancari a inizio anno',
        campi: [
          { label: 'Conto principale BNL', valore: '€85.000', nota: 'Saldo al 1° gennaio verificato sull\'estratto conto' },
          { label: 'Conto secondario UniCredit', valore: '€12.500', nota: 'Saldo al 1° gennaio' },
          { label: 'Saldo Iniziale Totale', valore: '€97.500', nota: 'Calcolato automaticamente — da qui parte la Timeline' },
        ],
      },
    ],
    terminiCollegati: ['competenza_vs_cassa', 'capex', 'ammortamento'],
    faqRapide: [
      { domanda: 'Cosa significano i colori sul saldo mensile?', risposta: 'Verde = saldo sopra la soglia di sicurezza (media spese mensili × 2). Arancio = sotto la soglia ma positivo. Rosso = saldo negativo.' },
      { domanda: 'Como funziona il calcolo delle rate mutuo?', risposta: 'L\'app usa il piano di ammortamento francese (rata costante). Basta inserire il capitale residuo, il tasso annuo, la data inizio ammortamento e la data fine.' },
      { domanda: 'Cosa è la soglia di sicurezza?', risposta: 'È il doppio della spesa mensile media dell\'anno. Se spendi mediamente €50k al mese, la soglia è €100k — avere meno in cassa è segnalato in arancio.' },
    ],
  },

  CE_RICLASSIFICATO: {
    id: 'CE_RICLASSIFICATO',
    titolo: 'Conto Economico Riclassificato',
    sottotitolo: 'La redditività dell\'azienda livello per livello',
    descrizione: 'Il CE mostra come il fatturato si trasforma in utile, passando per diversi livelli di margine: Primo Margine → EBITDA → EBIT → EBT → Utile Netto. Ogni livello rimuove una categoria di costi aggiuntiva. Permette di capire esattamente dove l\'azienda guadagna o perde.',
    aQuiServe: [
      'Capire la redditività reale dell\'azienda a ogni livello',
      'Confrontare l\'andamento mensile con proiezioni e budget',
      'Preparare i dati per il commercialista',
      'Calcolare le imposte stimate (tab Previsione Fiscale in AnalisiView)',
    ],
    comeSiCompila: [
      'Il CE si popola automaticamente dalle transazioni per i flussi di cassa',
      'Le Variazioni Rimanenze (WIP) modificano automaticamente il Valore della Produzione e i margini a cascata',
      'Gli ammortamenti annuali si inseriscono manualmente nel CE per rettificare l\'EBIT (diversi dal Net Book Value dello Stato Patrimoniale che è automatico)',
      'Per confrontare con il commercialista: attiva il toggle "Per Competenza" e inserisci le rimanenze nella sezione Rettifiche di Fine Anno',
    ],
    erroriComuni: [
      {
        titolo: 'Non distinguere SAL da Anticipo Cliente',
        sbagliato: 'Registro un acconto del cliente come [CANTIERE] SAL',
        corretto: 'Gli acconti clienti vanno in [CANTIERE] Anticipi da Clienti su Commessa — ceType solo_cashflow',
        perche: 'Se metti un acconto come SAL, il fatturato nel CE si gonfia prima che il lavoro sia stato eseguito. Il commercialista ti segnalerà l\'errore.',
      },
      {
        titolo: 'Dimenticare di inserire gli ammortamenti',
        sbagliato: 'Non inserisco mai gli ammortamenti perché non capisco come calcolarli',
        corretto: 'Inserisci la quota annua divisa per 12 ogni mese, oppure tutto in dicembre, nella riga manuale del CE.',
        perche: 'Senza ammortamenti manuali, EBIT = EBITDA nel CE. Nota: nello Stato Patrimoniale, invece, l\'app svaluta automaticamente i cespiti calcolando il Net Book Value.',
      },
    ],
    esempiVisivi: [
      {
        titolo: 'Cascata CE — mese tipo',
        descrizione: 'Come leggere il CE di un buon mese di lavoro',
        campi: [
          { label: 'Ricavi Core (SAL + Saldo)', valore: '€76.200', nota: '' },
          { label: 'Costi Variabili (−)', valore: '€47.800', nota: 'Materiali + operai + subappalti' },
          { label: 'PRIMO MARGINE', valore: '€28.400 (37,3%)', nota: 'Verde se > 30%' },
          { label: 'Costi Studio + Fissi (−)', valore: '€11.700', nota: '€5k studio + €6.700 fissi quota mensile' },
          { label: 'EBITDA', valore: '€16.700 (21,9%)', nota: 'Verde se > 10%' },
          { label: 'Ammortamenti (−)', valore: '€1.500', nota: 'Quota mensile inserita manualmente' },
          { label: 'EBIT', valore: '€15.200 (19,9%)', nota: '' },
        ],
      },
    ],
    terminiCollegati: ['fatturato', 'primo_margine', 'ebitda', 'ebit', 'ebt', 'utile_netto', 'ammortamento', 'break_even', 'competenza_vs_cassa', 'wip'],
    faqRapide: [
      { domanda: 'Perché il CE dell\'app è diverso da quello del commercialista?', risposta: 'Tre motivi principali: 1) L\'app usa la cassa (data incasso), il commercialista usa la competenza (data fattura). 2) Gli ammortamenti nell\'app vanno inseriti manualmente. 3) Il commercialista inserisce le rimanenze WIP di fine anno. Usa il toggle Competenza e la sezione Rettifiche per allinearli.' },
      { domanda: 'Come funziona il tab Scostamenti?', risposta: 'Mostra la differenza tra Budget (obiettivo), Previsionale (atteso) e Consuntivo (reale) per ogni voce. Verde = meglio del previsto, Rosso = peggio del previsto.' },
    ],
  },

  ANALISI_INDICI: {
    id: 'ANALISI_INDICI',
    titolo: 'Analisi & Indici',
    sottotitolo: 'Overhead, preventivi e numeri sacri',
    descrizione: 'La sezione più operativa per chi fa preventivi. Calcola automaticamente i tassi di overhead dai dati reali dell\'anno e li usa per calcolare il prezzo minimo di qualsiasi cantiere o operazione immobiliare. Include anche il costo orario reale degli operai e i 7+1 numeri chiave dell\'azienda.',
    aQuiServe: [
      'Sapere esattamente quale overhead rate applicare nei preventivi',
      'Calcolare il prezzo minimo di un cantiere in pochi secondi',
      'Verificare il costo reale per ora delle squadre',
      'Monitorare i 7 indicatori chiave di salute aziendale',
      'Stimare le imposte IRES/IRAP dell\'anno',
    ],
    comeSiCompila: [
      'Non c\'è nulla da compilare — tutto si calcola dai dati delle transazioni',
      'Per il Costo Orario: inserisci le ore lavorate in cantiere quel mese (dai cartellini) nel campo apposito',
      'Per la Previsione Fiscale: l\'app calcola automaticamente IRES/IRAP stimati e rileva in automatico Acconti o Imposte Storiche già versate (categoria Fisco) per darti il saldo esatto ancora da versare',
      'Per i preventivi: inserisci il costo diretto stimato e il margine desiderato — il prezzo minimo è automatico',
    ],
    erroriComuni: [
      {
        titolo: 'Usare l\'overhead rate calcolato su pochi mesi per un preventivo annuale',
        sbagliato: 'A febbraio uso l\'overhead rate del 45% calcolato su 2 mesi per fare un preventivo',
        corretto: 'Usa l\'overhead rate dell\'anno precedente completo come base, o aspetta almeno 6 mesi di dati',
        perche: 'Nei primi mesi dell\'anno i costi fissi ci sono ma il fatturato è basso — l\'overhead rate risulta gonfiato. La proiezione a 12 mesi (indicatore in verde nell\'app) è più affidabile.',
      },
      {
        titolo: 'Applicare l\'overhead rate sul prezzo invece che sui costi diretti',
        sbagliato: 'Prezzo = Costi Diretti + (Prezzo × 28%) — formula circolare',
        corretto: 'Prezzo Minimo = (Costi Diretti × (1 + Overhead Rate)) ÷ (1 − Margine%)',
        perche: 'L\'overhead rate va moltiplicato per i costi diretti, non per il prezzo. Il calcolatore dell\'app lo fa correttamente in automatico.',
      },
    ],
    esempiVisivi: [
      {
        titolo: 'Preventivo cantiere conto terzi — esempio completo',
        descrizione: 'Cantiere ristrutturazione appartamento: costi diretti stimati €45.000, margine target 12%',
        campi: [
          { label: 'Costi Diretti Cantiere', valore: '€45.000', nota: 'Materiali + operai + subappalti stimati' },
          { label: 'Quota Studio (overhead rate 18%)', valore: '€8.100', nota: '45.000 × 18%' },
          { label: 'Quota Struttura (overhead rate 10%)', valore: '€4.500', nota: '45.000 × 10%' },
          { label: 'Costo Totale', valore: '€57.600', nota: '45.000 + 8.100 + 4.500' },
          { label: 'Margine Utile (12% sul prezzo)', valore: '€7.855', nota: '' },
          { label: 'PREZZO MINIMO DA OFFRIRE', valore: '€65.455', nota: '57.600 ÷ (1 − 0,12)' },
          { label: 'Coefficiente di Ricarico', valore: '1,45x', nota: 'Moltiplica i costi diretti per 1,45' },
        ],
      },
    ],
    terminiCollegati: ['overhead_rate_totale', 'incidenza_studio_fatturato', 'incidenza_fissi_fatturato', 'coefficiente_ricarico', 'costo_orario_reale', 'ebitda', 'break_even', 'ires', 'irap'],
    faqRapide: [
      { domanda: 'Qual è la differenza tra "su fatturato" e "su costi diretti"?', risposta: '"Su fatturato" serve per il controllo mensile della struttura (metodo Gasparotto). "Su costi diretti" serve per i preventivi — è l\'unico metodo che funziona prima di conoscere il ricavo finale.' },
      { domanda: 'Il costo orario non trova dati — perché?', risposta: 'Il costo orario legge le transazioni con categoria [PERSONALE] Stipendi Dipendenti Operativi e [PERSONALE] Contributi Dipendenti Operativi del mese selezionato. Se non ci sono transazioni con quelle categorie, il risultato è zero.' },
    ],
  },

  RATING_BANCHE: {
    id: 'RATING_BANCHE',
    titolo: 'Rating Bancario',
    sottotitolo: 'Come ti vede la banca — Basilea 3',
    descrizione: 'Simula la valutazione del merito creditizio che la banca fa sulla tua azienda secondo i criteri Basilea 3. Si basa su 7 indicatori estratti dallo Stato Patrimoniale e dal CE. Non è il rating reale (che include anche Centrale Rischi e fattori qualitativi) ma è un ottimo indicatore preventivo.',
    aQuiServe: [
      'Capire come appare l\'azienda agli occhi della banca prima di chiedere un finanziamento',
      'Identificare quali indicatori migliorare per ottenere condizioni migliori',
      'Monitorare l\'evoluzione del profilo di rischio nel tempo',
    ],
    comeSiCompila: [
      'Il Rating richiede almeno uno Snapshot di Stato Patrimoniale inserito — vai in Stato Patrimoniale e crea uno snapshot con i dati di bilancio',
      'I dati del CE (EBITDA, Oneri Finanziari, Utile Netto) vengono presi automaticamente dalle transazioni',
      'Più lo snapshot SP è recente e accurato, più il Rating è affidabile',
    ],
    erroriComuni: [
      {
        titolo: 'Non avere snapshot SP inseriti',
        sbagliato: 'Vado in Rating e vedo solo un messaggio di errore',
        corretto: 'Inserisci almeno un snapshot nello Stato Patrimoniale con i dati del bilancio più recente',
        perche: 'PFN, Current Ratio e Solidità Patrimoniale si calcolano dai dati SP — senza snapshot non è possibile calcolarli.',
      },
    ],
    esempiVisivi: [
      {
        titolo: 'Cosa migliorare per passare da BB a A',
        descrizione: 'Azienda con score 4/7 — due indicatori da correggere',
        campi: [
          { label: 'PFN/EBITDA', valore: '3,8x ❌', nota: 'Sopra la soglia 3x — ridurre il debito o aumentare EBITDA' },
          { label: 'DSO', valore: '72 giorni ❌', nota: 'Sopra i 60 — accelerare gli incassi dai committenti' },
          { label: 'Current Ratio', valore: '1,35 ✓', nota: 'Sopra 1,2 — ok' },
          { label: 'Solidità Patrimoniale', valore: '31% ✓', nota: 'Sopra 30% — ok, ma migliorabile lasciando utili in azienda' },
        ],
      },
    ],
    terminiCollegati: ['pfn', 'pfn_ebitda', 'copertura_interessi', 'current_ratio', 'solidita_patrimoniale', 'dso', 'dpo'],
    faqRapide: [
      { domanda: 'Perché il mio rating reale in banca è diverso?', risposta: 'Il rating reale include anche la Centrale Rischi (storico sconfinamenti), i bilanci depositati, la qualità del management e fattori settoriali. Questa simulazione usa solo gli indici quantitativi di bilancio.' },
      { domanda: 'Come miglioro la Solidità Patrimoniale?', risposta: 'Non distribuire gli utili ai soci — lasciarli come riserve. Ogni euro di utile che resta in azienda aumenta il patrimonio netto e migliora questo indicatore.' },
    ],
  },

  STATO_PATRIMONIALE: {
    id: 'STATO_PATRIMONIALE',
    titolo: 'Stato Patrimoniale',
    sottotitolo: 'La fotografia del patrimonio in un momento preciso',
    descrizione: 'Lo Stato Patrimoniale è una fotografia statica dell\'azienda in una data precisa: cosa possiede (Attivo), quanto deve (Passivo) e qual è il valore netto (Patrimonio Netto). A differenza del CE che mostra un flusso nel tempo, lo SP mostra uno stock in un istante. Deve sempre quadrare: Attivo = Passivo + Patrimonio Netto.',
    aQuiServe: [
      'Inserire i dati di bilancio per alimentare il Rating Bancario',
      'Monitorare l\'evoluzione patrimoniale nel tempo',
      'Calcolare DSO e DPO da snapshot',
    ],
    comeSiCompila: [
      'Crea uno snapshot per ogni chiusura di esercizio (31/12) con i dati del bilancio depositato',
      'Puoi creare snapshot intermedi (es. 30/06) per monitoraggi infra-annuali',
      'I cespiti si svalutano dinamicamente: inserisci il valore di acquisto e l\'app calcolerà il Net Book Value (NBV) e il Fondo Ammortamento in automatico per lo snapshot corrente',
      'Verifica sempre che la quadratura sia confermata (Attivo = Passivo + PN)',
    ],
    erroriComuni: [
      {
        titolo: 'Inserire valori approssimati che non quadrano',
        sbagliato: 'Inserisco valori a memoria senza verificare il quadro',
        corretto: 'Usa i dati esatti dal bilancio depositato. La riga "Quadratura" deve mostrare ✓',
        perche: 'Se lo SP non quadra, tutti gli indici calcolati da esso (Current Ratio, Solidità, PFN) sono errati.',
      },
    ],
    terminiCollegati: ['pfn', 'current_ratio', 'solidita_patrimoniale', 'dso', 'dpo'],
    faqRapide: [
      { domanda: 'Con quale frequenza inserire gli snapshot?', risposta: 'Il minimo indispensabile è uno snapshot al 31/12 di ogni anno. Per il Rating più preciso, aggiungi anche uno al 30/06.' },
    ],
  },

  BUDGET: {
    id: 'BUDGET',
    titolo: 'Budget',
    sottotitolo: 'Gli obiettivi economici dell\'anno',
    descrizione: 'Il Budget è il piano economico preventivo per l\'anno — quanto si vuole fatturare, quanto si prevede di spendere, e quale utile si vuole raggiungere. Si inserisce una volta all\'anno (tipicamente a dicembre per l\'anno successivo) e poi si confronta con il consuntivo nel tab Scostamenti del CE.',
    aQuiServe: [
      'Fissare obiettivi economici annuali',
      'Confrontare ogni mese il piano con la realtà nel tab Scostamenti del CE',
      'Comunicare gli obiettivi alle banche o ai soci',
    ],
    comeSiCompila: [
      'Inserisci un importo annuo per ogni voce — l\'app lo distribuisce automaticamente in dodicesimi uguali',
      'Puoi copiare il budget dell\'anno precedente come base con il pulsante "Copia da anno precedente"',
      'Per distribuzioni non uniformi (cantieri stagionali), modifica i singoli mesi nella modalità avanzata',
    ],
    terminiCollegati: ['fatturato', 'ebitda', 'primo_margine'],
    faqRapide: [
      { domanda: 'Dove vedo il confronto Budget vs Consuntivo?', risposta: 'Nel Conto Economico — tab Scostamenti. Ogni voce mostra Budget, Previsionale, Consuntivo e la differenza in euro e percentuale con semaforo colorato.' },
    ],
    erroriComuni: [],
  },

  IVA_POSIZIONE: {
    id: 'IVA_POSIZIONE',
    titolo: 'Posizione IVA',
    sottotitolo: 'IVA incassata, pagata e da versare',
    descrizione: 'Calcola automaticamente la posizione IVA mensile estraendo l\'IVA dalle transazioni. Distingue l\'IVA incassata dai clienti (che devi all\'erario) da quella pagata ai fornitori (che puoi scalarti). Mostra i mesi di scadenza F24 e il credito o debito residuo.',
    aQuiServe: [
      'Prevedere quanto versare all\'erario nei mesi di liquidazione IVA',
      'Non farsi trovare impreparati sui versamenti F24',
      'Verificare se l\'IVA è stata compilata correttamente su tutte le transazioni',
    ],
    comeSiCompila: [
      'Non c\'è nulla da compilare manualmente — i dati vengono dalle transazioni',
      'FONDAMENTALE: compilare sempre il campo "Aliquota IVA" su ogni transazione (22% fornitori materiali, 10% SAL edilizia, 4% per operazioni agevolate)',
      'I versamenti F24 IVA vanno registrati come [FISCO] Versamento IVA per essere scalati automaticamente',
    ],
    erroriComuni: [
      {
        titolo: 'Non compilare l\'aliquota IVA sulle transazioni',
        sbagliato: 'Inserisco le transazioni senza mettere l\'aliquota IVA — tanto ci pensa il commercialista',
        corretto: 'Compila sempre il campo IVA su ogni transazione: 22% per la maggior parte dei costi, 10% per SAL edilizia residenziale',
        perche: 'Senza aliquota IVA, la posizione IVA mostra zero per quelle transazioni e il calcolo è inaffidabile.',
      },
    ],
    terminiCollegati: ['posizione_iva'],
    faqRapide: [
      { domanda: 'Quale aliquota IVA usare per i SAL?', risposta: 'Edilizia residenziale (manutenzione): 10%. Nuova costruzione prima casa: 4%. Nuova costruzione seconda casa: 22%. Lavori su fabbricati strumentali: 22%. Verifica sempre con il commercialista per i casi specifici.' },
      { domanda: 'Cosa è la liquidazione trimestrale vs mensile?', risposta: 'I contribuenti con volume d\'affari sotto €400k (servizi) o €700k (altre attività) possono liquidare l\'IVA trimestralmente invece che mensilmente. L\'app rileva automaticamente il regime usato dai versamenti registrati.' },
    ],
  },

};
