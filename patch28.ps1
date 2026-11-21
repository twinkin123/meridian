$ErrorActionPreference = 'Stop'
[Environment]::CurrentDirectory = $PWD

$b = Join-Path $PWD 'public/bottom-nav.css'
$h = Join-Path $PWD 'public/app.html'
$c = [System.IO.File]::ReadAllText($b)
$g = [System.IO.File]::ReadAllText($h)
if (-not $c -or -not $g) { throw 'empty read' }

if ($c.Contains('clear the browser toolbar')) {
  Write-Host 'clearance already present'
} else {
  $add = @()
  $add += ''
  $add += '/* bottom bar: reserve room for the browser''s own toolbar */'
  $add += '@media (max-width:980px){'
  $add += 'body{padding-bottom:calc(96px + env(safe-area-inset-bottom))!important}'
  $add += 'html body .side{padding-bottom:calc(16px + env(safe-area-inset-bottom))!important}'
  $add += 'html body .side a{padding-bottom:calc(10px + env(safe-area-inset-bottom))!important}'
  $add += '}'
  $c = $c.TrimEnd() + "`n" + ($add -join "`n") + "`n"
  [System.IO.File]::WriteAllText($b, $c, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'clearance added'
}

if (([regex]::Matches($g, 'bottom-nav\.css\?v=\d+')).Count -ne 1) { throw 'version not found' }
$g = [regex]::Replace($g, 'bottom-nav\.css\?v=(\d+)', { param($m) 'bottom-nav.css?v=' + ([int]$m.Groups[1].Value + 1) })
[System.IO.File]::WriteAllText($h, $g, (New-Object System.Text.UTF8Encoding($false)))

git --no-pager diff --stat
