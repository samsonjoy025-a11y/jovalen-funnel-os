<#
  check-contrast.ps1 — PowerShell port of the WCAG gate in build.mjs

  WHY THIS EXISTS
  This machine has no Node runtime, so `node build.mjs --contrast`
  can never run here. Without this script the CONTRAST_PAIRS contract in
  build.mjs is unenforced on this machine, which means a colour change
  can silently break WCAG 2.2 AA and nothing will notice.

  It reads the SAME source of truth (src/*.json), applies the SAME
  contract (CONTRAST_PAIRS, mirrored below), and resolves the same
  light/dark override semantics: dark is a sparse layer over light.

  USAGE
    pwsh -File check-contrast.ps1                # gate, exit 1 on failure
    pwsh -File check-contrast.ps1 -Report        # full table, always exit 0

  KEEP IN SYNC
  Any pair added to CONTRAST_PAIRS in build.mjs must be added to $Pairs
  here. build.mjs remains canonical; this is the enforcement shim.
#>

[CmdletBinding()]
param([switch]$Report)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $here 'src'

# ---- contract, mirrored from build.mjs ---------------------------------
# NOTE: these are objects, not nested arrays. Newline-separated nested
# arrays get unrolled by the PowerShell pipeline into one flat list, which
# silently destroys the grouping. Objects are not enumerable, so they are safe.
$Pairs = @(
  [pscustomobject]@{ Fg='content.primary';           Bg='surface.raised';           Need=4.5; Label='Body text on a card' }
  [pscustomobject]@{ Fg='content.primary';           Bg='surface.canvas';           Need=4.5; Label='Body text on the app canvas' }
  [pscustomobject]@{ Fg='content.secondary';         Bg='surface.raised';           Need=4.5; Label='Secondary text on a card' }
  [pscustomobject]@{ Fg='content.secondary';         Bg='surface.canvas';           Need=4.5; Label='Secondary text on the canvas' }
  [pscustomobject]@{ Fg='content.tertiary';          Bg='surface.raised';           Need=4.5; Label='Tertiary text / axis labels' }
  [pscustomobject]@{ Fg='content.tertiary';          Bg='surface.canvas';           Need=4.5; Label='Tertiary text on the canvas' }
  [pscustomobject]@{ Fg='content.link';              Bg='surface.raised';           Need=4.5; Label='Links on a card' }
  [pscustomobject]@{ Fg='content.link';              Bg='surface.canvas';           Need=4.5; Label='Links on the canvas' }
  [pscustomobject]@{ Fg='content.inverse';           Bg='surface.inverse';          Need=4.5; Label='Text on an inverse surface' }
  [pscustomobject]@{ Fg='status.neutral.fg';         Bg='status.neutral.bg';        Need=4.5; Label='Neutral badge' }
  [pscustomobject]@{ Fg='status.primary.fg';         Bg='status.primary.bg';        Need=4.5; Label='Primary badge' }
  [pscustomobject]@{ Fg='status.success.fg';         Bg='status.success.bg';        Need=4.5; Label='Success badge' }
  [pscustomobject]@{ Fg='status.warning.fg';         Bg='status.warning.bg';        Need=4.5; Label='Warning badge' }
  [pscustomobject]@{ Fg='status.danger.fg';          Bg='status.danger.bg';         Need=4.5; Label='Danger badge' }
  [pscustomobject]@{ Fg='status.info.fg';            Bg='status.info.bg';           Need=4.5; Label='Info badge' }
  [pscustomobject]@{ Fg='status.ai.fg';              Bg='status.ai.bg';             Need=4.5; Label='AI badge' }
  [pscustomobject]@{ Fg='claim.fact-fg';             Bg='claim.fact-bg';            Need=4.5; Label='Claim A - fact' }
  [pscustomobject]@{ Fg='claim.analysis-fg';         Bg='claim.analysis-bg';        Need=4.5; Label='Claim A - analysis' }
  [pscustomobject]@{ Fg='claim.hypothesis-fg';       Bg='claim.hypothesis-bg';      Need=4.5; Label='Claim A - hypothesis' }
  [pscustomobject]@{ Fg='claim.recommendation-fg';   Bg='claim.recommendation-bg';  Need=4.5; Label='Claim A - recommendation' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.primary.solid';     Need=4.5; Label='Primary solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.danger.solid';      Need=4.5; Label='Danger solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.success.solid';     Need=4.5; Label='Success solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.warning.solid';     Need=4.5; Label='Warning solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.info.solid';        Need=4.5; Label='Info solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.neutral.solid';     Need=4.5; Label='Neutral solid button label' }
  [pscustomobject]@{ Fg='content.on-solid';          Bg='status.ai.solid';          Need=4.5; Label='AI solid button label' }
  [pscustomobject]@{ Fg='delta.positive';            Bg='surface.raised';           Need=4.5; Label='Positive delta text' }
  [pscustomobject]@{ Fg='delta.negative';            Bg='surface.raised';           Need=4.5; Label='Negative delta text' }
  [pscustomobject]@{ Fg='axis.label';                Bg='surface.raised';           Need=4.5; Label='Chart axis labels' }
  [pscustomobject]@{ Fg='border.strong';             Bg='surface.raised';           Need=3.0; Label='Strong border vs surface' }
  [pscustomobject]@{ Fg='border.focus';              Bg='surface.raised';           Need=3.0; Label='Focus ring vs surface' }
  [pscustomobject]@{ Fg='interactive.focus-ring';    Bg='surface.canvas';           Need=3.0; Label='Focus ring vs canvas' }
)

# ---- DTCG flatten -------------------------------------------------------
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

$prim = @{}; Flatten (Get-Content (Join-Path $src 'primitive.json') -Raw | ConvertFrom-Json) '' $prim
$sem  = (Get-Content (Join-Path $src 'semantic.json') -Raw | ConvertFrom-Json)
$light = @{}; Flatten $sem.light '' $light
$dark  = @{}; Flatten $sem.dark  '' $dark

# chart.json / component.json are NOT theme-split: they declare each token
# once and reference theme-dependent semantic tokens. They must be merged
# into BOTH themes or their tokens resolve to nothing.
# (delta.* and axis.* live in chart.json - not semantic.json.)
$extra = @{}
foreach ($f in 'chart.json','component.json') {
  $p = Join-Path $src $f
  if (Test-Path $p) { Flatten (Get-Content $p -Raw | ConvertFrom-Json) '' $extra }
}

# ---- resolve {token} chains against a theme ----------------------------
function Resolve([string]$val, [hashtable]$theme) {
  if (-not $val) { return $null }
  $v = $val
  for ($i = 0; $i -lt 12; $i++) {
    if ($v -notmatch '\{([^}]+)\}') { break }
    $ref = $matches[1]
    $next = $theme[$ref]
    if ($null -eq $next) { $next = $prim[$ref] }
    if ($null -eq $next) { return $null }
    $v = $next
  }
  return $v
}

function ThemeMap([hashtable]$over) {
  $m = @{}
  foreach ($k in $light.Keys)  { $m[$k] = $light[$k] }
  foreach ($k in $over.Keys)   { $m[$k] = $over[$k] }   # dark is sparse over light
  foreach ($k in $extra.Keys)  { $m[$k] = $extra[$k] }   # theme-agnostic layers
  return $m
}
$lightTheme = ThemeMap @{}
$darkTheme  = ThemeMap $dark

# ---- colour maths (WCAG 2.x) ------------------------------------------
# Tokens use BOTH hex (#rrggbb / #rrggbbaa) and functional notation
# (rgb(239 68 68 / 0.16)). Both appear in the sources, so a hex-only
# parser silently reports every tint token as unresolved.
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
# alpha tints must be composited over a surface before measuring
function Flatten_($c, $bg) {
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

# ---- run ---------------------------------------------------------------
$results = @()
foreach ($themeName in 'light','dark') {
  $theme = if ($themeName -eq 'light') { $lightTheme } else { $darkTheme }
  $raised = ParseColour (Resolve $theme['surface.raised'] $theme)
  $canvas = ParseColour (Resolve $theme['surface.canvas'] $theme)
  foreach ($p in $Pairs) {
    $fgRaw = ParseColour (Resolve $theme[$p.Fg] $theme)
    $bgRaw = ParseColour (Resolve $theme[$p.Bg] $theme)
    if ($null -eq $fgRaw -or $null -eq $bgRaw) {
      $results += [pscustomobject]@{ Theme=$themeName; Label=$p.Label; Ratio=$null; Need=$p.Need; Status='UNRESOLVED' }
      continue
    }
    $bg = Flatten_ $bgRaw $(if ($p.Bg -like 'surface*') { if ($p.Bg -eq 'surface.canvas') { $canvas } else { $raised } } else { $raised })
    $fg = Flatten_ $fgRaw $bg
    $r  = Contrast $fg $bg
    $results += [pscustomobject]@{
      Theme=$themeName; Label=$p.Label; Ratio=$r; Need=$p.Need
      Status = $(if ($r -ge $p.Need) { 'PASS' } else { 'FAIL' })
    }
  }
}

$fails = @($results | Where-Object { $_.Status -ne 'PASS' })
if ($Report -or $true) {
  foreach ($t in 'light','dark') {
    ""
    "=== $t ==="
    $results | Where-Object { $_.Theme -eq $t } | ForEach-Object {
      $mark = switch ($_.Status) { 'PASS' {'ok  '} 'FAIL' {'FAIL'} default {'????'} }
      $ratio = if ($null -eq $_.Ratio) { '  -  ' } else { "{0,6:N2}" -f $_.Ratio }
      "  [{0}] {1,6} : 1  (needs {2})  {3}" -f $mark, $ratio, $_.Need, $_.Label
    }
  }
}
""
"checked $($Pairs.Count * 2) pairs across 2 themes: $(($results | Where-Object Status -eq 'PASS').Count) pass, $($fails.Count) fail"
if ($fails.Count) {
  ""
  "FAILURES:"
  $fails | ForEach-Object { "  [$($_.Theme)] $($_.Label) = $(if($null -eq $_.Ratio){'unresolved'}else{$_.Ratio}) (needs $($_.Need))" }
  exit 1
}
if (-not $Report) { exit 0 } else { exit 0 }
