// Cover-Quellen: SteamGridDB (mit API-Key), libretro-Thumbnails, Steam, Wikipedia
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const UA = 'GameLauncher/1.0 (private Spiele-Mediathek)';
const SYSTEMS = {
  'Nintendo 64': 'Nintendo - Nintendo 64', 'GameCube': 'Nintendo - GameCube', 'Wii': 'Nintendo - Wii', 'Wii U': 'Nintendo - Wii U',
  'Game Boy': 'Nintendo - Game Boy', 'Game Boy Color': 'Nintendo - Game Boy Color', 'Game Boy Advance': 'Nintendo - Game Boy Advance',
  'Nintendo DS': 'Nintendo - Nintendo DS', 'Nintendo 3DS': 'Nintendo - Nintendo 3DS', 'NES': 'Nintendo - Nintendo Entertainment System',
  'SNES': 'Nintendo - Super Nintendo Entertainment System', 'PlayStation': 'Sony - PlayStation', 'PlayStation 2': 'Sony - PlayStation 2',
  'PlayStation 3': 'Sony - PlayStation 3', 'PSP': 'Sony - PlayStation Portable', 'Xbox': 'Microsoft - Xbox', 'Xbox 360': 'Microsoft - Xbox 360',
  'Dreamcast': 'Sega - Dreamcast', 'Mega Drive': 'Sega - Mega Drive - Genesis', 'Saturn': 'Sega - Saturn', 'DOS': 'DOS',
};
const PLATFORMS = ['Mac', 'PC', ...Object.keys(SYSTEMS)];
// Wenn die Plattform unbekannt ist, werden diese Sammlungen durchsucht
// (viele Mac-Apps sind Ports oder Emulator-Bündel von Konsolenspielen)
const DEFAULT_SYSTEMS = ['Nintendo 64', 'GameCube', 'PlayStation 2', 'Xbox', 'Wii', 'Wii U', 'SNES', 'PlayStation', 'Dreamcast', 'Game Boy Advance', 'Xbox 360', 'PlayStation 3'];

const tokens = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’!]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((t) => t && !['the', 'a', 'of', 'and'].includes(t));

async function getJson(url, headers = {}) {
  const ctl = AbortSignal.timeout(12000);
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctl });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ---- libretro ---- */
const memo = {};
async function libretroIndex(system) {
  if (memo[system]) return memo[system];
  const dir = path.join(app.getPath('userData'), 'cache');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, system.replace(/[^a-z0-9]+/gi, '_') + '.json');
  try {
    if (Date.now() - fs.statSync(file).mtimeMs < 14 * 864e5) return (memo[system] = JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {}
  const r = await fetch(`https://thumbnails.libretro.com/${encodeURIComponent(system)}/Named_Boxarts/`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('libretro HTTP ' + r.status);
  const html = await r.text();
  const names = [...html.matchAll(/href="([^"?]+\.png)"/g)].map((m) => decodeURIComponent(m[1]));
  fs.writeFileSync(file, JSON.stringify(names));
  return (memo[system] = names);
}
function rank(names, query) {
  const q = tokens(query);
  if (!q.length) return [];
  const out = [];
  for (const name of names) {
    const base = name.replace(/\.png$/, '');
    const title = base.replace(/\s*\(.*$/, '');
    // „Legend of Zelda, The - …“ → normale Wortfolge
    const t = tokens(title.replace(/^(.*?), (The|A|An)\b/, '$2 $1'));
    const hit = q.filter((x) => t.includes(x)).length;
    if (hit < Math.ceil(q.length * 0.75)) continue;
    let score = hit / q.length * 10 - (t.length - hit) * 1.2;
    if (/\(USA|\(World|\(Europe/.test(base)) score += 1;
    if (/\(USA/.test(base)) score += 0.3;
    if (/Demo|Beta|Proto|Kiosk|Unl\)|Rev \d|Action Replay|Greatest Hits|Player's Choice/i.test(base)) score -= 2;
    out.push({ name, title: base, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
async function libretro(query, platform, limit) {
  const list = SYSTEMS[platform] ? [platform] : DEFAULT_SYSTEMS;
  const all = await Promise.all(list.map(async (p) => {
    try {
      const names = await libretroIndex(SYSTEMS[p]);
      return rank(names, query).slice(0, limit).map((r) => {
        const u = `https://thumbnails.libretro.com/${encodeURIComponent(SYSTEMS[p])}/Named_Boxarts/${encodeURIComponent(r.name)}`;
        return { source: 'libretro', label: p, title: r.title, url: u, thumb: u, score: r.score };
      });
    } catch { return []; }
  }));
  return all.flat().sort((a, b) => b.score - a.score).slice(0, limit * 2);
}

/* ---- SteamGridDB ---- */
async function steamGridDb(query, key, limit) {
  if (!key) return [];
  const h = { Authorization: 'Bearer ' + key };
  const s = await getJson('https://www.steamgriddb.com/api/v2/search/autocomplete/' + encodeURIComponent(query), h);
  const games = (s.data || []).slice(0, 2);
  const out = [];
  for (const g of games) {
    const r = await getJson(`https://www.steamgriddb.com/api/v2/grids/game/${g.id}?dimensions=600x900,660x930&mimes=image/png,image/jpeg&types=static&nsfw=false`, h);
    for (const i of (r.data || []).slice(0, limit)) out.push({ source: 'SteamGridDB', label: g.name, title: g.name, url: i.url, thumb: i.thumb || i.url, year: g.release_date ? new Date(g.release_date * 1000).getFullYear() : undefined });
  }
  return out;
}

/* ---- Steam ---- */
async function steam(query, limit) {
  const j = await getJson('https://store.steampowered.com/api/storesearch/?cc=de&l=german&term=' + encodeURIComponent(query));
  const q = tokens(query);
  const items = (j.items || []).filter((i) => i.type === 'app' && q.every((t) => tokens(i.name).includes(t))).slice(0, limit);
  const out = [];
  await Promise.all(items.map(async (i) => {
    const url = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${i.id}/library_600x900_2x.jpg`;
    try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); if (r.ok) out.push({ source: 'Steam', label: 'Steam', title: i.name, url, thumb: url.replace('_2x', '') }); } catch {}
  }));
  return out;
}

/* ---- Wikipedia ---- */
async function wikipedia(query, limit) {
  const u = 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrlimit=6&prop=pageimages|description&piprop=original&pilicense=any&format=json&gsrsearch=' + encodeURIComponent(query + ' video game');
  const j = await getJson(u);
  const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  const q = tokens(query);
  return pages.filter((p) => p.original && p.original.width / p.original.height < 1.7 && /game/i.test(p.description || '') && q.filter((t) => tokens(p.title).includes(t)).length >= Math.ceil(q.length * 0.6))
    .sort((x, y) => Math.abs(tokens(x.title.replace(/\(.*\)/, '')).length - q.length) - Math.abs(tokens(y.title.replace(/\(.*\)/, '')).length - q.length))
    .slice(0, limit).map((p) => ({ source: 'Wikipedia', label: 'Wikipedia', title: p.title, url: p.original.source, thumb: p.original.source, year: +(/(\d{4})/.exec(p.description || '') || [])[1] || undefined }));
}

async function search(query, platform, key, { quick } = {}) {
  query = (query || '').trim();
  if (!query) return [];
  const limit = quick ? 2 : 8;
  const safe = (p) => p.catch(() => []);
  const [a, b, c, d] = await Promise.all([safe(steamGridDb(query, key, limit)), safe(libretro(query, platform, limit)), safe(steam(query, limit)), safe(wikipedia(query, limit))]);
  // Reihenfolge: beste Qualität zuerst. Bei PC/Mac ist Steam treffsicherer als Konsolen-Boxart.
  return (platform === 'PC' || platform === 'Mac' || !platform) ? [...a, ...c, ...b, ...d] : [...a, ...b, ...c, ...d];
}

module.exports = { search, PLATFORMS, UA };
