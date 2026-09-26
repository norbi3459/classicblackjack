$root = Split-Path $PSScriptRoot -Parent
foreach ($panel in "top_glass", "reel_glass") {
  & "$PSScriptRoot\restore_panel.ps1" -Dir "$root\artwork\$panel" -PromptFile "$root\artwork\prompt_tile.txt" -OutSub "restored_v2"
  & "$PSScriptRoot\tiles.ps1" -Mode stitch -Dir "$root\artwork\$panel" -Out "$root\artwork\${panel}_v2.png" -Restored "restored_v2"
}
"ALL DONE"
