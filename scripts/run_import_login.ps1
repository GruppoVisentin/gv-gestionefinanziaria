# Avviato automaticamente da Windows al login (Attivita Pianificata "GV_ImportaPuntaNet").
# Esegue lo script di estrazione/classificazione PuntaNet in modalita dry-run (nessuna
# scrittura sul file dati vero) e salva un log leggibile per verificare cosa e' successo.

$ErrorActionPreference = 'Continue'
$ProjectDir = "E:\Direzione\Desktop\gv-gestionefinanziaria-1.0"
$LogDir = "\\NAS\Ufficio Tecnico\GRUPPO VISENTIN\00_GESTIONE GV\35_APP GV ECOSISTEM\04-GV GestioneFINANZIARIA\DATI SALVATI\AUTO"
$LogFile = Join-Path $LogDir ("log_{0}.txt" -f (Get-Date -Format 'yyyy-MM-dd_HHmm'))

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

Set-Location $ProjectDir
"=== Avvio importaPuntaNet.mjs - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $LogFile -Encoding utf8

try {
    & npx tsx "scripts\importaPuntaNet.mjs" 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8
    "=== Completato con successo ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
} catch {
    "=== ERRORE: $($_.Exception.Message) ===" | Out-File -FilePath $LogFile -Append -Encoding utf8
}
