# 링크 미리보기 이미지(og.png 1200x630)와 아이콘(icon.png 180x180)을 그린다.
# 색은 public/style.css :root 토큰(--page·--surface·--ink·--accent·--accent2)과 같은 값.
# 실행: pwsh tools/make-share-images.ps1   (Windows — System.Drawing·맑은 고딕 사용)
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public'

$page   = [System.Drawing.ColorTranslator]::FromHtml('#ffd23f')
$surface= [System.Drawing.ColorTranslator]::FromHtml('#ffffff')
$ink    = [System.Drawing.ColorTranslator]::FromHtml('#1b1b1f')
$sub    = [System.Drawing.ColorTranslator]::FromHtml('#5b5648')
$chips  = @('#ff5a5f', '#00a6a6', '#ffd23f') | ForEach-Object { [System.Drawing.ColorTranslator]::FromHtml($_) }

function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear($page)
  return $bmp, $g
}
function Box($g, $fill, $x, $y, $w, $h, $line, $shadow) {
  if ($shadow) { $g.FillRectangle((New-Object System.Drawing.SolidBrush $ink), $x + $shadow, $y + $shadow, $w, $h) }
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $fill), $x, $y, $w, $h)
  $g.DrawRectangle((New-Object System.Drawing.Pen $ink, $line), $x, $y, $w, $h)
}

# ---- og.png ----
$bmp, $g = New-Canvas 1200 630
Box $g $surface 70 60 1060 510 6 14
$inkB = New-Object System.Drawing.SolidBrush $ink
$g.DrawString('미니게임', (New-Object System.Drawing.Font 'Malgun Gothic', 96, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)), $inkB, 120, 110)
$g.DrawString('링크 하나로 친구들과 바로 하는 실시간 파티게임', (New-Object System.Drawing.Font 'Malgun Gothic', 40, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)), (New-Object System.Drawing.SolidBrush $sub), 124, 250)
$names = @('라이어 게임', '즉석 퀴즈', '그림 릴레이', '폭탄 돌리기', '파장 맞추기', '딱 하나 힌트')
$cf = New-Object System.Drawing.Font 'Malgun Gothic', 32, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$x = 124; $y = 360; $i = 0
foreach ($n in $names) {
  $w = [int]$g.MeasureString($n, $cf).Width + 36
  if ($x + $w -gt 1090) { $x = 124; $y += 86 }
  Box $g $chips[$i % 3] $x $y $w 62 4 0
  $g.DrawString($n, $cf, $inkB, $x + 16, $y + 10)
  $x += $w + 18; $i++
}
$bmp.Save((Join-Path $out 'og.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# ---- icon.png (파비콘·홈 화면 아이콘) ----
$bmp, $g = New-Canvas 180 180
Box $g $chips[0] 22 22 128 128 7 10
$f = New-Object System.Drawing.Font 'Malgun Gothic', 84, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$sz = $g.MeasureString('미', $f)
$g.DrawString('미', $f, $inkB, 22 + (128 - $sz.Width) / 2, 22 + (128 - $sz.Height) / 2)
$bmp.Save((Join-Path $out 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"saved: og.png, icon.png"
