# Classic Black Jack — játékszabály (a felhasználó leírása alapján)

## Alapjáték
- 4 tárcsa (reel), mindegyik alatt egy **TART** gomb.
- **TART**: az adott tárcsa megáll/megmarad a következő pörgetésnél.
- **Nyerés**:
  - 3 azonos szimbólum balról jobbra (1–2–3. tárcsa), vagy
  - 3 azonos szimbólum jobbról balra (4–3–2. tárcsa), vagy
  - 4 azonos szimbólum.
- A nyereményeket a reel alatti nyereménytábla adja meg (lásd `feliratok.md`, 20).

## Kártyák a szimbólumokon
- Egyes szimbólumokhoz (nem mindhez) egy kártya is tartozik (pl. Q, 4, 7).
- Kártyaértékek blackjack szerint: K, Q, J = 10, A = 1 vagy 11, a többi névérték.
- Ha a 4 tárcsán látható kártyák összege pontosan **21** (pl. Q + 4 + 7) → indul a **Kisebb/Nagyobb** játék.

## Kártyagyűjtés (jobb oldali kártyaoszlop, "KÁRTYA OSZTÓ")
- A kártyaoszlop lapjai 2-től 9-ig.
- Ha pörgetések során a 4 tárcsán **bárhol** megjelenik a soron következő lap (2, aztán 3, 4, … 9),
  az a lap kigyullad az oszlopban — egyesével, sorrendben.
- Ha a 9-es is kigyullad → indul a bónuszjáték (ugyanaz, mint a 21-es összegnél: Kisebb/Nagyobb).
- **Nyereménynél** (pl. 3 körte) a gyűjtött lapok **törlődnek**.

## Segítségek kiosztása
- Joker-lapnál a segítségek véletlenszerűen villogni kezdenek, és **a START-tal kell elkapni** (nem magától jön).
- A futófény a hiányzó 2–9 lapokon is végigmegy: egy lap elkapása addig a lapig mindent kigyújt,
  a **9-es** elkapása teljessé teszi a sort és indítja a KISEBB/NAGYOBB játékot. (Feltételezés, megerősítendő.)
- A segítségek **csak felhasználáskor törlődnek**, a nyeremény nem törli őket.

## Kisebb/Nagyobb (KISEBB / NAGYOBB)
- Egy kis kártyatárcsa a játék elején ad egy véletlen kártyát (pl. 7).
- A játékos tippel: **NAGYOBB** vagy **KISEBB**.
- Ha eltalálja (pl. 7 után 8 és "nagyobb" volt a tipp), egy szinttel feljebb lép.
- Így tovább, egyre nagyobb bónusz nyerhető.

## Segítségek (Joker-sor, feliratok #11)
- Játék közben megszerezhető segítségek, a Joker-sor táblái (a fotó alapján, megerősítendő):
  DUPLA BLACK JACK, EXTRA LÉPÉS, JÓ AZ EGYENLŐ, MÁSIK KÁRTYA.
- **Jó az egyenlő**: ha aktív, egyenlő lapnál (pl. 7 után 7) megy tovább a Kisebb/Nagyobb.
- Ha nincs aktív segítség, egyenlő lapnál **elvész a bónuszjáték**.
- **Rossz tippnél minden elvész**: a Kisebb/Nagyobb addig elért összes bónusza.

## Tét és kifizetés (felhasználó, 2026-09-25)
- A **TÉT** gomb a játék összegét állítja: **50 / 100 / 200 Ft**.
- A nyereménytábla számai a **tét szorzói**. **25/175 = 200×** (50 Ft-os tétnél 10 000 Ft).

## Kisebb/Nagyobb — kiegészítés
- **Kiszállni a TART gombbal** lehet (az addigi nyeremény elvihető).

## Kártyagyűjtés — kiegészítés
- Egy pörgetésből **több lap is kigyulladhat**, ha a pörgetésből származik.

## Joker-lap és segítségek — kiegészítés
- A segítségeket (Dupla Black Jack, Jó az egyenlő, Extra lépés, Másik kártya) akkor lehet megkapni,
  amikor a 4 tárcsa közül valamelyik szimbólumon **Joker kártya** van.
- Egyszerre **legfeljebb 4** segítség lehet nálad (mindegyikből egy).

## Match Play
- **START** → a kerék szimbólumainak háttérvilágítása véletlenszerűen villog, a Match Play dallam ütemére
  (kb. 0,16 mp-enként), és a dallam végén **magától megáll** egy szimbólumon.
- Nincs pörgetés: utána a **LÉPÉS FEL / LÉPÉS LE** felváltva villog, a **START** választ irányt, és a tárcsák
  onnan, ahol állnak, **magától lépkednek** abba az irányba. Amelyik elérte a szimbólumot, megáll, a többi addig megy,
  amíg nyerő sor nem lesz (felhasználó, 2026-09-28).
  - Ha a két **szélén** ér oda először → mindkét középsőnek oda kell érnie → **4** egyforma.
  - Ha **középen** → az első odaérő szélső már **3**-at ad.
- Az elkapott szimbólum kigyullad a keréken. Ha **mind kigyullad** ("HA MINDEN VILÁGÍT"), plusz
  **25/175 jackpotot** ad, és a kerék **nullázódik**; a nullázás után **egy darab** világítva marad.

## Match Play +
- Ugyanaz, mint a Match Play, de utána a **PLUS / STOP** gyorsan vibrálva váltakozik; a **START**-tal lehet
  elkapni (pontosan azt adja, ami épp ég). PLUS → újabb Match Play kör; ez addig ismétlődik, amíg STOP nem jön.

## Választás: mindig a START-tal (felhasználó, 2026-09-25)
- Ahol több lehetőség van, azok **felváltva villognak lassan**, és a **START** azt választja, amelyik épp ég:
  KISEBB/NAGYOBB, a létra "V"-s szintjei, a szorzó menü, a Match Play kerék, PLUS/STOP, és a **Joker**-nél a segítségek is.

## Kisebb/Nagyobb létra (bal oszlop, alulról felfelé)
A játék a **0. szintről** indul: már az 1. szintre (4) is tippelni kell.
1. 4
2. kerek lámpasor (5 kör): a 4-es villog, START-tal **egyenként elkapod** a köröket; **mind az 5 = 20**.
   A körök **nem maradnak meg**. **Minden égő lámpa 4-et ér** (3 lámpa = 12); **TART-tal megállsz és elviszed**,
   ha tovább mész és mellényomsz, **elbukod**.
3. 10
4. Classic Black Jack **V** Super lépések
5. 20
6. Super Classic Black Jack **V** Match Play
7. Match Play +
8. 25
9. 25 / 175
- **Extra lépés**: egy szinttel feljebb lép tipp nélkül (pl. 5. szintről a 6.-ra).
- A segítségeket a felső üveg alján lévő **4 háromszög gombbal** lehet használni.

## Super lépések (4. szint V)
- A jobb oldali Black Jack oszlopon kapsz egy **lépésszámot**; a tárcsákat kézzel mozgatod fel/le,
  tárcsánként. **Minden lépés egyet levon**. Akkor éri meg, ha pl. BAR / körte / Black Jack közel van
  mind a 4 tárcsán, és pár lépésből középre húzható.
- A **lépésszámot is el kell kapni** (a pályán végigfutó fény, START).
- **TART**-tal választod a tárcsát, közben a **LÉPÉS FEL / LE felváltva villog**, és a **START** dönti el
  az irányt (felhasználó). *A TÉT = kész (korai befejezés) csak a játékban van, megerősítendő.*

## Szorzó menü — minden nyereménynél
- **Mindig** felkínálja (alapjáték, létra, Black Jack, Match Play, kerek lámpák, Super lépések).
- A nyeremény kockáztatható: **×6, ×3, ×2, ×2, ×1** felváltva villog, START választ, a kártyakerék dönt.
- Találat után a menü **újra jön** a megszorzott összeggel: addig szorzol, amíg akarsz, vagy amíg el nem bukod.
- Példa: 2000 Ft nyeremény, ×6, a kártyakerék K-t vagy A-t hoz → 12 000 Ft.
- ×2 ♣♠ = fekete, ×2 ♥♦ = piros, **×3 = J, Q, K, A** (B, D, K, A), ×1 = elviszi.

## Csak a középső 4 pozíció játszik
- A gyümölcsöknél és a lapoknál is (21-es összeg, kártyagyűjtés).

## Black Jack (jobb oldal)
- Nincs osztó, **csak a saját pontod számít**.
- Valódi blackjack-szerű: **START** (vagy a Másik kártya háromszög) = lap, **TÉT** vagy **TART** = megállás; a pontszám a pályán halad (1–16),
  17–21 között fizet a rács szerint (bal oszlop: Super, jobb oszlop: Classic), 21 fölött bukás.

## Nyitott kérdések
- Black Jack: 17 alatt megállva van nyeremény? A DUPLA lámpa a Dupla Black Jack segítség (dupláz)?
- A 8. szint "25" alatti kis szöveg: 25/75?
- TART: mindig használható, vagy csak bizonyos pörgetések után?

## Automatikus tartás (feltételezés, megerősítendő)
- Nem nyerő, nem tartott pörgetés után a gép magától megtartja a legjobb elkezdett sort: 2–3 egyforma szimbólum a bal vagy a jobb szélről.
- A TART gombokkal ez átállítható (max. 3 tárcsa). Tartott pörgetés után nincs újabb tartás.
- Az üzenetsáv (a két üveg között) üres, mint az eredeti gépen.

## Kockázat a 20-asnál (felhasználó, 2026-09-28)
- A Kisebb/Nagyobb létrán a **20**-as szinten a nyeremény kockáztatható: a mellette lévő mezők
  (lent: Classic Black Jack / Super lépések, fent: Super Classic Black Jack / Match Play) felváltva villognak,
  és a **START** azt adja, amelyik épp ég. Indítás: bármelyik **TART** gomb („KOCKÁZAT”).
  Hogy pontosan mely mezők vesznek részt, a `config.js` `ladder` 20-as lépcsőjének `risk` listája dönti el
  (a felhasználó „Match Play +”-t is említett — megerősítendő).

## A 4 háromszög gomb (felhasználó, 2026-09-28)
- Balról jobbra: **?** (egyelőre Dupla Black Jack) · **Extra lépés** · **Másik kártya** · **Kifizetés**.
- Ha épp nem használható, rövid „nem” hangjelzést ad. Billentyűk: Q W E R.
