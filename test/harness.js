// Testlauf: startet die App, spielt Schritte durch und speichert Screenshots nach $SHOTS
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');
const out = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
app.commandLine.appendSwitch('force-device-scale-factor', '1');
require('../app/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await wait(3500);
  const win = BrowserWindow.getAllWindows()[0], wc = win.webContents;
  const errors = []; wc.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) errors.push(e.message); });
  const shot = async (n) => fs.writeFileSync(path.join(out, n + '.png'), (await wc.capturePage()).toPNG());
  const js = (c) => wc.executeJavaScript(c, true);
  const steps = JSON.parse(fs.readFileSync(process.env.STEPS, 'utf8'));
  const results = [];
  for (const s of steps) {
    try { if (s.js) results.push({ step: s.name || s.js.slice(0, 50), result: await js(s.js) }); } catch (e) { results.push({ step: s.js.slice(0, 60), error: String(e) }); }
    await wait(s.wait || 600);
    if (s.shot) await shot(s.shot);
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  app.exit(0);
});
