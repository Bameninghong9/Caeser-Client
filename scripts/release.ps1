# Baut den Launcher und lädt ihn als Release nach Bameninghong9/Caeser-Client-Releases hoch.
# Der GitHub-Token wird beim ersten Mal verdeckt abgefragt und verschlüsselt (Windows DPAPI, nur für diesen
# Windows-Benutzer lesbar) unter %APPDATA%\caeser-release\token gespeichert; danach fragt das Skript nicht mehr.
#   -SaveToken   nur den Token abfragen und speichern, nichts bauen
#   -ResetToken  gespeicherten Token verwerfen und neu abfragen (z. B. nach Ablauf)
#   -Cleanup     nichts bauen, nur doppelte Releases der aktuellen Version zusammenführen
param([switch]$SaveToken, [switch]$ResetToken, [switch]$Cleanup)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$tokenFile = Join-Path $env:APPDATA 'caeser-release\token'
if ($ResetToken -and (Test-Path $tokenFile)) { Remove-Item $tokenFile }
if (Test-Path $tokenFile) { $secure = (Get-Content $tokenFile -Raw).Trim() | ConvertTo-SecureString }
else {
  $secure = Read-Host 'GitHub-Token einfuegen (Rechtsklick) und Enter druecken' -AsSecureString
  if ($secure.Length -eq 0) { throw 'Kein Token eingegeben.' }
  New-Item -ItemType Directory -Force (Split-Path $tokenFile) | Out-Null
  $secure | ConvertFrom-SecureString | Set-Content $tokenFile
  Write-Host 'Token verschluesselt gespeichert.' -ForegroundColor Green
}
if ($SaveToken) { return }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Caeser Client $version wird veroeffentlicht." -ForegroundColor Cyan
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  # GitHub verlangt für veröffentlichte Releases einen vorhandenen Tag: v<Version> auf main anlegen, falls er fehlt.
  $repo = 'https://api.github.com/repos/Bameninghong9/Caeser-Client-Releases'
  $headers = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'caeser-release' }
  $tag = "v$version"
  if (-not $Cleanup) {
    try { Invoke-RestMethod "$repo/git/ref/tags/$tag" -Headers $headers | Out-Null; Write-Host "Tag $tag existiert schon." }
    catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { throw 'Token ungueltig oder abgelaufen. Neu starten mit -ResetToken.' }
      $sha = (Invoke-RestMethod "$repo/git/ref/heads/main" -Headers $headers).object.sha
      $body = @{ ref = "refs/tags/$tag"; sha = $sha } | ConvertTo-Json
      Invoke-RestMethod "$repo/git/refs" -Method Post -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
      Write-Host "Tag $tag angelegt."
    }
    npm run release
    if ($LASTEXITCODE -ne 0) { throw "Release fehlgeschlagen (Code $LASTEXITCODE)." }
  }
  # electron-builder legt für Setup und Portable gleichzeitig Releases an; dabei entstehen manchmal zwei Releases mit
  # demselben Tag. Fehlende Dateien in das Release mit latest.yml verschieben und das doppelte löschen.
  $all = Invoke-RestMethod "$repo/releases?per_page=30" -Headers $headers  # erst zuweisen: PowerShell 5 reicht JSON-Arrays sonst als Ganzes weiter
  $same = @($all | Where-Object { $_.tag_name -eq $tag })
  if ($same.Count -gt 1) {
    $main = $same | Where-Object { $_.assets.name -contains 'latest.yml' } | Select-Object -First 1
    if (-not $main) { $main = $same[0] }
    $download = @{ Authorization = $headers.Authorization; Accept = 'application/octet-stream'; 'User-Agent' = 'caeser-release' }
    foreach ($other in $same | Where-Object { $_.id -ne $main.id }) {
      foreach ($asset in $other.assets | Where-Object { $main.assets.name -notcontains $_.name }) {
        $file = Join-Path $env:TEMP $asset.name
        Invoke-WebRequest $asset.url -Headers $download -OutFile $file -UseBasicParsing
        $upload = "https://uploads.github.com/repos/Bameninghong9/Caeser-Client-Releases/releases/$($main.id)/assets?name=$([uri]::EscapeDataString($asset.name))"
        Invoke-RestMethod $upload -Method Post -Headers $headers -InFile $file -ContentType 'application/octet-stream' | Out-Null
        Remove-Item $file
        Write-Host "$($asset.name) in das Haupt-Release verschoben."
      }
      Invoke-RestMethod "$repo/releases/$($other.id)" -Method Delete -Headers $headers | Out-Null
      Write-Host 'Doppeltes Release entfernt.'
    }
  }
  Write-Host ''
  Write-Host "Fertig: https://github.com/Bameninghong9/Caeser-Client-Releases/releases" -ForegroundColor Green
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}
