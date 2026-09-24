# Ripristina i tre database "copia locale" (GC_Impresa1_RO, GC_Impresa2_RO, GC_Comune_RO) su
# SQLEXPRESS dall'ultimo backup automatico di PuntaNet — quello che PuntaNet stesso genera ogni
# sera in BK_Automatico\<giorno>\, a rotazione settimanale. Va eseguito PRIMA di
# run_import_automatico.ps1 (Attivita Pianificata "GV_ImportaPuntaNet"), cosi' l'import legge
# sempre dati freschi invece della stessa fotografia congelata.
#
# NON tocca mai l'istanza reale PuntaNet (MSSQL$PUNTANET): legge solo il file .bak gia' prodotto
# da PuntaNet, e scrive solo nella copia isolata "_RO" su SQLEXPRESS (MOVE esplicito su ogni file
# — il percorso originale dentro il backup e' un percorso di rete della produzione PuntaNet,
# senza MOVE il restore tenterebbe di scrivere li').
#
# Bug reale trovato il 2026-09-24: questo passaggio non era mai stato automatizzato — un solo
# ripristino manuale il 9 settembre, mai ripetuto, ha lasciato la copia locale ferma per 15
# giorni mentre l'import (che legge solo quella copia) continuava a girare "con successo" ogni
# mattina senza trovare nulla di nuovo, perche' per lui non era davvero cambiato nulla.
#
# La cartella di backup da usare e' sempre quella con il file .bak piu' recente per DATA DI
# MODIFICA REALE, mai per nome cartella/giorno della settimana: la rotazione settimanale riusa
# gli stessi nomi di cartella ogni 7 giorni, quindi ordinare per nome prenderebbe la cartella
# sbagliata nei giorni in cui il backup serale non e' ancora stato sovrascritto.
#
# Uso: powershell -File scripts\aggiornaCopiaLocale.ps1

$ErrorActionPreference = 'Stop'

$SQLCMD = 'C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\110\Tools\Binn\SQLCMD.EXE'
$INSTANCE = 'localhost\SQLEXPRESS'
$BACKUP_ROOT = 'E:\PuntaNet Gestione Cantieri\Dati\BK_Automatico'
$RESTORE_DIR = 'E:\SQL_ReadOnly'

# Nome del backup PuntaNet -> nome del database "_RO" su SQLEXPRESS. Il nome logico interno dei
# file (dati/log) e' rimasto quello originale in entrambi (es. "GC_Impresa2"), cambia solo il
# nome del database stesso e il percorso fisico dei file — verificato con RESTORE FILELISTONLY
# e sys.master_files il 2026-09-24.
$DATABASES = @(
  @{ Backup = 'GC_Impresa1'; Database = 'GC_Impresa1_RO' },
  @{ Backup = 'GC_Impresa2'; Database = 'GC_Impresa2_RO' },
  @{ Backup = 'GC_Comune';   Database = 'GC_Comune_RO' }
)

Write-Host "=== Aggiornamento copia locale PuntaNet -- $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="

$cartellaRecente = Get-ChildItem $BACKUP_ROOT -Directory |
  ForEach-Object {
    $bak = Get-ChildItem $_.FullName -Filter '*.bak' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($bak) { [PSCustomObject]@{ Cartella = $_; UltimoBackup = $bak.LastWriteTime } }
  } | Sort-Object UltimoBackup -Descending | Select-Object -First 1

if (-not $cartellaRecente) {
  Write-Error "Nessuna cartella di backup trovata in $BACKUP_ROOT"
  exit 1
}

$dir = $cartellaRecente.Cartella.FullName
Write-Host "Backup piu' recente trovato in: $dir (salvato il $($cartellaRecente.UltimoBackup))"

$erroreGenerale = $false

foreach ($db in $DATABASES) {
  $bakPath = Join-Path $dir "$($db.Backup).bak"
  if (-not (Test-Path $bakPath)) {
    Write-Warning "File di backup non trovato: $bakPath -- salto $($db.Database)"
    $erroreGenerale = $true
    continue
  }

  $mdfPath = Join-Path $RESTORE_DIR "$($db.Database).mdf"
  $ldfPath = Join-Path $RESTORE_DIR "$($db.Database)_log.ldf"

  $query = @"
RESTORE DATABASE [$($db.Database)]
FROM DISK = N'$bakPath'
WITH REPLACE, RECOVERY,
  MOVE N'$($db.Backup)' TO N'$mdfPath',
  MOVE N'$($db.Backup)_log' TO N'$ldfPath';
"@

  Write-Host ""
  Write-Host "--- Ripristino $($db.Database) da $($db.Backup).bak ---"
  & $SQLCMD -S $INSTANCE -E -Q $query
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Ripristino di $($db.Database) fallito (exit code $LASTEXITCODE)"
    $erroreGenerale = $true
  } else {
    Write-Host "OK: $($db.Database) aggiornato."
  }
}

if ($erroreGenerale) {
  Write-Host ""
  Write-Host "=== Completato CON ERRORI -- controllare sopra ==="
  exit 1
} else {
  Write-Host ""
  Write-Host "=== Copia locale PuntaNet aggiornata con successo ==="
}
