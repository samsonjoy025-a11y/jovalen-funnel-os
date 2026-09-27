<#
  render-preview.ps1 - screenshot the brand preview into PNGs.

  WHY PNGs AND NOT HTML
  On this machine .html is associated with a retired Internet Explorer, so the
  preview page cannot be opened by double-clicking. PNGs are the only way the
  user can actually look at the result. Every PNG this script writes is
  therefore not a convenience - it is the deliverable.

  INPUT
    ../jovalen-brand-preview.html  (the self-contained build; run
    build-preview.ps1 first so it is not stale)

  OUTPUT
    preview-render-1.png   light theme
    preview-render-2.png   dark theme
    logo-contact-sheet.png all brand assets side by side, with hexes

  THE TWO CHROME TRAPS, both of which produce a plausible-looking wrong image
  rather than an error, so both are defended explicitly:

  1. A unique --user-data-dir per run. Otherwise a second chrome.exe --headless
     hands off to the still-shutting-down first instance via the singleton lock,
     exits 0, and writes nothing.
  2. Render into a window TALLER than the content, then crop. When the window
     height matches the content height exactly, the screenshot can capture a
     stale first paint frame and silently drop most of the page.
#>

[CmdletBinding()]
param([switch]$KeepTemp)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$root   = Split-Path -Parent $here
$src    = Join-Path $root 'jovalen-brand-preview.html'

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome not found - cannot render previews" }
if (-not (Test-Path $src)) { throw "$src not found - run build-preview.ps1 first" }

$temp = Join-Path $env:TEMP "jovalen-preview"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null

$W = 1280
$MAXH = 8000          # generous; the crop below trims to actual content
$fail = 0

function Invoke-Chrome([string]$html, [string]$outPng, [int]$winH, [string]$tag) {
  $f = Join-Path $temp "$tag.html"
  [System.IO.File]::WriteAllText($f, $html, (New-Object System.Text.UTF8Encoding($false)))
  if (Test-Path $outPng) { Remove-Item $outPng -Force }
  $Q = '"'
  $a = @(
    '--headless=new --disable-gpu --no-sandbox --hide-scrollbars',
    '--default-background-color=00000000',
    ('--user-data-dir=' + $Q + "$temp\prof-$tag" + $Q),
    ('--screenshot=' + $Q + $outPng + $Q),
    "--window-size=$W,$winH",
    '--virtual-time-budget=5000',          # never 0: headless never settles
    ('file:///' + ($f -replace '\\','/'))
  ) -join ' '
  Start-Process -FilePath $chrome -ArgumentList $a -Wait -NoNewWindow `
                -RedirectStandardOutput "$temp\$tag.out" -RedirectStandardError "$temp\$tag.err"
  return (Test-Path $outPng)
}

# Measure the real content height: the last row that differs from the page
# background. The background is sampled from the bottom centre, which is always
# empty padding. Do NOT look for "dark pixels" - in light mode a blank white
# region is all-light and the naive test reports the wrong height.
function Get-ContentHeight([string]$png) {
  $bmp = New-Object System.Drawing.Bitmap($png)
  $h = $bmp.Height; $w = $bmp.Width
  $bg = $bmp.GetPixel([int]($w/2), $h-3)
  $last = 0
  for ($y = 0; $y -lt $h; $y++) {
    $hit = $false
    for ($x = 0; $x -lt $w; $x += 3) {
      $p = $bmp.GetPixel($x,$y)
      if ([math]::Abs($p.R-$bg.R) + [math]::Abs($p.G-$bg.G) + [math]::Abs($p.B-$bg.B) -gt 12) { $hit = $true; break }
    }
    if ($hit) { $last = $y }
  }
  $bmp.Dispose()
  return ($last + 1)
}

function Save-Cropped([string]$rawPng, [string]$outPng, [int]$height) {
  $src = New-Object System.Drawing.Bitmap($rawPng)
  $out = New-Object System.Drawing.Bitmap($W, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0,0,$W,$height)),
                     (New-Object System.Drawing.Rectangle(0,0,$W,$height)), 'Pixel')
  $g.Dispose(); $src.Dispose()
  $out.Save($outPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}

# ---- the two theme renders -------------------------------------------------
$html = [System.IO.File]::ReadAllText($src)
$targets = @(
  @{ Theme='light'; Out=(Join-Path $here 'preview-render-1.png') }
  @{ Theme='dark';  Out=(Join-Path $here 'preview-render-2.png') }
)
foreach ($t in $targets) {
  # inject the theme onto <html>; the inlined tokens.css keys off this attribute
  $page = [regex]::Replace($html, '<html(?![^>]*data-theme)', "<html data-theme='$($t.Theme)'")
  $raw  = Join-Path $temp "$($t.Theme)-raw.png"
  if (-not (Invoke-Chrome $page $raw $MAXH $t.Theme)) { "  FAILED $($t.Theme) render"; $fail++; continue }
  $ch = Get-ContentHeight $raw
  if ($ch -lt 200) { "  FAILED $($t.Theme): content height only ${ch}px - likely a blank render"; $fail++; continue }
  Save-Cropped $raw $t.Out $ch
  $sz = (Get-Item $t.Out).Length
  "  [ok  ] {0,-24} {1,5} x {2,-5} {3,8:N0} bytes  theme={4}" -f `
      (Split-Path $t.Out -Leaf), $W, $ch, $sz, $t.Theme
}

# ---- contact sheet ---------------------------------------------------------
# Built as HTML and screenshotted, so it uses the real assets and the real
# tokens rather than a hand-faked GDI+ redraw that could drift from them.
$assets = @(
  @{ File='logo\jovalen-mark.svg';              Cap='Mark';                W=120; H=120 }
  @{ File='logo\jovalen-mark-mono.svg';         Cap='Mark (mono)';        W=120; H=120 }
  @{ File='logo\jovalen-lockup-horizontal.svg'; Cap='Lockup horizontal';  W=300; H=60 }
  @{ File='logo\jovalen-lockup-stacked.svg';    Cap='Lockup stacked';     W=200; H=130 }
  @{ File='favicon\favicon.svg';                Cap='Favicon 32';          W=64;  H=64 }
  @{ File='favicon\favicon-mono.svg';           Cap='Favicon (mono) 32';  W=64;  H=64 }
)
$cell = ''
foreach ($a in $assets) {
  $p = Join-Path $here $a.File
  if (-not (Test-Path $p)) { "  MISSING $($a.File)"; $fail++; continue }
  $svg = [System.IO.File]::ReadAllText($p) -replace '<\?xml[^>]*\?>',''
  # mono assets inherit currentColor; give them the navy they are meant to carry
  $colour = if ($a.File -like '*mono*') { 'color:#0f172a;' } else { '' }
  $cell += @"
    <figure>
      <div class="box"><span style="$($colour)">$svg</span></div>
      <figcaption>$($a.Cap)</figcaption>
      <div class="hex">$([System.IO.Path]::GetFileName($a.File))</div>
    </figure>
"@
}
$sheet = @"
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#f8fafc;font-family:'Segoe UI',system-ui,sans-serif;color:#0f172a}
  .wrap{padding:28px 32px 32px}
  h1{font-size:20px;margin:0 0 4px;letter-spacing:-.01em}
  .sub{font-size:12px;color:#64748b;margin:0 0 22px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  figure{margin:0;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px}
  .box{height:132px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
  .box span{display:block;line-height:0}
  .box svg{max-width:100%;max-height:132px;height:auto;width:auto}
  figcaption{font-size:13px;font-weight:600}
  .hex{font-size:11px;color:#64748b;margin-top:3px;font-family:Consolas,monospace}
</style></head><body><div class="wrap">
  <h1>Jovalen — asset contact sheet</h1>
  <p class="sub">Funnel body #b026d3 (primary-600) · result dot #a855f7 (primary-500) · wordmark #0f172a (neutral-900)</p>
  <div class="grid">$cell</div>
</div></body></html>
"@
$sheetPath = Join-Path $temp 'sheet.html'
[System.IO.File]::WriteAllText($sheetPath, $sheet, (New-Object System.Text.UTF8Encoding($false)))
$sheetPng = Join-Path $here 'logo-contact-sheet.png'
if (-not (Invoke-Chrome $sheet $sheetPng 900 'sheet')) { "  FAILED contact sheet"; $fail++ }
else {
  $b = New-Object System.Drawing.Bitmap($sheetPng)
  "  [ok  ] {0,-24} {1,5} x {2,-5} {3,8:N0} bytes" -f 'logo-contact-sheet.png', $b.Width, $b.Height, (Get-Item $sheetPng).Length
  $b.Dispose()
}

if (-not $KeepTemp) { Remove-Item $temp -Recurse -Force }
""
if ($fail) { "$fail render(s) failed"; exit 1 }
"previews and contact sheet rendered from source"
exit 0
