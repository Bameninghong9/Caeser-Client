# Baut den Launcher und lädt ihn als Release nach Bameninghong9/Caeser-Client-Releases hoch.
# Fragt den GitHub-Token verdeckt ab; er wird nirgends gespeichert und nur für diesen Lauf gesetzt.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
Write-Host ''
Write-Host "Caeser Client $version wird veroeffentlicht." -ForegroundColor Cyan
$secure = Read-Host 'GitHub-Token einfuegen (Rechtsklick) und Enter druecken' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if (-not $env:GH_TOKEN) { throw 'Kein Token eingegeben.' }
  # GitHub verlangt für veröffentlichte Releases einen vorhandenen Tag: v<Version> auf main anlegen, falls er fehlt.
  $repo = 'https://api.github.com/repos/Bameninghong9/Caeser-Client-Releases'
  $headers = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = 'application/vnd.github+json'; 'User-Agent' = 'caeser-release' }
  $tag = "v$version"
  try { Invoke-RestMethod "$repo/git/ref/tags/$tag" -Headers $headers | Out-Null; Write-Host "Tag $tag existiert schon." }
  catch {
    $sha = (Invoke-RestMethod "$repo/git/ref/heads/main" -Headers $headers).object.sha
    $body = @{ ref = "refs/tags/$tag"; sha = $sha } | ConvertTo-Json
    Invoke-RestMethod "$repo/git/refs" -Method Post -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
    Write-Host "Tag $tag angelegt."
  }
  npm run release
  if ($LASTEXITCODE -ne 0) { throw "Release fehlgeschlagen (Code $LASTEXITCODE)." }
  Write-Host ''
  Write-Host "Fertig: https://github.com/Bameninghong9/Caeser-Client-Releases/releases" -ForegroundColor Green
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}
