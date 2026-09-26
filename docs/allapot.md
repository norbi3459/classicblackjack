# Projekt állapot — Classic Black Jack

## Kész
- **Játszható böngészős játék** (`game/`, indítás: `Jatek_inditasa.bat`): alapjáték, TART, 21 / 2–9 gyűjtés,
  Kisebb/Nagyobb 9 szintes létrával, kerek lámpák, Super lépések, Match Play (+), Black Jack, Joker-segítségek,
  szorzó menü, teszt menü. Szabályok: `docs/jatekszabaly.md`, minden szám/szabály: `game/config.js`.
- **Betűk**: a gép saját stílusa (Cooper Black, piros-narancs töltés, sárga kontúr) minden kódból rajzolt feliratra.
- **Kódból rajzolva**: kártyák, tárcsaszalagok, nyereménytábla, TÉT-kijelző, körszámok.
- **3D ház** Blenderben: `3d/build_cabinet.py` → `3d/classic_blackjack.blend`.

## Folyamatban: teljes grafikai újrarajzolás, objektumonként
- Üres háttérlemezek: `game/assets/top_bg.png`, `reel_bg.png` (4096 px).
- 107 objektum külön rajzolva (Qwen → zöld/kék/magenta háttér → kivágás):
  lista `artwork/scene/objects.json` (`node tools/scene_objects.js`), futtatás `tools/isolate_all.ps1`,
  változat-választás `artwork/scene/picks.json`, összeállítás `tools/build_scene.ps1` → `game/scene.js`.

## Következő lépések
1. A 107 objektum átnézése, hibásak újrarajzolása, finomhangolás (elhelyezés, lámpaállapotok).
2. Ami még hiányzik: apró feliratok / fine print, felső sarkok, a tárcsakeretek mögé a tárcsa-illesztés.
3. **3D mód** (a felhasználóval egyeztetve, a 2D grafika után): a játék képe élő textúraként a Blender-modell
   üvegein (three.js, glTF export), szabad kamera, kattintható 3D gombok; a 2D nézet marad alapnak.
