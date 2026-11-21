$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$b = Join-Path $PWD 'public/bottom-nav.css'
$h = Join-Path $PWD 'public/app.html'
$c = [System.IO.File]::ReadAllText($b)
$g = [System.IO.File]::ReadAllText($h)
if (-not $c -or -not $g) { throw 'empty read' }

if ($c.Contains('fit the viewport')) {
  Write-Host 'already applied'
} else {
  $add = @()
  $add += ''
  $add += '/* fit the viewport: ticker, stats and nav all share the width */'
  $add += '@media (max-width:980px){'
  $add += 'html body .main > .tickers{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;overflow:hidden!important;margin:0 -20px 12px!important;padding:0 8px!important}'
  $add += 'html body .main > .tickers .tickers-track{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;width:100%!important;gap:0!important;animation:none!important;background-image:none!important}'
  $add += 'html body .main > .tickers .tk{width:auto!important;min-width:0!important;display:flex!important;flex-direction:row!important;align-items:center!important;gap:4px!important;padding:7px 5px!important;overflow:hidden!important}'
  $add += 'html body .main > .tickers .tk .ic{width:12px!important;height:12px!important;flex:0 0 12px!important}'
  $add += 'html body .main > .tickers .tk b{font-size:9.5px!important;line-height:1.1!important}'
  $add += 'html body .main > .tickers .tk .px{flex-direction:column!important;align-items:flex-start!important;gap:0!important;min-width:0!important;line-height:1.1!important}'
  $add += 'html body .main > .tickers .tk .px .v{font-size:9.5px!important}'
  $add += 'html body .main > .tickers .tk .px em{font-size:8.5px!important}'
  $add += 'html body .main .stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}'
  $add += 'html body .main .stat{display:flex!important;flex-direction:column!important;align-items:flex-start!important;min-width:0!important;overflow:hidden!important;padding:10px 8px!important}'
  $add += 'html body .main .stat .lbl{font-size:8.5px!important;line-height:1.2!important;white-space:normal!important;overflow-wrap:anywhere!important;min-width:0!important}'
  $add += 'html body .main .stat b{font-size:14px!important;white-space:nowrap!important}'
  $add += 'html body .side{overflow-x:hidden!important}'
  $add += 'html body .side .navbox{width:100%!important}'
  $add += 'html body .side a{flex:1 1 0!important;min-width:0!important;flex-direction:column!important;justify-content:center!important;gap:3px!important;padding:8px 2px calc(8px + env(safe-area-inset-bottom))!important;font-size:8.5px!important;text-align:center!important;overflow:hidden!important}'
  $add += 'html body .side a .ico,html body .side a .ico svg{width:16px!important;height:16px!important}'
  $add += '}'
  $c = $c.TrimEnd() + "`n" + ($add -join "`n") + "`n"
  [System.IO.File]::WriteAllText($b, $c, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'fit rules added'
}

if (([regex]::Matches($g, 'bottom-nav\.css\?v=\d+')).Count -ne 1) { throw 'version not found' }
$g = [regex]::Replace($g, 'bottom-nav\.css\?v=(\d+)', { param($m) 'bottom-nav.css?v=' + ([int]$m.Groups[1].Value + 1) })
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
git add -A
git commit -m "mobile: fit ticker, stats and nav to the viewport"
git push
