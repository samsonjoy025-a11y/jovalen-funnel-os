<#
  render-assets.ps1 - rasterise the brand SVGs to PNG with headless Chrome.

  WHY THIS EXISTS
  The brand ships as SVG, but PNGs are needed for places SVG cannot go
  (favicon.ico sources, email, Slack unfurls, app stores, LinkedIn). Those
  PNGs used to be produced by hand, which is how they ended up still carrying
  the retired palette after a rebrand - nothing regenerated them.

  Regenerate everything with:  pwsh -File render-assets.ps1

  WHY CHROME AND NOT System.Drawing
  GDI+ has no SVG renderer. The mark's geometry (rounded rects, a circle) is
  trivial to fake with GDI+ calls, but a faked render can drift from the SVG
  and then you are shipping a logo that is not the logo. Chrome rasterises the
  actual file, so the PNG is provably the SVG.

  WHY THE HTML WRAPPER INSTEAD OF SCREENSHOTTING THE .svg DIRECTLY
  1. currentColor. The mono assets inherit fill from their parent. An <img>
     gives them no colour at all, so they render black or blank. Inlining the
     SVG markup inside a coloured wrapper is the only way currentColor resolves.
  2. Size control. The SVGs carry width/height in user units (24, 32, 120).
     The wrapper decouples the render size from the file's intrinsic size.

  Usage:
    pwsh -File render-assets.ps1
#>

[CmdletBinding()]
param([switch]$KeepTemp)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Chrome not found - cannot rasterise SVG" }

Add-Type -AssemblyName System.Drawing

# Render into a window TALLER than the artwork, then crop the slack off.
#
# This is not cosmetic. When the window height exactly equals the artwork
# height, Chrome's headless screenshot returns a stale first paint frame and
# silently drops most of the drawing: a 5:1 horizontal lockup rendered as its
# first bar only (1616 opaque px, maxY 21 of 120). The same SVG in a 600x400
# window painted completely (3791 px, maxY 119). The crop below makes the
# output exactly WxH regardless, so the slack costs nothing.
$SLACK = 240

# svg path (relative to brand/) -> output png, pixel size
$Jobs = @(
  @{ Svg='logo\jovalen-mark.svg';              Png='logo\jovalen-mark-512.png';              W=512;  H=512;  Color=$null }
  @{ Svg='logo\jovalen-mark.svg';              Png='logo\jovalen-mark-1024.png';             W=1024; H=1024; Color=$null }
  @{ Svg='logo\jovalen-mark-mono.svg';         Png='logo\jovalen-mark-mono-512.png';         W=512;  H=512;  Color='#0f172a' }
  @{ Svg='logo\jovalen-lockup-horizontal.svg'; Png='logo\jovalen-lockup-horizontal.png';     W=600;  H=120;  Color=$null }
  @{ Svg='favicon\favicon.svg';                Png='favicon\favicon-16.png';                 W=16;   H=16;   Color=$null }
  @{ Svg='favicon\favicon.svg';                Png='favicon\favicon-32.png';                 W=32;   H=32;   Color=$null }
  @{ Svg='favicon\favicon.svg';                Png='favicon\favicon-48.png';                 W=48;   H=48;   Color=$null }
  @{ Svg='favicon\favicon.svg';                Png='favicon\favicon-64.png';                 W=64;   H=64;   Color=$null }
  @{ Svg='favicon\favicon.svg';                Png='favicon\favicon-180.png';                W=180;  H=180;  Color=$null }
)

$temp = Join-Path $env:TEMP "jovalen-render"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null

$fail = 0
$n = 0
foreach ($j in $Jobs) {
  $n++
  $svgPath = Join-Path $here $j.Svg
  $outPath = Join-Path $here $j.Png
  if (-not (Test-Path $svgPath)) { "  MISSING SOURCE $($j.Svg)"; $fail++; continue }

  # Delete the target first. Checking Test-Path afterwards cannot tell "Chrome
  # wrote this" from "the old file was already there" - which is exactly how a
  # whole batch of stale PNGs survived a rebrand once already.
  if (Test-Path $outPath) { Remove-Item $outPath -Force }

  # Inline the SVG source so currentColor can resolve against $j.Color.
  $svg = [System.IO.File]::ReadAllText($svgPath)
  # strip the XML prolog if any; inline SVG in HTML must not have one
  $svg = $svg -replace '<\?xml[^>]*\?>', ''
  $style = if ($j.Color) { "color: $($j.Color);" } else { '' }

  $html = @"
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;}
  body{width:$($j.W)px;height:$($j.H)px;overflow:hidden;$style}
  svg{display:block;width:$($j.W)px;height:$($j.H)px;}
</style></head><body>$svg</body></html>
"@
  $tmpHtml = Join-Path $temp (([System.IO.Path]::GetFileNameWithoutExtension($j.Png)) + '.html')
  [System.IO.File]::WriteAllText($tmpHtml, $html, (New-Object System.Text.UTF8Encoding($false)))

  $shotPath = Join-Path $temp (([System.IO.Path]::GetFileNameWithoutExtension($j.Png)) + '-raw.png')
  $j.WinH = $j.H + $SLACK

  # Three things are load-bearing here, all learned the hard way:
  #
  # 1. Start-Process, not the call operator. Chrome writes "N bytes written to
  #    file" to stderr, and under $ErrorActionPreference='Stop' the call
  #    operator promotes that to a terminating NativeCommandError on success.
  # 2. A single argument *string* with hand-rolled quoting. -ArgumentList @(...)
  #    joins with spaces and does NOT quote, so this repo's "Default Project"
  #    path splits in two and Chrome silently writes nothing.
  # 3. A unique --user-data-dir per run. Without it a second chrome.exe
  #    --headless hands off to the still-shutting-down first instance via the
  #    singleton lock, exits 0, writes no file - so the batch reports success
  #    while leaving every asset stale. That is exactly how 8 PNGs survived the
  #    rebrand once already.
  $Q = '"'                                # manual quoting, see note 2
  $argLine = @(
    '--headless=new --disable-gpu --no-sandbox --hide-scrollbars',
    '--default-background-color=00000000',
    ('--user-data-dir=' + $Q + "$temp\profile-$n" + $Q),
    ('--screenshot=' + $Q + $shotPath + $Q),
    "--window-size=$($j.W),$($j.WinH)",
    # NEVER 0. With no virtual-time budget headless Chrome never reaches a
    # quiescent state and the process hangs indefinitely.
    '--virtual-time-budget=3000',
    ('file:///' + ($tmpHtml -replace '\\','/'))
  ) -join ' '

  Start-Process -FilePath $chrome -ArgumentList $argLine -Wait -NoNewWindow `
                -RedirectStandardOutput "$temp\chrome-$n.out" `
                -RedirectStandardError  "$temp\chrome-$n.err"

  if (-not (Test-Path $shotPath)) { "  FAILED $($j.Png) - chrome wrote no file"; $fail++; continue }

  # ---- crop the slack off ------------------------------------------------
  # Rendered into a window taller than the artwork, then cropped to the exact
  # target. See the note on $SLACK above: with the window height equal to the
  # artwork height, Chrome's headless screenshot captures a stale first frame
  # and silently drops most of the artwork (a 5:1 lockup came out as one bar).
  $raw = New-Object System.Drawing.Bitmap($shotPath)
  $out = New-Object System.Drawing.Bitmap($j.W, $j.H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.CompositingMode  = 'SourceCopy'
  $g.CompositingQuality = 'HighQuality'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($raw, (New-Object System.Drawing.Rectangle(0,0,$j.W,$j.H)), (New-Object System.Drawing.Rectangle(0,0,$j.W,$j.H)), 'Pixel')
  $g.Dispose(); $raw.Dispose()
  $out.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()

  if (-not (Test-Path $outPath)) { "  FAILED $($j.Png)"; $fail++; continue }

  # Verify the render is genuinely complete, not merely non-blank.
  #
  # "not blank" is far too weak: the truncated lockup still had 1616 opaque
  # pixels, so it sailed through an emptiness test while showing one bar in
  # place of a logo. Every asset here has ink at its bottom edge (the mark's
  # terminal dot and the favicon tile both run to the full height), so the ink
  # extent is a real tripwire for a partial paint.
  $bmp = New-Object System.Drawing.Bitmap($outPath)
  $nonEmpty = 0; $maxY = -1; $maxX = -1
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      if ($bmp.GetPixel($x,$y).A -gt 8) {
        $nonEmpty++
        if ($y -gt $maxY) { $maxY = $y }
        if ($x -gt $maxX) { $maxX = $x }
      }
    }
  }
  $dims = "$($bmp.Width)x$($bmp.Height)"
  $bmp.Dispose()

  $status = 'ok  '
  if ($nonEmpty -eq 0) { $status = 'BLANK';     $fail++ }
  elseif ($maxY -lt ($j.H - 2)) { $status = 'TRUNCATED'; $fail++ }

  "  [{0}] {1,-42} {2,9}  ink={3,7}  extent={4}x{5,-5} want {6}x{7}" -f `
      $status, $j.Png, $dims, $nonEmpty, ($maxX+1), ($maxY+1), $j.W, $j.H
}

if (-not $KeepTemp) { Remove-Item $temp -Recurse -Force }
""
if ($fail) { "$fail job(s) failed or rendered blank"; exit 1 }
"rendered $($Jobs.Count) PNGs from SVG"
exit 0
