$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$js = Join-Path $PWD 'public/perps.js'
$h  = Join-Path $PWD 'public/app.html'
$j = [System.IO.File]::ReadAllText($js)
$g = [System.IO.File]::ReadAllText($h)
if (-not $j -or -not $g) { throw 'empty read' }

function Pat([string]$s) { ([regex]::Escape($s)) -replace '\\r\\n', '\r?\n' }
function Swap([string]$t, [string]$o, [string]$n) {
  $p = Pat $o
  $c = ([regex]::Matches($t, $p)).Count
  if ($c -ne 1) { throw "matched $c : $($o.Split("`n")[0])" }
  return [regex]::Replace($t, $p, { param($m) $n })
}

$o1 = @'
    chart.priceScale('right').applyOptions({ autoScale: true, scaleMargins: { top: 0.12, bottom: 0.12 } });
    chart.timeScale().fitContent();
  paintLiq();
    var m = all.length;
    if (m > 1) chart.timeScale().setVisibleLogicalRange({ from: 0, to: m + Math.max(6, Math.round(m * 0.03)) });
'@
$n1 = @'
    chart.priceScale('right').applyOptions({ autoScale: true, scaleMargins: { top: 0.12, bottom: 0.12 } });
    paintLiq();
    chart.timeScale().fitContent();
    var m = all.length;
'@
$j = Swap $j $o1 $n1

$o2 = @'
  var liqSeries = null, liqVal = null;
  var openCount = 0;
  function paintLiq() {
    if (!liqSeries) return;
    if (!liqVal || all.length < 2) { liqSeries.setData([]); return; }
    var pad = Math.max(6, Math.round(all.length * 0.03)) * step();
    liqSeries.setData([
      { time: all[0].t, value: liqVal },
      { time: all[all.length - 1].t + pad, value: liqVal },
    ]);
  }

  function drawLiq(liq) {
    liqVal = liq || null;
    paintLiq();
  }
'@
$n2 = @'
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

  /* The line follows the open position, not the ticket preview. */
  function setLiq(rows) {
    var best = null;
    (rows || []).forEach(function (p) {
      if (p.market !== market || !p.liq) return;
      if (!best || Math.abs(Number(p.liq) - Number(p.mark)) < Math.abs(Number(best.liq) - Number(best.mark))) best = p;
    });
    openLiq = best ? Number(best.liq) : null;
    paintLiq();
  }
'@
$j = Swap $j $o2 $n2

$o3 = @'
          $('ppLiq').textContent = 'Liq. --';
          $('ppLiq').style.color = '';
          drawLiq(null);
          return;
'@
$n3 = @'
          $('ppLiq').textContent = 'Liq. --';
          $('ppLiq').style.color = '';
          return;
'@
$j = Swap $j $o3 $n3

$j = Swap $j "        drawLiq(openCount ? q.liq : null);`r`n" ''

$o5 = @'
        renderRows(o.j.positions || []); openCount = (o.j.positions || []).length; quote();
'@
$n5 = @'
        renderRows(o.j.positions || []); openCount = (o.j.positions || []).length; setLiq(o.j.positions); quote();
'@
$j = Swap $j $o5 $n5

$o6 = @'
    all = [];
    if (chart) { line.setData([]); candles.setData([]); }
    loadHistory();
    quote();
'@
$n6 = @'
    all = [];
    openLiq = null;
    if (chart) { line.setData([]); candles.setData([]); paintLiq(); }
    loadHistory();
    quote();
'@
$j = Swap $j $o6 $n6

if (([regex]::Matches($g, 'perps\.js\?v=39')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=39', 'perps.js?v=40')

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js
npm run typecheck