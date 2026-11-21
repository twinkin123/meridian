$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$h = Join-Path $PWD 'public/app.html'
$g = [System.IO.File]::ReadAllText($h)
if (-not $g) { throw 'empty read' }

function Swap([string]$t, [string]$o, [string]$n) {
  $c = ([regex]::Matches($t, [regex]::Escape($o))).Count
  if ($c -ne 1) { throw "matched $c : $o" }
  return $t.Replace($o, $n)
}

$g = Swap $g 'id="ppUp" type="button">Up</button>' 'id="ppUp" type="button">Long</button>'
$g = Swap $g 'id="ppDown" type="button">Down</button>' 'id="ppDown" type="button">Short</button>'

if (([regex]::Matches($g, 'perps\.js\?v=44')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=44', 'perps.js?v=45')

[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
Select-String -Path $h -Pattern 'id="ppUp"|id="ppDown"' | ForEach-Object { $_.Line.Trim() }