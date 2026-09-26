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
3. ~~3D mód~~ → kész, lásd lent.

## 3D nézet (`game/view3d.js`, „3D gép” gomb)
- A gépház a `3d/build_cabinet.py` méreteiből épül fel three.js-szel (`game/vendor/three`, MIT), nincs glTF export.
- A két üveg maga az élő 2D játék (`#topGlass`, `#reelGlass`) CSS 3D-ben elhelyezve: éles és kattintható marad.
  A WebGL-gépház felül van, az üvegek helyén átlátszó „lyukkal”, így oldalról a gépház eltakarja az üveg szélét.
- A pult 6 gombja 3D-s, kattintható, a 2D gombok feliratát és világítását veszi át. Billentyűk ugyanúgy működnek.
- Egér: húzás = forgatás, görgő = nagyítás, jobb gomb = eltolás. A választás megmarad (localStorage).
