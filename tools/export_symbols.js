// Saves the vector symbols of tools/symbol_studio.html as game/assets/sprites/<name>.png.
// Needs Playwright (npm i -g playwright): node tools/export_symbols.js
const path = require("path");
const fs = require("fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright")); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(__dirname, "symbol_studio.html"));
  // each canvas trimmed to its drawing (plus a small margin), so the game scales the symbol itself, not empty space
  const out = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const m = 6, t = document.createElement("canvas");
    t.width = x1 - x0 + 1 + 2 * m; t.height = y1 - y0 + 1 + 2 * m;
    t.getContext("2d").drawImage(c, x0 - m, y0 - m, t.width, t.height, 0, 0, t.width, t.height);
    return [c.id, t.toDataURL("image/png")];
  }));
  for (const [name, url] of out) {
    const file = path.join(__dirname, "..", "game", "assets", "sprites", name + ".png");
    fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
    console.log("saved", path.relative(process.cwd(), file));
  }
  await browser.close();
})();
