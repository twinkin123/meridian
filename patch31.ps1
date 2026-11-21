$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$b = Join-Path $PWD 'public/bottom-nav.css'
$h = Join-Path $PWD 'public/app.html'
$c = [System.IO.File]::ReadAllText($b)
$g = [System.IO.File]::ReadAllText($h)
if (-not $c -or -not $g) { throw 'empty read' }

if ($c.Contains('equal flex cells')) {
  Write-Host 'already applied'
} else {
  $add = @()
  $add += ''
  $add += '/* ticker: there is no track wrapper, cells are direct children - equal flex cells */'
  $add += '@media (max-width:980px){'
  $add += 'html body .main > .tickers{display:flex!important;flex-wrap:nowrap!important;overflow:hidden!important;margin:0 -20px 12px!important;padding:0 8px!important}'
  $add += 'html body .main > .tickers .tk{flex:1 1 0!important;width:auto!important;min-width:0!important;max-width:none!important;overflow:hidden!important;padding:7px 4px!important;gap:3px!important}'
  $add += 'html body .main > .tickers .tk > div{min-width:0!important;overflow:hidden!important}'
  $add += 'html body .main > .tickers .tk .ic{width:11px!important;height:11px!important;flex:0 0 11px!important}'
  $add += 'html body .main > .tickers .tk b{font-size:9px!important;line-height:1.1!important}'
  $add += 'html body .main > .tickers .tk .px{min-width:0!important}'
  $add += 'html body .main > .tickers .tk .px .v{font-size:9px!important}'
  $add += 'html body .main > .tickers .tk .px em{font-size:8px!important}'
  $add += '}'
  $c = $c.TrimEnd() + "`n" + ($add -join "`n") + "`n"
  [System.IO.File]::WriteAllText($b, $c, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'ticker set to equal flex cells'
}

if (([regex]::Matches($g, 'bottom-nav\.css\?v=\d+')).Count -ne 1) { throw 'version not found' }
$g = [regex]::Replace($g, 'bottom-nav\.css\?v=(\d+)', { param($m) 'bottom-nav.css?v=' + ([int]$m.Groups[1].Value + 1) })
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
git add -A
git commit -m "ticker: equal flex cells, the band has no track wrapper"
git push
