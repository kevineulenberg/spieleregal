const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const covers = require('./covers');

app.setName('Game Launcher');
const isMac = process.platform === 'darwin';
let win, lib, dirs;

const expand = (p) => (p && p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { timeout: 20000, maxBuffer: 8e6 }, (err, out) => res(err ? null : out)));
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spiel';

// Liegt die App im Projektordner (neben app/main.js), wird das Protokoll zusätzlich dort geschrieben
let devLog;
function log(...a) {
  if (devLog === undefined) { const d = path.resolve(process.execPath, '../../../..'); devLog = isMac && exists(path.join(d, 'app', 'main.js')) ? path.join(d, 'launcher.log') : null; }
  const line = `[${new Date().toISOString()}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`;
  if (devLog) try { fs.appendFileSync(devLog, line); } catch {}
  try { fs.appendFileSync(path.join(dirs.root, 'launcher.log'), line); } catch {}
}
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

/* ---------- Bibliothek ---------- */
function save() {
  const tmp = path.join(dirs.root, 'library.json');
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 2));
}
function load() {
  dirs = { root: app.getPath('userData') };
  dirs.covers = path.join(dirs.root, 'covers');
  dirs.icons = path.join(dirs.root, 'icons');
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  const file = path.join(dirs.root, 'library.json');
  if (exists(file)) {
    try { lib = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fs.copyFileSync(file, file + '.defekt'); }
  }
  if (!lib) {
    lib = { version: 1, settings: { sgdbKey: '' }, games: [] };
    const seedDir = path.join(__dirname, 'seed');
    for (const g of JSON.parse(fs.readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))) {
      const game = { ...g, path: expand(g.path), addedAt: Date.now(), favorite: false, playCount: 0, lastPlayed: 0 };
      const src = path.join(seedDir, 'covers', g.id + '.png');
      if (exists(src)) {
        game.cover = path.join(dirs.covers, g.id + '.png');
        fs.copyFileSync(src, game.cover);
        Object.assign(game, analyse(game.cover));
      }
      lib.games.push(game);
    }
    save();
  }
}

// Leitfarbe und Seitenverhältnis eines Covers
function analyse(file) {
  try {
    const img = nativeImage.createFromPath(file);
    const { width, height } = img.getSize();
    if (!width) return {};
    const bmp = img.resize({ width: 24, height: 24, quality: 'good' }).toBitmap();
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < bmp.length; i += 4) {
      const B = bmp[i], G = bmp[i + 1], R = bmp[i + 2];
      const max = Math.max(R, G, B), min = Math.min(R, G, B);
      const sat = max ? (max - min) / max : 0;
      const w = sat * sat * (max / 255) + 0.02;
      r += R * w; g += G * w; b += B * w; n += w;
    }
    return { color: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], ratio: +(width / height).toFixed(3) };
  } catch { return {}; }
}

const fileUrl = (p) => (p && exists(p) ? pathToFileURL(p).href + '?v=' + Math.round(fs.statSync(p).mtimeMs) : null);
function view(g) {
  return { ...g, coverUrl: fileUrl(g.cover), iconUrl: fileUrl(g.icon), missing: !exists(g.path) };
}
const state = () => ({ games: lib.games.map(view), settings: lib.settings, platforms: covers.PLATFORMS });
const find = (id) => lib.games.find((g) => g.id === id);
const push = () => win && !win.isDestroyed() && win.webContents.send('state', state());

/* ---------- Startdatei finden ---------- */
async function scanApps(dir, depth = 0, out = []) {
  if (depth > 3 || out.length > 40) return out;
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.name.endsWith('.app')) out.push(p);
    else if (/\.(command|sh)$/i.test(e.name) && depth < 2) out.push(p);
    else if (e.isDirectory()) await scanApps(p, depth + 1, out);
  }
  return out;
}
async function resolveTarget(g) {
  if (g.target && exists(g.target)) return g.target;
  const p = g.path;
  let st; try { st = await fsp.stat(p); } catch { return null; }
  if (!st.isDirectory() || p.endsWith('.app')) return p;
  const found = await withTimeout(scanApps(p), 4000, null);
  log('Ordner durchsucht', p, found ? found.slice(0, 8) : 'Zeitüberschreitung');
  if (!found || !found.length) return p;
  const want = slug(path.basename(p));
  const score = (f) => { const s = slug(path.basename(f).replace(/\.\w+$/, '')); return (s === want ? 4 : 0) + (want.includes(s) || s.includes(want) ? 2 : 0) + (f.endsWith('.app') ? 1 : 0) - f.split(path.sep).length / 100; };
  return found.sort((a, b) => score(b) - score(a))[0];
}

/* ---------- Icons aus .app ---------- */
async function extractIcon(g) {
  if (!isMac || g.icon) return;
  const target = await resolveTarget(g);
  if (!target || !target.endsWith('.app')) return;
  const out = path.join(dirs.icons, g.id + '.png');
  const json = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(target, 'Contents', 'Info.plist')]);
  let name = null;
  try { const info = JSON.parse(json); name = info.CFBundleIconFile || info.CFBundleIconName; } catch {}
  const res = path.join(target, 'Contents', 'Resources');
  let icns = name && [name, name + '.icns'].map((n) => path.join(res, n)).find((f) => exists(f) && fs.statSync(f).isFile());
  if (!icns) { try { const f = fs.readdirSync(res).find((n) => n.endsWith('.icns')); if (f) icns = path.join(res, f); } catch {} }
  if (!icns) return;
  await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '256', icns, '--out', out]);
  if (exists(out)) g.icon = out;
}

/* ---------- Bilder übernehmen ---------- */
async function importImage(g, kind, src) {
  const dir = kind === 'icon' ? dirs.icons : dirs.covers;
  const stamp = Date.now().toString(36);
  let file;
  if (/^https?:/.test(src)) {
    const r = await fetch(src, { headers: { 'User-Agent': covers.UA } });
    if (!r.ok) throw new Error('Bild konnte nicht geladen werden (HTTP ' + r.status + ')');
    const type = r.headers.get('content-type') || '';
    const ext = /png/.test(type) ? '.png' : /jpe?g/.test(type) ? '.jpg' : /webp/.test(type) ? '.webp' : (path.extname(new URL(src).pathname) || '.png');
    file = path.join(dir, `${g.id}-${stamp}${ext}`);
    await fsp.writeFile(file, Buffer.from(await r.arrayBuffer()));
  } else {
    file = path.join(dir, `${g.id}-${stamp}${path.extname(src).toLowerCase() || '.png'}`);
    await fsp.copyFile(src, file);
  }
  if (!/\.(png|jpe?g)$/i.test(file) || path.extname(src).toLowerCase() === '.icns') {
    const png = file.replace(/\.\w+$/, '') + '.png';
    if (isMac) await run('/usr/bin/sips', ['-s', 'format', 'png', file, '--out', png]);
    if (exists(png) && png !== file) file = png;
  }
  if (nativeImage.createFromPath(file).isEmpty()) throw new Error('Dieses Bildformat wird nicht unterstützt. PNG oder JPG funktionieren immer.');
  if (kind === 'icon') g.icon = file;
  else { g.cover = file; delete g.color; delete g.ratio; Object.assign(g, analyse(file)); }
}

function cleanTitle(p) {
  return path.basename(p).replace(/\.(app|command|sh|exe)$/i, '').replace(/[._]+/g, ' ')
    .replace(/\b(recompiled|recomp|pc port|port|mac|macos|hd remaster)\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function autoCover(g) {
  const results = await covers.search(g.title, g.platform, lib.settings.sgdbKey, { quick: true });
  for (const c of results.slice(0, 3)) {
    try { await importImage(g, 'cover', c.url); if (c.year && !g.year) g.year = c.year; return true; } catch (e) { log('Cover fehlgeschlagen', c.url, String(e)); }
  }
  return false;
}

async function addPaths(paths) {
  const added = [];
  for (const raw of paths) {
    const p = raw.replace(/\/$/, '');
    if (!p || lib.games.some((g) => g.path === p)) continue;
    const title = cleanTitle(p);
    let id = slug(title), n = 2;
    while (find(id)) id = slug(title) + '-' + n++;
    const g = { id, title, path: p, platform: '', genres: [], description: '', addedAt: Date.now(), favorite: false, playCount: 0, lastPlayed: 0 };
    lib.games.push(g); added.push(g);
  }
  if (!added.length) return [];
  save(); push();
  // Icons und Cover laufen im Hintergrund nach
  (async () => {
    for (const g of added) {
      try { await extractIcon(g); } catch (e) { log('Icon', String(e)); }
      try { await autoCover(g); } catch (e) { log('AutoCover', String(e)); }
      save(); push();
    }
    win && win.webContents.send('toast', added.length === 1 ? `Cover für „${added[0].title}“ ${added[0].cover ? 'geladen' : 'nicht gefunden – du kannst eines in den Details wählen'}` : `${added.filter((g) => g.cover).length} von ${added.length} Covern geladen`);
  })();
  return added.map((g) => g.id);
}

/* ---------- IPC ---------- */
const handlers = {
  state: () => state(),
  async launch(id) {
    const g = find(id);
    if (!g) return { ok: false, error: 'Spiel nicht gefunden' };
    log('Start angefragt', g.title, g.path);
    const target = await resolveTarget(g);
    log('Ziel', target);
    if (!target) return { ok: false, error: `„${path.basename(g.path)}“ liegt nicht mehr unter ${path.dirname(g.path)}. Wähle in den Details einen neuen Ort.` };
    // openPath kann hängen, solange macOS einen Dialog zeigt – dann nicht die Oberfläche blockieren
    const err = await withTimeout(shell.openPath(target), 6000, '');
    log('Start', g.title, target, err || 'ok');
    if (err) return { ok: false, error: err };
    g.playCount = (g.playCount || 0) + 1; g.lastPlayed = Date.now();
    save(); push();
    let isFolder = false; try { isFolder = fs.statSync(target).isDirectory() && !target.endsWith('.app'); } catch {}
    return { ok: true, target, isFolder };
  },
  async pickGames() {
    const r = await dialog.showOpenDialog(win, { title: 'Spiele hinzufügen', buttonLabel: 'Hinzufügen', defaultPath: path.join(os.homedir(), 'Desktop'), properties: ['openFile', 'openDirectory', 'multiSelections'], message: 'Wähle Apps, Ordner oder Startdateien' });
    return r.canceled ? [] : addPaths(r.filePaths);
  },
  addPaths: (paths) => addPaths(paths),
  update(id, patch) {
    const g = find(id); if (!g) return;
    for (const k of ['title', 'platform', 'year', 'description', 'genres', 'favorite', 'path', 'target']) if (k in patch) g[k] = patch[k];
    if (!g.target) delete g.target;
    save(); push();
  },
  remove(id) { lib.games = lib.games.filter((g) => g.id !== id); save(); push(); },
  async pickImage() {
    const r = await dialog.showOpenDialog(win, { title: 'Bild wählen', buttonLabel: 'Verwenden', properties: ['openFile'], filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'heic', 'icns', 'bmp'] }] });
    return r.canceled ? null : r.filePaths[0];
  },
  async pickTarget(id) {
    const g = find(id);
    const r = await dialog.showOpenDialog(win, { title: 'Startdatei wählen', buttonLabel: 'Wählen', defaultPath: g && exists(g.path) ? g.path : undefined, properties: ['openFile', 'openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  },
  async setImage(id, kind, src) {
    const g = find(id); if (!g) return { ok: false };
    try { await importImage(g, kind, src); save(); push(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  },
  async searchCovers(query, platform) {
    try { return { ok: true, results: await covers.search(query, platform, lib.settings.sgdbKey, {}) }; } catch (e) { return { ok: false, error: e.message, results: [] }; }
  },
  async fetchMissing() {
    let n = 0;
    for (const g of lib.games.filter((x) => !x.cover || !exists(x.cover))) { if (await autoCover(g).catch(() => false)) n++; save(); push(); }
    return n;
  },
  setSettings(patch) { Object.assign(lib.settings, patch); save(); push(); },
  reveal(id) { const g = find(id); if (g && exists(g.path)) shell.showItemInFolder(g.path); },
  openExternal(url) { if (/^https:\/\//.test(url)) shell.openExternal(url); },
};

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, show: false,
    backgroundColor: '#0d0a14', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 22 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) log('Renderer', e.message); });
}

app.whenReady().then(async () => {
  load();
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (_e, ...a) => fn(...a));
  if (isMac) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Game Launcher', submenu: [{ role: 'about', label: 'Über Game Launcher' }, { type: 'separator' }, { role: 'hide', label: 'Ausblenden' }, { role: 'hideOthers', label: 'Andere ausblenden' }, { type: 'separator' }, { role: 'quit', label: 'Beenden' }] },
      { label: 'Bibliothek', submenu: [{ label: 'Spiel hinzufügen …', accelerator: 'Cmd+N', click: () => win && win.webContents.send('cmd', 'add') }, { label: 'Suchen', accelerator: 'Cmd+F', click: () => win && win.webContents.send('cmd', 'search') }, { label: 'Einstellungen …', accelerator: 'Cmd+,', click: () => win && win.webContents.send('cmd', 'settings') }] },
      { label: 'Bearbeiten', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'Fenster', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
    ]));
  }
  createWindow();
  // Icons der vorhandenen Apps einmalig nachladen
  (async () => { let ch = false; for (const g of lib.games) if (!g.icon) { try { await extractIcon(g); if (g.icon) ch = true; } catch {} } if (ch) { save(); push(); } })();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
