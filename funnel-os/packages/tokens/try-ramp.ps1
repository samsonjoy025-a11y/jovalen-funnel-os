<#
  try-ramp.ps1 — evaluate a candidate color ramp against the full contrast
  contract WITHOUT touching the source files.

  WHY
  Re-picking a ramp means answering "does this still pass WCAG AA in both
  themes?" 33 times. Editing primitive.json and re-running the gate is the
  slow loop. This runs several candidates in one pass and prints a comparison,
  so a ramp is chosen on numbers rather than on taste alone.

  It reuses the exact contract and the exact maths from check-contrast.ps1;
  if you change one, change both.

  USAGE
    pwsh -File try-ramp.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'src'

# ---------------------------------------------------------------- candidates
# Each is a 11-step ramp, 50 -> 950, 50 being the palest tint.
# Goal: brighter AND warmer than the incumbent indigo (#4f46e5, hue 243 deg),
# landing in electric violet / magenta (hue ~265-295 deg).
$Candidates = @(
  [pscustomobject]@{
    Name  = 'incumbent (indigo, for reference)'
    Steps = @{ 50='#eef2ff';100='#e0e7ff';200='#c7d2fe';300='#a5b4fc';400='#818cf8';500='#6366f1';600='#4f46e5';700='#4338ca';800='#3730a3';900='#312e81';950='#1e1b4b' }
    Tint  = 'rgb(99 102 241 / 0.16)'
  }
  [pscustomobject]@{
    Name  = 'A: violet -> fuchsia shift (purple 500, fuchsia 600+)'
    Steps = @{ 50='#faf5ff';100='#f3e8ff';200='#e9d5ff';300='#d8b4fe';400='#c084fc';500='#a855f7';600='#c026d3';700='#a21caf';800='#86198f';900='#701a75';950='#4a044e' }
    Tint  = 'rgb(168 85 247 / 0.16)'
  }
  [pscustomobject]@{
    Name  = 'B: pure fuchsia (hottest)'
    Steps = @{ 50='#fdf4ff';100='#fae8ff';200='#f5d0fe';300='#f0abfc';400='#e879f9';500='#d946ef';600='#c026d3';700='#a21caf';800='#86198f';900='#701a75';950='#4a044e' }
    Tint  = 'rgb(217 70 239 / 0.16)'
  }
  [pscustomobject]@{
    Name  = 'C: electric violet, magenta only at the deep end'
    Steps = @{ 50='#faf5ff';100='#f3e8ff';200='#e9d5ff';300='#d8b4fe';400='#c084fc';500='#a855f7';600='#9333ea';700='#7e22ce';800='#6b21a8';900='#581c87';950='#3b0764' }
    Tint  = 'rgb(168 85 247 / 0.16)'
  }
  # A had the right hue but only 4.50:1 for a link on the light canvas - no margin.
  # D/E keep the magenta 600 and trade a little lightness for real headroom.
  [pscustomobject]@{
    Name  = 'D: violet 500 + deeper magenta 600 (margin fix)'
    Steps = @{ 50='#faf5ff';100='#f3e8ff';200='#e9d5ff';300='#d8b4fe';400='#c084fc';500='#a855f7';600='#b026d3';700='#9310a8';800='#7a0f8c';900='#651073';950='#43075a' }
    Tint  = 'rgb(168 85 247 / 0.16)'
  }
  [pscustomobject]@{
    Name  = 'E: violet 500 + deeper magenta 600 (more margin)'
    Steps = @{ 50='#faf5ff';100='#f3e8ff';200='#e9d5ff';300='#d8b4fe';400='#c084fc';500='#a855f7';600='#a825c9';700='#8e1ba8';800='#75178c';900='#611271';950='#400a56' }
    Tint  = 'rgb(168 85 247 / 0.16)'
  }
  [pscustomobject]@{
    Name  = 'F: D but with 500 pushed hotter (fuchsia-500)'
    Steps = @{ 50='#fdf4ff';100='#fae8ff';200='#f5d0fe';300='#e879f9';400='#d946ef';500='#c026d3';600='#a825c9';700='#8e1ba8';800='#75178c';900='#611271';950='#400a56' }
    Tint  = 'rgb(217 70 239 / 0.16)'
  }
)

# ------------------------------------------------------------------ machinery
function Flatten($node, [string]$prefix, [hashtable]$out) {
  if ($null -eq $node) { return }
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Name -eq '$value') { if ($prefix) { $out[$prefix] = $p.Value }; return }
  }
  foreach ($p in $node.PSObject.Properties) {
    if ($p.Name.StartsWith('$')) { continue }
    $key = if ($prefix) { "$prefix.$($p.Name)" } else { $p.Name }
    if ($p.Value -is [string] -or $p.Value -is [ValueType]) { $out[$key] = $p.Value }
    else { Flatten $p.Value $key $out }
  }
}

function ParseColour([string]$v) {
  if (-not $v) { return $null }
  $v = $v.Trim()
  if ($v -match '^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$') {
    $a = 1.0
    if ($matches[4]) { $a = [double]$matches[4] }
    if ($a -gt 1) { $a = $a / 255 }
    return [pscustomobject]@{ R=[int]$matches[1]; G=[int]$matches[2]; B=[int]$matches[3]; A=$a }
  }
  if ($v -match '^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$') {
    $h = $matches[1]
    if ($h.Length -eq 3) { $h = "$($h[0])$($h[0])$($h[1])$($h[1])$($h[2])$($h[2])" }
    if ($h.Length -eq 6) { $h += 'ff' }
    return [pscustomobject]@{
      R = [Convert]::ToInt32($h.Substring(0,2),16)
      G = [Convert]::ToInt32($h.Substring(2,2),16)
      B = [Convert]::ToInt32($h.Substring(4,2),16)
      A = [Convert]::ToInt32($h.Substring(6,2),16) / 255.0
    }
  }
  return $null
}
function Composite($c, $bg) {
  if ($c.A -ge 0.999) { return $c }
  [pscustomobject]@{
    R = [math]::Round($c.R * $c.A + $bg.R * (1 - $c.A))
    G = [math]::Round($c.G * $c.A + $bg.G * (1 - $c.A))
    B = [math]::Round($c.B * $c.A + $bg.B * (1 - $c.A))
    A = 1.0
  }
}
function Lum($c) {
  $f = { param($v) $v = $v / 255.0
         if ($v -le 0.03928) { $v / 12.92 } else { [math]::Pow(($v + 0.055) / 1.055, 2.4) } }
  0.2126 * (& $f $c.R) + 0.7152 * (& $f $c.G) + 0.0722 * (& $f $c.B)
}
function Contrast($a, $b) {
  $l1 = Lum $a; $l2 = Lum $b
  if ($l1 -lt $l2) { $t = $l1; $l1 = $l2; $l2 = $t }
  [math]::Round(($l1 + 0.05) / ($l2 + 0.05), 2)
}
# hue in degrees, for the "is it actually warmer?" check
function Hue($c) {
  $r = $c.R/255.0; $g = $c.G/255.0; $b = $c.B/255.0
  $mx = [math]::Max($r,[math]::Max($g,$b)); $mn = [math]::Min($r,[math]::Min($g,$b)); $d = $mx - $mn
  if ($d -eq 0) { return 0 }
  if ($mx -eq $r) { $h = 60 * ((($g - $b) / $d) % 6) }
  elseif ($mx -eq $g) { $h = 60 * ((($b - $r) / $d) + 2) }
  else { $h = 60 * ((($r - $g) / $d) + 4) }
  if ($h -lt 0) { $h += 360 }
  [math]::Round($h)
}

# The contract, mirrored from check-contrast.ps1. Only the pairs that can
# possibly move when the primary ramp changes.
$Pairs = @(
  [pscustomobject]@{ Fg='content.on-solid';       Bg='status.primary.solid'; Need=4.5; Label='on-solid on primary solid' }
  [pscustomobject]@{ Fg='content.link';            Bg='surface.raised';       Need=4.5; Label='link on card' }
  [pscustomobject]@{ Fg='content.link';            Bg='surface.canvas';       Need=4.5; Label='link on canvas' }
  [pscustomobject]@{ Fg='status.primary.fg';       Bg='status.primary.bg';    Need=4.5; Label='primary badge' }
  [pscustomobject]@{ Fg='claim.analysis-fg';       Bg='claim.analysis-bg';    Need=4.5; Label='claim analysis' }
  [pscustomobject]@{ Fg='border.focus';            Bg='surface.raised';       Need=3.0; Label='focus ring vs card' }
  [pscustomobject]@{ Fg='interactive.focus-ring';  Bg='surface.canvas';       Need=3.0; Label='focus ring vs canvas' }
  [pscustomobject]@{ Fg='border.focus';            Bg='surface.canvas';       Need=3.0; Label='focus ring (canvas theme)' }
)

$prim = @{}; Flatten (Get-Content (Join-Path $src 'primitive.json') -Raw | ConvertFrom-Json) '' $prim
$sem  = Get-Content (Join-Path $src 'semantic.json') -Raw | ConvertFrom-Json
$light = @{}; Flatten $sem.light '' $light
$dark  = @{}; Flatten $sem.dark  '' $dark
$extra = @{}
foreach ($f in 'chart.json','component.json') {
  $p = Join-Path $src $f
  if (Test-Path $p) { Flatten (Get-Content $p -Raw | ConvertFrom-Json) '' $extra }
}
function ThemeMap([hashtable]$over) {
  $m = @{}
  foreach ($k in $light.Keys) { $m[$k] = $light[$k] }
  foreach ($k in $over.Keys)  { $m[$k] = $over[$k] }
  foreach ($k in $extra.Keys) { $m[$k] = $extra[$k] }
  return $m
}
function Resolve([string]$val, [hashtable]$theme, [hashtable]$P) {
  if (-not $val) { return $null }
  $v = $val
  for ($i = 0; $i -lt 12; $i++) {
    if ($v -notmatch '\{([^}]+)\}') { break }
    $ref = $matches[1]
    $next = $theme[$ref]
    if ($null -eq $next) { $next = $P[$ref] }
    if ($null -eq $next) { return $null }
    $v = $next
  }
  return $v
}

# ------------------------------------------------------------------- evaluate
$base600 = ParseColour $prim['color.primary.600']
$baseHue = Hue $base600
"incumbent primary-600 = $($prim['color.primary.600'])  hue $($baseHue) deg  luminance $([math]::Round((Lum $base600),4))"
""

foreach ($cand in $Candidates) {
  # clone primitives and swap the ramp + the hard-coded dark badge tint
  $P = @{}; foreach ($k in $prim.Keys) { $P[$k] = $prim[$k] }
  foreach ($k in $cand.Steps.Keys) { $P["color.primary.$k"] = $cand.Steps[$k] }
  $P['color.primary.500'] = $cand.Steps[500]
  $darkA = $cand.Tint -replace '0\.16', '0.16'
  $L2 = @{}; foreach ($k in $light.Keys) { $L2[$k] = $light[$k] }
  $D2 = @{}; foreach ($k in $dark.Keys)  { $D2[$k]  = $dark[$k]  }
  $D2['status.primary.bg']         = $cand.Tint
  $D2['status.primary.bg-strong']  = ($cand.Tint -replace '0\.16','0.28')
  $D2['claim.analysis-bg']         = $cand.Tint
  $LT = ThemeMap @{}
  $DT = ThemeMap $D2

  $c600 = ParseColour $cand.Steps[600]
  $c500 = ParseColour $cand.Steps[500]
  $c300 = ParseColour $cand.Steps[300]
  $c700 = ParseColour $cand.Steps[700]
  $hueShift = (Hue $c600) - $baseHue
  if ($hueShift -lt -180) { $hueShift += 360 }
  if ($hueShift -gt  180) { $hueShift -= 360 }

  "=== $($cand.Name) ==="
  "  600 $($cand.Steps[600])  hue $(Hue $c600) ($([string]$hueShift)$(if($hueShift -ge 0){' deg warmer'}else{' deg cooler'}))  lum $([math]::Round((Lum $c600),4))"
  "  500 $($cand.Steps[500])  hue $(Hue $c500)  lum $([math]::Round((Lum $c500),4))"
  $dLum = (Lum $c600) - (Lum $base600)
  "  vs incumbent 600: luminance $(if($dLum -ge 0){'+'}else{''})$([math]::Round($dLum,4)) -> $(if($dLum -gt 0){'BRIGHTER'}else{'darker'})"

  $fails = 0
  foreach ($themeName in 'light','dark') {
    $theme = if ($themeName -eq 'light') { $LT } else { $DT }
    $raised = ParseColour (Resolve $theme['surface.raised'] $theme $P)
    $canvas = ParseColour (Resolve $theme['surface.canvas'] $theme $P)
    foreach ($pair in $Pairs) {
      $fg = ParseColour (Resolve $theme[$pair.Fg] $theme $P)
      $bg = ParseColour (Resolve $theme[$pair.Bg] $theme $P)
      if ($null -eq $fg -or $null -eq $bg) { "  [$themeName] UNRESOLVED $($pair.Label)"; $fails++; continue }
      $bgo = if ($pair.Bg -eq 'surface.canvas') { $canvas } else { $raised }
      $bgf = Composite $bg $bgo
      $r = Contrast (Composite $fg $bgf) $bgf
      $ok = $r -ge $pair.Need
      if (-not $ok) { $fails++ }
      "  [{0}] {1,-4} {2,6} : 1  (needs {3})  {4}" -f $(if($ok){'ok  '}else{'FAIL'}), $themeName, $r, $pair.Need, $pair.Label
    }
  }
  "  -> $(if($fails -eq 0){'ALL PASS'}else{"$fails FAILING"})"
  ""
}
