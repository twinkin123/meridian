$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$js = Join-Path $PWD 'public/perps.js'
$h  = Join-Path $PWD 'public/app.html'
$skin = Join-Path $PWD 'public/app-skin.css'
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
  var liqSeries = null, openLiq = null;
  var openCount = 0;
  function paintLiq() {
    if (!liqSeries) return;
    if (!openLiq || all.length < 2) { liqSeries.setData([]); return; }
    var pad = Math.max(6, Math.round(all.length * 0.03)) * step();
    liqSeries.setData([
      { time: all[0].t, value: openLiq },
      { time: all[all.length - 1].t + pad, value: openLiq },
    ]);
  }
'@
$n1 = @'
  var liqSeries = null, openLiq = null, liqBar = null;
  var openCount = 0;

  function paintLiq() {
    var host = $('ppChart');
    if (host && !liqBar) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      liqBar = document.createElement('div');
      liqBar.className = 'pp-liqbar';
      host.appendChild(liqBar);
    }
    /* The series only exists so auto-scale keeps the liq price on screen. */
    if (liqSeries) {
      if (!openLiq || all.length < 2) liqSeries.setData([]);
      else {
        var pad = Math.max(6, Math.round(all.length * 0.03)) * step();
        liqSeries.setData([
          { time: all[0].t, value: openLiq },
          { time: all[all.length - 1].t + pad, value: openLiq },
        ]);
      }
    }
    if (!liqBar) return;
    var y = openLiq && line ? line.priceToCoordinate(openLiq) : null;
    if (y === null || y === undefined || !isFinite(y)) { liqBar.style.display = 'none'; return; }
    liqBar.style.display = 'block';
    liqBar.style.top = Math.round(y) + 'px';
  }
'@
$j = Swap $j $o1 $n1

$o2 = @'
    paintLiq();
    chart.timeScale().fitContent();
    var m = all.length;
'@
$n2 = @'
    paintLiq();
    chart.timeScale().fitContent();
    paintLiq();
    var m = all.length;
'@
$j = Swap $j $o2 $n2

$o3 = @'
    loadHistory();
    quote();
    loadState();
    tick();
    arm();
  }
'@
$n3 = @'
    loadHistory();
    quote();
    loadState();
    tick();
    arm();
    window.addEventListener('resize', paintLiq);
  }
'@
$j = Swap $j $o3 $n3

if (([regex]::Matches($g, 'perps\.js\?v=40')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=40', 'perps.js?v=41')

Add-Content -Path $skin -Value "`n.pp-liqbar{position:absolute;left:0;right:0;height:2px;background:#f0476a;pointer-events:none;z-index:6}"

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js