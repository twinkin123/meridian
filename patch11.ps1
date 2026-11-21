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
$n1 = @'
  function placeBar() {
    if (!liqBar) return;
    if (!openLiq || !line) { liqBar.style.display = 'none'; return; }
    var y = line.priceToCoordinate(openLiq);
    if (y === null || y === undefined || !isFinite(y)) { liqBar.style.display = 'none'; return; }
    liqBar.style.display = 'block';
    liqBar.style.top = Math.round(y) + 'px';
  }

  function paintLiq() {
    /* Mounted on .pp-line, not #ppChart: the chart is inset 104px from the
       right, and absolute children of .pp-line span the whole card. */
    var host = document.querySelector('.pp-line');
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
        var pad = 5 * step();
        liqSeries.setData([
          { time: all[0].t, value: openLiq },
          { time: all[all.length - 1].t + pad, value: openLiq },
        ]);
      }
    }
    /* Two frames, so auto-scale has applied before the coordinate is read. */
    requestAnimationFrame(function () { requestAnimationFrame(placeBar); });
  }
'@
$j = Swap $j $o1 $n1

$o2 = @'
    paintLiq();
    chart.timeScale().fitContent();
    paintLiq();
    var m = all.length;
'@
$n2 = @'
    paintLiq();
    chart.timeScale().fitContent();
    paintLiq();
    var m = all.length;
    if (m > 1) chart.timeScale().setVisibleLogicalRange({ from: 0, to: m + 5 });
'@
$j = Swap $j $o2 $n2

$j = Swap $j "    window.addEventListener('resize', paintLiq);" "    window.addEventListener('resize', placeBar);"

if (([regex]::Matches($g, 'perps\.js\?v=41')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=41', 'perps.js?v=42')

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js