# Avviato automaticamente da Windows ogni giorno alle 9:00 (Attivita Pianificata "GV_ImportaPuntaNet").
# Esegue l'estrazione/classificazione PuntaNet in modalita SCRITTURA (--scrivi): i movimenti ad
# alta confidenza vengono scritti direttamente nel file dati reale, gli altri finiscono in
# bozzaImportPuntaNet per la revisione manuale in app (banner giallo "movimenti da classificare").
# Esegue anche l'estrazione dell'anagrafica fornitori (tab "Fornitori") in modalita SCRITTURA
# (--scrivi), sempre alla stessa ora: i fornitori nuovi vengono aggiunti (categoria "Da
# Categorizzare", da assegnare in app quando si vuole) e quelli gia' noti aggiornati SOLO nei
# campi economici (fatturato/numero fatture/ultima fattura) — mai contatti/categoria/note, che
# restano le scelte fatte a mano in app. Niente piu' passaggio manuale di selezione file
# (richiesto 2026-09-16): il banner "N fornitori aggiornati" in app segnala cosa e' successo.
# Salva sempre un log leggibile per verificare cosa e' successo.

$ErrorActionPreference = 'Continue'
$ProjectDir = "E:\Direzione\Desktop\gv-gestionefinanziaria-1.0"
$LogDir = "\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\AUTO"
$LogFile = Join-Path $LogDir ("log_{0}.txt" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

Set-Location $ProjectDir
"=== Avvio importaPuntaNet.mjs --scrivi - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $LogFile -Encoding utf8

try {
    & npx tsx "scripts\importaPuntaNet.mjs" --scrivi 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    "=== Completato con successo ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
} catch {
    "=== ERRORE: $($_.Exception.Message) ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

"=== Avvio importaFornitoriPuntaNet.mjs - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $LogFile -Append -Encoding utf8

try {
    & npx tsx "scripts\importaFornitoriPuntaNet.mjs" --scrivi 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    "=== Completato con successo ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
} catch {
    "=== ERRORE: $($_.Exception.Message) ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
}
