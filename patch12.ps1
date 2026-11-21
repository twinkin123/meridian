$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$js = Join-Path $PWD 'public/perps.js'
$h  = Join-Path $PWD 'public/app.html'
$j = [System.IO.File]::ReadAllText($js)
$g = [System.IO.File]::ReadAllText($h)
if (-not $j -or -not $g) { throw 'empty read' }

function Pat([string]$s) {
  $n = ($s -replace "`r`n", "`n") -replace "`r", ""
  return ([regex]::Escape($n)) -replace '\\n', '\r?\n'
}
function Swap([string]$t, [string]$o, [string]$n) {
  $p = Pat $o
  $c = ([regex]::Matches($t, $p)).Count
  if ($c -ne 1) { throw "matched $c : $($o.Split("`n")[0])" }
  return [regex]::Replace($t, $p, { param($m) $n })
}

$o1 = @'
  function placeBar() {
    if (!liqBar) return;
    if (!openLiq || !line) { liqBar.style.display = 'none'; return; }
    var y = line.priceToCoordinate(openLiq);
    if (y === null || y === undefined || !isFinite(y)) { liqBar.style.display = 'none'; return; }
    liqBar.style.display = 'block';
    liqBar.style.top = Math.round(y) + 'px';
  }
'@
$n1 = @'
  function placeBar() {
    if (!liqBar) return;
    var host = document.querySelector('.pp-line');
    var el = $('ppChart');
    var h = el ? el.clientHeight : 0;
    if (!openLiq || !h || all.length < 2) { liqBar.style.display = 'none'; return; }
    /* Map the price here, mirroring the chart's 12% scale margins. The series
       coordinate is not used: the pane is taller than the visible card. */
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < all.length; i++) {
      if (all[i].usd < lo) lo = all[i].usd;
      if (all[i].usd > hi) hi = all[i].usd;
    }
    var top = Math.min(lo, openLiq), bot = Math.max(hi, openLiq);
    var span = bot - top || 1;
    var padY = h * 0.12;
    var y = padY + (bot - openLiq) / span * (h - padY * 2);
    var vis = host ? Math.min(h, host.clientHeight) : h;
    y = Math.max(1, Math.min(vis - 2, Math.round(y)));
    liqBar.style.display = 'block';
    liqBar.style.top = y + 'px';
  }
'@
$j = Swap $j $o1 $n1

if (([regex]::Matches($g, 'perps\.js\?v=42')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=42', 'perps.js?v=43')

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js