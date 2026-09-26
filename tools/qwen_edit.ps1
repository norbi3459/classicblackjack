param(
  [string]$In,
  [string]$Out,
  [string]$Prompt,
  [string]$Ref = "",          # optional style reference image (image2)
  [long]$Seed = 42,
  [double]$Megapixels = 1.0,
  [int]$Steps = 4,
  [string]$Server = "http://127.0.0.1:8191"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

function Upload($path) {
  $client = New-Object System.Net.Http.HttpClient
  $content = New-Object System.Net.Http.MultipartFormDataContent
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $file = New-Object System.Net.Http.ByteArrayContent(,$bytes)
  $file.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
  $content.Add($file, "image", [System.IO.Path]::GetFileName($path))
  $content.Add((New-Object System.Net.Http.StringContent("true")), "overwrite")
  $resp = $client.PostAsync("$Server/upload/image", $content).Result
  $json = $resp.Content.ReadAsStringAsync().Result | ConvertFrom-Json
  $client.Dispose()
  return $json.name
}

# Pre-scale to the exact size TextEncodeQwenImageEditPlus uses for its reference latent
# (~1024*1024 px, multiples of 8); any mismatch between latent and reference makes the output zoom/shift.
Add-Type -AssemblyName System.Drawing
function RefSize([int]$w, [int]$h) {
  $best = $null
  $s0 = [math]::Sqrt(1048576.0 / ($w * $h))
  foreach ($dw in -3..3) { foreach ($dh in -3..3) {
    $W2 = ([math]::Round($w * $s0 / 16) + $dw) * 16; $H2 = ([math]::Round($h * $s0 / 16) + $dh) * 16
    if ($W2 -le 0 -or $H2 -le 0) { continue }
    $sb = [math]::Sqrt(1048576.0 / ($W2 * $H2))
    if ([math]::Round($W2 * $sb / 8.0) * 8 -ne $W2 -or [math]::Round($H2 * $sb / 8.0) * 8 -ne $H2) { continue }
    $err = [math]::Abs($W2 / $H2 - $w / $h)
    if (-not $best -or $err -lt $best[2]) { $best = @($W2, $H2, $err) }
  } }
  return $best
}
$srcImg = [System.Drawing.Image]::FromFile($In)
$origW = $srcImg.Width; $origH = $srcImg.Height
$rs = RefSize $origW $origH
$tmp = Join-Path $env:TEMP ("qwen_in_" + [guid]::NewGuid().ToString("N") + ".png")
$bmp = New-Object System.Drawing.Bitmap ([int]$rs[0]), ([int]$rs[1])
$gg = [System.Drawing.Graphics]::FromImage($bmp)
$gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gg.DrawImage($srcImg, 0, 0, [int]$rs[0], [int]$rs[1])
$gg.Dispose(); $srcImg.Dispose(); $bmp.Save($tmp); $bmp.Dispose()
$inName = Upload $tmp
Remove-Item $tmp -Force
$wf = @{
  "1"  = @{ class_type = "UNETLoader"; inputs = @{ unet_name = "qwen_image_edit_2509_fp8_e4m3fn.safetensors"; weight_dtype = "default" } }
  "2"  = @{ class_type = "CLIPLoader"; inputs = @{ clip_name = "qwen_2.5_vl_7b_fp8_scaled.safetensors"; type = "qwen_image" } }
  "3"  = @{ class_type = "VAELoader"; inputs = @{ vae_name = "qwen_image_vae.safetensors" } }
  "4"  = @{ class_type = "LoraLoaderModelOnly"; inputs = @{ model = @("1", 0); lora_name = "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"; strength_model = 1.0 } }
  "5"  = @{ class_type = "ModelSamplingAuraFlow"; inputs = @{ model = @("4", 0); shift = 3.0 } }
  "6"  = @{ class_type = "CFGNorm"; inputs = @{ model = @("5", 0); strength = 1.0 } }
  "7"  = @{ class_type = "LoadImage"; inputs = @{ image = $inName } }
  "9"  = @{ class_type = "TextEncodeQwenImageEditPlus"; inputs = @{ clip = @("2", 0); prompt = $Prompt; vae = @("3", 0); image1 = @("7", 0) } }
  "10" = @{ class_type = "TextEncodeQwenImageEditPlus"; inputs = @{ clip = @("2", 0); prompt = ""; vae = @("3", 0); image1 = @("7", 0) } }
  "11" = @{ class_type = "VAEEncode"; inputs = @{ pixels = @("7", 0); vae = @("3", 0) } }
  "12" = @{ class_type = "KSampler"; inputs = @{ model = @("6", 0); seed = $Seed; steps = $Steps; cfg = 1.0; sampler_name = "euler"; scheduler = "simple"; positive = @("9", 0); negative = @("10", 0); latent_image = @("11", 0); denoise = 1.0 } }
  "13" = @{ class_type = "VAEDecode"; inputs = @{ samples = @("12", 0); vae = @("3", 0) } }
  "14" = @{ class_type = "SaveImage"; inputs = @{ images = @("13", 0); filename_prefix = "qwen_edit" } }
}
if ($Ref) {
  $refName = Upload $Ref
  $wf["15"] = @{ class_type = "LoadImage"; inputs = @{ image = $refName } }
  $wf["9"].inputs.image2 = @("15", 0)
  $wf["10"].inputs.image2 = @("15", 0)
}

$body = @{ prompt = $wf } | ConvertTo-Json -Depth 10
$r = Invoke-RestMethod "$Server/prompt" -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8"
$id = $r.prompt_id
$t0 = Get-Date
while ($true) {
  Start-Sleep -Seconds 2
  $h = Invoke-RestMethod "$Server/history/$id"
  $entry = $h.$id
  if ($entry) {
    if ($entry.status.status_str -eq "error") { throw ("ComfyUI error: " + ($entry.status.messages | ConvertTo-Json -Depth 6)) }
    $img = $entry.outputs."14".images[0]
    if ($img) {
      $url = "$Server/view?filename=$([uri]::EscapeDataString($img.filename))&subfolder=$([uri]::EscapeDataString($img.subfolder))&type=$($img.type)"
      Invoke-WebRequest $url -OutFile $Out -UseBasicParsing
      "OK $Out  ({0:N0}s)" -f ((Get-Date) - $t0).TotalSeconds
      break
    }
  }
  if (((Get-Date) - $t0).TotalMinutes -gt 15) { throw "timeout" }
}
