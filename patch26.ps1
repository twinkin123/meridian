$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$js = Join-Path $PWD 'public/perps.js'
$h  = Join-Path $PWD 'public/app.html'
$j = [System.IO.File]::ReadAllText($js)
$g = [System.IO.File]::ReadAllText($h)
if (-not $j -or -not $g) { throw 'empty read' }

function Swap([string]$t, [string]$o, [string]$n) {
  $c = ([regex]::Matches($t, [regex]::Escape($o))).Count
  if ($c -ne 1) { throw "matched $c : $o" }
  return $t.Replace($o, $n)
}

$j = Swap $j "      color: '#ff7a6e'," "      color: '#28e664',"
$j = Swap $j "color: '#ff7a6e', size: 2 }]);" "color: '#28e664', size: 2 }]);"

if (([regex]::Matches($g, 'perps\.js\?v=52')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=52', 'perps.js?v=53')

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js