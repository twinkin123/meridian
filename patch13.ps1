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
$n1 = @'
  /* A price line is positioned by the library itself, so there is no
     coordinate to compute and no timing to get wrong. */
  function paintLiq() {
    if (liqLine && liqOwner) {
      try { liqOwner.removePriceLine(liqLine); } catch (_) {}
      liqLine = null;
    }
    var target = mode === 'candles' ? candles : line;
    if (!openLiq || !target) return;
    liqOwner = target;
    liqLine = target.createPriceLine({
      price: openLiq,
      color: '#f0476a',
      lineWidth: 2,
      lineStyle: LightweightCharts.LineStyle.Solid,
      axisLabelVisible: true,
      title: 'Liq',
    });
  }
'@
$j = Swap $j $o1 $n1

$j = Swap $j "  var liqSeries = null, openLiq = null, liqBar = null;" "  var liqSeries = null, openLiq = null, liqLine = null, liqOwner = null;"
$j = Swap $j "    window.addEventListener('resize', placeBar);" "    window.addEventListener('resize', paintLiq);"

Add-Content -Path $skin -Value "`nhtml body .main .pp-line #ppChart{right:0!important}"

if (([regex]::Matches($g, 'perps\.js\?v=43')).Count -ne 1) { throw 'version not found' }
$g = $g.Replace('perps.js?v=43', 'perps.js?v=44')

[System.IO.File]::WriteAllText($js, $j, (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
node --check public/perps.js