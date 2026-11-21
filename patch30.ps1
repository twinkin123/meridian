$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$b = Join-Path $PWD 'public/bottom-nav.css'
$h = Join-Path $PWD 'public/app.html'
$c = [System.IO.File]::ReadAllText($b)
$g = [System.IO.File]::ReadAllText($h)
if (-not $c -or -not $g) { throw 'empty read' }

if ($c.Contains('ticker band stays a block')) {
  Write-Host 'already applied'
} else {
  $add = @()
  $add += ''
  $add += '/* ticker band stays a block; only the track divides into columns */'
  $add += '@media (max-width:980px){'
  $add += 'html body .main > .tickers{display:block!important;overflow:hidden!important;margin:0 -20px 12px!important;padding:0 8px!important}'
  $add += 'html body .main > .tickers .tickers-track{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;width:100%!important;gap:0!important;animation:none!important;background-image:none!important}'
  $add += 'html body .main > .tickers .tk{width:auto!important;min-width:0!important;display:flex!important;flex-direction:row!important;align-items:center!important;gap:4px!important;padding:7px 5px!important;overflow:hidden!important}'
  $add += '/* nav clears the browser toolbar and never overlaps itself */'
  $add += 'html body .side{padding-bottom:calc(78px + env(safe-area-inset-bottom))!important;overflow-x:hidden!important}'
  $add += 'html body .side a{flex:1 1 0!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;font-size:8px!important;padding:8px 1px 6px!important}'
  $add += 'body{padding-bottom:calc(150px + env(safe-area-inset-bottom))!important}'
  $add += '}'
  $c = $c.TrimEnd() + "`n" + ($add -join "`n") + "`n"
  [System.IO.File]::WriteAllText($b, $c, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'fixed'
}

if (([regex]::Matches($g, 'bottom-nav\.css\?v=\d+')).Count -ne 1) { throw 'version not found' }
$g = [regex]::Replace($g, 'bottom-nav\.css\?v=(\d+)', { param($m) 'bottom-nav.css?v=' + ([int]$m.Groups[1].Value + 1) })
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
git add -A
git commit -m "ticker: band block, track grid; nav clears the browser bar"
git push
