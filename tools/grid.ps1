param([string]$In,[string]$Out,[int]$Step=50,[double]$Scale=1.0,[int]$CropX=0,[int]$CropY=0,[int]$CropW=0,[int]$CropH=0)
Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Image]::FromFile($In)
if($CropW -le 0){$CropW=$src.Width-$CropX}; if($CropH -le 0){$CropH=$src.Height-$CropY}
$OW=[int]($CropW*$Scale); $OH=[int]($CropH*$Scale)
$bmp=New-Object System.Drawing.Bitmap $OW,$OH
$gr=[System.Drawing.Graphics]::FromImage($bmp)
$gr.DrawImage($src,(New-Object System.Drawing.Rectangle 0,0,$OW,$OH),(New-Object System.Drawing.Rectangle $CropX,$CropY,$CropW,$CropH),[System.Drawing.GraphicsUnit]::Pixel)
$mi=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(110,0,255,255)),1
$ma=New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230,255,0,255)),2
$f=New-Object System.Drawing.Font "Arial",11,([System.Drawing.FontStyle]::Bold)
$fb=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Yellow)
$bb=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170,0,0,0))
for($x=[int]([math]::Ceiling($CropX/$Step)*$Step);$x -le $CropX+$CropW;$x+=$Step){$px=[float](($x-$CropX)*$Scale); if(($x/$Step)%4 -eq 0){$gr.DrawLine($ma,$px,0,$px,$OH);$gr.FillRectangle($bb,$px+1,1,40,16);$gr.DrawString("$x",$f,$fb,$px+2,1)}else{$gr.DrawLine($mi,$px,0,$px,$OH)}}
for($y=[int]([math]::Ceiling($CropY/$Step)*$Step);$y -le $CropY+$CropH;$y+=$Step){$py=[float](($y-$CropY)*$Scale); if(($y/$Step)%4 -eq 0){$gr.DrawLine($ma,0,$py,$OW,$py);$gr.FillRectangle($bb,1,$py+1,40,16);$gr.DrawString("$y",$f,$fb,2,$py+1)}else{$gr.DrawLine($mi,0,$py,$OW,$py)}}
$bmp.Save($Out); $gr.Dispose(); $bmp.Dispose(); $src.Dispose()
