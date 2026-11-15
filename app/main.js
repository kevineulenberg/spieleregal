const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const covers = require('./covers');

app.setName('Game Launcher');
let appReady = false, openedByUrl = false;
const urlQueue = [];
app.on('open-url', (e, url) => { e.preventDefault(); if (appReady) handleUrl(url); else { openedByUrl = true; urlQueue.push(url); } });
async function handleUrl(url) {
  const m = /^spieleregal-launcher:\/\/([a-z]+)\/?([^?#]*)/.exec(url);
  log('Link', url);
  if (m && m[1] === 'launch' && m[2]) {
    const r = await handlers.launch(decodeURIComponent(m[2]));
    if (!r.ok) { handlers.showMain(); setTimeout(() => alive(win) && win.webContents.send('toast', r.error, true), 1500); }
  } else handlers.showMain();
}
if (!app.requestSingleInstanceLock()) app.quit();
const isMac = process.platform === 'darwin';
let win, widget, lib, dirs;

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
const WIDGET_APP = path.join(os.homedir(), 'Applications', 'Spieleregal Widget.app');
let reloadTimer;
function save() {
  fs.writeFileSync(path.join(dirs.root, 'library.json'), JSON.stringify(lib, null, 2));
  // Das macOS-Widget liest dieselbe Datei; kurz Bescheid geben, damit es neu zeichnet
  if (isMac && exists(WIDGET_APP)) { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => execFile('/usr/bin/open', ['-g', 'spieleregal://reload'], () => {}), 1500); }
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
    lib = { version: 2, settings: { sgdbKey: '' }, games: [] };
    const seedDir = path.join(__dirname, 'seed');
    for (const g of JSON.parse(fs.readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))) {
      const { rev, ...rest } = g;
      const game = { ...rest, path: expand(g.path), seedRev: rev || 1, addedAt: Date.now(), favorite: false, playCount: 0, lastPlayed: 0 };
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
  lib.settings.folders = lib.settings.folders || ['~/Documents/Games/Games Shortcuts', '~/Desktop'];
  let changed = relink();
  // Hat ein Eintrag der Startbibliothek eine neuere Revision, gilt dessen Pfad
  try {
    for (const s of JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', 'seed.json'), 'utf8'))) {
      const g = find(s.id);
      if (g && s.rev && (g.seedRev || 1) < s.rev && exists(expand(s.path))) { log('Startpfad aktualisiert', g.title, s.path); g.path = expand(s.path); delete g.target; g.seedRev = s.rev; delete g.icon; changed = true; }
    }
  } catch (e) { log('Seed', String(e)); }
  if (changed) save();
}

// Verschobene Spiele wiederfinden: gleicher Dateiname in einem der Spiele-Ordner
function relink() {
  let changed = false;
  for (const g of lib.games) {
    if (exists(g.path)) continue;
    const base = path.basename(g.path);
    for (const dir of lib.settings.folders || []) {
      const hit = [base, base + '.app', base.replace(/\.app$/, '')].map((n) => path.join(expand(dir), n)).find(exists);
      if (hit) { log('Neu zugeordnet', g.title, hit); g.path = hit; delete g.target; changed = true; break; }
    }
  }
  return changed;
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
const state = () => ({ games: lib.games.map(view), widgetInstalled: isMac && exists(WIDGET_APP), settings: { ...lib.settings, openAtLogin: isMac ? app.getLoginItemSettings().openAtLogin : false }, platforms: covers.PLATFORMS });
const find = (id) => lib.games.find((g) => g.id === id);
const alive = (w) => w && !w.isDestroyed();
const push = () => { const s = state(); for (const w of [win, widget]) if (alive(w)) w.webContents.send('state', s); };

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
    if (!exists(g.path) && relink()) save();
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
  setSettings(patch) {
    if ('openAtLogin' in patch) { if (isMac) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin }); delete patch.openAtLogin; }
    Object.assign(lib.settings, patch); save();
    if ('widget' in patch) toggleWidget(lib.settings.widget);
    if ('folders' in patch && relink()) save();
    push(); buildMenu();
  },
  async installWidget() {
    if (!isMac) return { ok: false, log: 'Das Widget gibt es nur unter macOS.' };
    const src = path.join(dirs.root, 'widget-src'), out = path.join(dirs.root, 'widget-build');
    fs.rmSync(src, { recursive: true, force: true });
    fs.cpSync(path.join(__dirname, 'widget'), src, { recursive: true });
    const launcher = path.resolve(process.execPath, '../../..');
    const text = await new Promise((res) => execFile('/bin/bash', [path.join(src, 'build.sh'), src, out, launcher], { timeout: 600000, maxBuffer: 32e6, env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin:' + (process.env.PATH || '') } }, (err, so, se) => res((so || '') + (se || '') + (err && !so ? String(err) : ''))));
    try { fs.writeFileSync(path.join(dirs.root, 'widget-build.log'), text); if (devLog) fs.writeFileSync(path.join(path.dirname(devLog), 'widget-build.log'), text); } catch {}
    const ok = /ERGEBNIS: OK/.test(text);
    log('Widget-Installation', ok ? 'ok' : 'fehlgeschlagen');
    return { ok, built: /ERGEBNIS: GEBAUT/.test(text), log: text.split('\n').filter((l) => /error|ERGEBNIS|BUILD/.test(l)).slice(-6).join('\n') };
  },
  showMain() { if (alive(win)) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } else createWindow(); if (isMac) app.focus({ steal: true }); },
  hideWidget() { handlers.setSettings({ widget: false }); },
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
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) log('Renderer', e.message); });
}

/* ---------- Widget: breites Schreibtisch-Fenster mit den zuletzt gespielten Spielen ---------- */
function toggleWidget(on) {
  if (!on) { if (alive(widget)) widget.destroy(); widget = null; return; }
  if (alive(widget)) { widget.show(); return; }
  const { screen } = require('electron');
  const W = 920, H = 232, area = screen.getPrimaryDisplay().workArea;
  let [x, y] = lib.settings.widgetPos || [area.x + area.width - W - 24, area.y + area.height - H - 24];
  const onScreen = screen.getAllDisplays().some((d) => x + 80 > d.workArea.x && x < d.workArea.x + d.workArea.width - 80 && y >= d.workArea.y - 10 && y < d.workArea.y + d.workArea.height - 40);
  if (!onScreen) [x, y] = [area.x + area.width - W - 24, area.y + area.height - H - 24];
  widget = new BrowserWindow({
    width: W, height: H, x, y, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    hasShadow: true, skipTaskbar: true, show: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  if (isMac) widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  widget.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widget.once('ready-to-show', () => widget.showInactive());
  widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  widget.webContents.on('will-navigate', (e) => e.preventDefault());
  let t; widget.on('moved', () => { clearTimeout(t); t = setTimeout(() => { if (alive(widget)) { lib.settings.widgetPos = widget.getPosition(); save(); } }, 400); });
  widget.on('closed', () => { widget = null; });
}

function buildMenu() {
  if (!isMac) return;
  const send = (c) => { handlers.showMain(); setTimeout(() => alive(win) && win.webContents.send('cmd', c), alive(win) ? 0 : 900); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Game Launcher', submenu: [{ role: 'about', label: 'Über Game Launcher' }, { type: 'separator' }, { role: 'hide', label: 'Ausblenden' }, { role: 'hideOthers', label: 'Andere ausblenden' }, { type: 'separator' }, { role: 'quit', label: 'Beenden' }] },
    { label: 'Bibliothek', submenu: [{ label: 'Spiel hinzufügen …', accelerator: 'Cmd+N', click: () => send('add') }, { label: 'Suchen', accelerator: 'Cmd+F', click: () => send('search') }, { label: 'Einstellungen …', accelerator: 'Cmd+,', click: () => send('settings') }] },
    { label: 'Bearbeiten', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Fenster', submenu: [{ label: 'Bibliothek zeigen', accelerator: 'Cmd+1', click: () => handlers.showMain() }, { label: 'Widget zeigen', type: 'checkbox', checked: !!lib.settings.widget, accelerator: 'Cmd+Shift+W', click: (i) => handlers.setSettings({ widget: i.checked }) }, { type: 'separator' }, { role: 'minimize' }, { role: 'close' }, { role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
  ]));
}

app.whenReady().then(async () => {
  load();
  for (const [name, fn] of Object.entries(handlers)) ipcMain.handle(name, (_e, ...a) => fn(...a));
  buildMenu();
  if (lib.settings.widget) toggleWidget(true);
  // Beim Anmelden mit aktivem Widget nur das Widget zeigen
  const atLogin = isMac && app.getLoginItemSettings().wasOpenedAtLogin;
  appReady = true;
  if (openedByUrl) {
    // Vom Widget geweckt: nur den Auftrag ausführen, kein Fenster aufdrängen
    for (const u of urlQueue.splice(0)) await handleUrl(u);
    setTimeout(() => { if (!BrowserWindow.getAllWindows().length) app.quit(); }, 6000);
  } else if (!(atLogin && lib.settings.widget)) createWindow();
  // Icons der vorhandenen Apps einmalig nachladen
  (async () => { let ch = false; for (const g of lib.games) if (!g.icon) { try { await extractIcon(g); if (g.icon) ch = true; } catch {} } if (ch) { save(); push(); } })();
  app.on('activate', () => handlers.showMain());
});
app.on('window-all-closed', () => app.quit());
app.on('second-instance', () => handlers.showMain());
