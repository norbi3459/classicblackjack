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

## Főmenü és telefonos demo (2026-09-28)
- Induláskor **főmenü** (`game/menu.js`, `game/menu.css`): 2D / 3D nézet, 2D-ben elrendezés (Teljes gép / Széles / Közeli),
  hang, teljes képernyő, súgó, JÁTÉK. Játék közben a **☰ MENÜ** gomb hozza vissza. A sarokban kicsi „DEMO VERZIÓ” felirat.
- A kinézet a gépé: a felső üveg kék gyűrűi, a kék inda-gyűrű (`assets/menu_swirl.webp`, a háttérképből kivágva),
  az eredeti logó, tűzszínű betűk (Titan One, OFL), arany keret futófény-izzókkal, 4 magától pörgő mini tárcsa.
- **Képek WebP-ben**: a játék a PNG-k WebP másolatait tölti (`python tools/make_webp.py`, PNG módosítás után futtatni).
  Telefonon a fél méretű készlet töltődik (`assets/m/...`, ugyanez az eszköz készíti): kevesebb memória, nem tűnnek el
  képek. A két nagy háttérkép mindenhol a fél méretűből jön (az is pont az üveg mérete). `?hq` = teljes készlet, `?lite` = telefonos.
- **3D telefonon**: az üvegek kisebb felbontással (zoom 0,45) kerülnek a 3D-be, a WebGL könnyebb (pixelarány 1,5, kisebb árnyék).
  A menü már a menü alatt felépíti a 3D jelenetet. Ha a 3D indítása közben összeomlik az oldal, a következő
  indításkor 2D-ben indul, és kiírja, miért.
  Induláskor ~61 MB helyett ~5 MB. A PNG-k mesterpéldányok maradnak, a Cloudflare-re nem mennek fel (`game/.assetsignore`).
- A 3D (three.js) csak akkor töltődik le, ha a 3D-t választod.
- Telefonra: `viewport-fit=cover`, biztonsági margók, fekvő nézetben kétoszlopos menü, „Kezdőképernyőhöz adás”
  (`manifest.webmanifest`, `icon-192.png`, `icon-512.png`, teljes képernyős indulás). A Teszt gomb csak helyben
  (localhost) vagy `?teszt` címmel látszik.

## Telefonos 3D: kép + élő üvegek (2026-09-28)
- Telefonon a 3D a gépszekrény előre renderelt képe (`assets/cab/portrait.webp`, `landscape.webp`, helyek: `cab.json`,
  készíti: `node tools/render_cabinet.js`), rajta az élő játék üvegei (perspektivikusan ráillesztve) és nyomható gombok
  (`game/cabinet.js`). Nincs WebGL/three.js → nem omlik össze, nem melegszik. Számítógépen marad a forgatható 3D;
  ha az ott nem indul, a következő indítás a képes 3D-t használja. `?cab` / `?full3d` kényszeríti.
- A betöltő képernyő mindent előre betölt és dekódol (képek, hangok, szimbólumok, bankjegyek, 3D).
