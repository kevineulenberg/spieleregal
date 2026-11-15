/* Spieleregal – Oberfläche */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLAY = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 3.5v13l10.500-6.500z" fill="currentColor"/></svg>';
const HEART = '<svg class="heart" viewBox="0 0 20 20" width="18" height="18"><path d="M10 17s-6.500-3.900-6.500-8.600A3.600 3.600 0 0 1 10 6.300a3.600 3.600 0 0 1 6.500 2.100C16.500 13.100 10 17 10 17z" fill="currentColor"/></svg>';
const CHEV = (d) => `<svg viewBox="0 0 20 20" width="26" height="26"><path d="${d > 0 ? 'm7 3 7 7-7 7' : 'm13 3-7 7 7 7'}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let S = { games: [], settings: {}, platforms: [] };
let featured = null, query = '', platform = '', firstPaint = true, sheetId = null, hoverTimer = null;
const scroll = $('#scroll'), sheet = $('#sheet');

const game = (id) => S.games.find((g) => g.id === id);
const sortKey = (g) => g.title.replace(/^(the|der|die|das) /i, '').toLowerCase();
function hue(g) {
  if (g.color) {
    const [r, gg, b] = g.color.map((v) => v / 255), max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min;
    if (d > 0.04) { let h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4; return Math.round((h * 60 + 360) % 360); }
  }
  let h = 0; for (const c of g.id) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
}
function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 864e5);
  if (d < 1) return 'heute'; if (d < 2) return 'gestern'; if (d < 30) return `vor ${d} Tagen`; if (d < 365) return `vor ${Math.floor(d / 30)} Monaten`;
  return new Date(ts).toLocaleDateString('de-DE');
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; $('#toasts').append(t);
  setTimeout(() => { t.classList.add('bye'); setTimeout(() => t.remove(), 400); }, err ? 6000 : 3200);
}

/* ---------- Plattform-Filter ---------- */
const ICON = (d) => `<svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GLYPH = {
  all: '<rect x="3" y="3" width="5.500" height="5.500" rx="1.200"/><rect x="11.500" y="3" width="5.500" height="5.500" rx="1.200"/><rect x="3" y="11.500" width="5.500" height="5.500" rx="1.200"/><rect x="11.500" y="11.500" width="5.500" height="5.500" rx="1.200"/>',
  cartridge: '<path d="M4 4.500h12v9l-1.500 2h-9L4 13.500z"/><path d="M7 7.500h6v3H7zM7.500 15.500v-2M10 15.500v-2M12.500 15.500v-2"/>',
  handheld: '<rect x="2" y="5.500" width="16" height="9" rx="3"/><rect x="7" y="7.500" width="6" height="5" rx=".8"/><path d="M4.500 9v2M3.500 10h2"/><circle cx="15.500" cy="10" r=".7" fill="currentColor"/>',
  console: '<rect x="3" y="6" width="14" height="8.500" rx="1.800"/><path d="M6 10.200h5M4.500 16.500h3M12.500 16.500h3"/><circle cx="14" cy="10.200" r=".8" fill="currentColor"/>',
  disc: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="2"/><path d="M10 5.200A4.800 4.800 0 0 1 14.800 10"/>',
  monitor: '<rect x="2.500" y="3.500" width="15" height="10" rx="1.600"/><path d="M7 17h6M10 13.500V17"/>',
  laptop: '<rect x="4" y="4.500" width="12" height="8.500" rx="1.400"/><path d="M2 15.500h16"/>',
  gamepad: '<path d="M6 6.500h8a4 4 0 0 1 3.900 3.200l.5 2.600a2.100 2.100 0 0 1-3.700 1.700L13.500 12.500h-7L5.300 14a2.100 2.100 0 0 1-3.700-1.700l.5-2.600A4 4 0 0 1 6 6.500z"/><path d="M6.500 8.500v2.400M5.300 9.700h2.400"/><circle cx="13.500" cy="9.700" r=".7" fill="currentColor"/>',
};
function glyph(p) {
  if (/^(Nintendo 64|NES|SNES|Mega Drive)$/.test(p)) return GLYPH.cartridge;
  if (/Game Boy|DS$|PSP/.test(p)) return GLYPH.handheld;
  if (/PlayStation|Xbox/.test(p)) return GLYPH.disc;
  if (/GameCube|Wii|Dreamcast|Saturn/.test(p)) return GLYPH.console;
  if (/^(PC|DOS)$/.test(p)) return GLYPH.monitor;
  if (p === 'Mac') return GLYPH.laptop;
  return GLYPH.gamepad;
}
function renderFilters() {
  const counts = new Map();
  for (const g of S.games) if (g.platform) counts.set(g.platform, (counts.get(g.platform) || 0) + 1);
  if (platform && !counts.has(platform)) platform = '';
  const list = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const chip = (name, label, n, d) => `<button class="filter${platform === name ? ' on' : ''}" data-p="${esc(name)}" aria-pressed="${platform === name}">${ICON(d)}<span>${esc(label)}</span><small>${n}</small></button>`;
  const el = $('#filters');
  el.hidden = list.length < 2;
  el.innerHTML = chip('', 'Alle', S.games.length, GLYPH.all) + list.map(([p, n]) => chip(p, p, n, glyph(p))).join('');
}
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('.filter'); if (!b) return;
  platform = b.dataset.p; firstPaint = false;
  renderFilters(); renderRows();
  const first = $('.card', rows); if (first && !(game(featured) && (!platform || game(featured).platform === platform))) setFeatured(first.dataset.id);
});

/* ---------- Regale ---------- */
function shelves() {
  const g = platform ? S.games.filter((x) => x.platform === platform) : S.games, out = [];
  if (query) {
    const q = query.toLowerCase();
    const hit = g.filter((x) => [x.title, x.platform, ...(x.genres || [])].join(' ').toLowerCase().includes(q)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return [{ key: 'search', title: hit.length ? `Treffer für „${query}“` : `Nichts gefunden für „${query}“`, games: hit, grid: true }];
  }
  const recent = g.filter((x) => x.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 12);
  if (recent.length) out.push({ key: 'recent', title: 'Weiterspielen', games: recent });
  const fav = g.filter((x) => x.favorite);
  if (fav.length) out.push({ key: 'fav', title: 'Favoriten', games: fav });
  out.push({ key: 'all', title: platform || 'Alle Spiele', grid: !!platform, games: [...g].sort((a, b) => sortKey(a).localeCompare(sortKey(b))) });
  const groups = (field) => { const m = new Map(); for (const x of g) for (const v of [].concat(x[field] || [])) if (v) m.set(v, [...(m.get(v) || []), x]); return [...m].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length); };
  for (const [name, list] of groups('genres')) out.push({ key: 'g-' + name, title: name, games: list.sort((a, b) => (b.year || 0) - (a.year || 0)) });
  if (!platform) for (const [name, list] of groups('platform')) out.push({ key: 'p-' + name, title: name, games: list.sort((a, b) => (a.year || 0) - (b.year || 0)) });
  const fresh = [...g].sort((a, b) => b.addedAt - a.addedAt).slice(0, 10);
  if (g.length > 6 && fresh[0].addedAt - fresh[fresh.length - 1].addedAt > 60000) out.push({ key: 'new', title: 'Neu im Regal', games: fresh });
  return out;
}
function cardHtml(g) {
  const r = Math.min(1.5, Math.max(0.62, g.ratio || 0.7));
  const art = g.coverUrl ? `<img class="cover" src="${esc(g.coverUrl)}" alt="" draggable="false" loading="lazy">`
    : `<div class="ph">${g.iconUrl ? `<img src="${esc(g.iconUrl)}" alt="">` : ''}<b>${esc(g.title)}</b></div>`;
  return `<div class="card${g.id === featured ? ' sel' : ''}" role="button" tabindex="0" data-id="${esc(g.id)}" style="--r:${g.coverUrl ? r : 0.7};--ch:${hue(g)}" aria-label="${esc(g.title)}">
    <div class="face">${art}<div class="glare"></div>${g.favorite ? HEART : ''}${g.missing ? '<div class="lost">Nicht gefunden</div>' : ''}<button class="go" tabindex="-1" aria-label="${esc(g.title)} spielen">${PLAY}</button></div>
    <div class="name">${esc(g.title)}</div></div>`;
}
function renderRows() {
  const rows = $('#rows'), keep = {};
  $$('.row', rows).forEach((r) => (keep[r.dataset.key] = $('.track', r).scrollLeft));
  const list = shelves();
  if (!S.games.length) { rows.innerHTML = '<div class="empty-state">Dein Regal ist leer. Zieh eine App oder einen Ordner in dieses Fenster oder klick oben auf „Spiel hinzufügen“.</div>'; return; }
  rows.innerHTML = list.map((s, i) => `<div class="row${s.grid ? ' grid' : ''}" data-key="${esc(s.key)}" style="--i:${i}">
    <h2>${esc(s.title)}${s.key === 'search' ? '' : `<small>${s.games.length}</small>`}</h2>
    <button class="nav prev" tabindex="-1" aria-label="Zurück">${CHEV(-1)}</button><div class="track">${s.games.map(cardHtml).join('')}</div><button class="nav next" tabindex="-1" aria-label="Weiter">${CHEV(1)}</button></div>`).join('');
  $$('.row', rows).forEach((r) => { const t = $('.track', r); if (keep[r.dataset.key]) { t.style.scrollBehavior = 'auto'; t.scrollLeft = keep[r.dataset.key]; t.style.scrollBehavior = ''; } navState(r); t.addEventListener('scroll', () => navState(r), { passive: true }); });
  rows.classList.toggle('load', firstPaint);
}
function navState(r) {
  const t = $('.track', r);
  $('.prev', r).disabled = t.scrollLeft < 8; $('.next', r).disabled = t.scrollLeft + t.clientWidth > t.scrollWidth - 8;
}

/* ---------- Bühne ---------- */
let backdropFlip = false, shownCover = null;
function setFeatured(id, force) {
  const g = game(id) || S.games[0];
  if (!g) { $('#hero').hidden = true; return; }
  $('#hero').hidden = false;
  const changed = featured !== g.id;
  featured = g.id;
  $$('.card.sel').forEach((c) => c.classList.remove('sel'));
  $$(`.card[data-id="${CSS.escape(g.id)}"]`).forEach((c) => c.classList.add('sel'));
  document.documentElement.style.setProperty('--h', hue(g));
  if (changed || force) {
    $('#h-title').textContent = g.title; $('#h-title').classList.toggle('long', g.title.length > 24);
    $('#h-desc').textContent = g.description || (g.missing ? '' : 'Noch keine Beschreibung. Unter „Details“ kannst du eine ergänzen.');
    $('#h-meta').innerHTML = (g.iconUrl ? `<img src="${esc(g.iconUrl)}" alt="">` : '') + (g.platform ? `<span class="chip">${esc(g.platform)}</span>` : '') + (g.year ? `<span>${esc(g.year)}</span>` : '') + (g.genres || []).map((x) => `<span>${esc(x)}</span>`).join('') + (g.missing ? '<span class="chip warn">Nicht gefunden</span>' : '');
    $('#h-stats').textContent = g.playCount ? `${g.playCount}× gestartet, zuletzt ${ago(g.lastPlayed)}` : 'Noch nie gestartet';
    if (changed) { const t = $('.hero-text'); t.classList.remove('swap'); void t.offsetWidth; t.classList.add('swap'); }
  }
  $('#h-fav').classList.toggle('on', !!g.favorite);
  if (shownCover !== (g.coverUrl || g.id)) {
    shownCover = g.coverUrl || g.id;
    const box = $('#h-box'), img = $('#h-img');
    box.classList.toggle('empty', !g.coverUrl); img.hidden = !g.coverUrl;
    if (g.coverUrl) img.src = g.coverUrl;
    box.style.background = g.coverUrl ? '' : `linear-gradient(160deg, hsl(${hue(g)} 55% 34%), hsl(${hue(g) + 50} 60% 14%))`;
    box.classList.remove('flip'); void box.offsetWidth; box.classList.add('flip');
    const [a, b] = $$('.backdrop'); const on = backdropFlip ? a : b, off = backdropFlip ? b : a; backdropFlip = !backdropFlip;
    on.style.backgroundImage = g.coverUrl ? `url("${g.coverUrl}")` : 'none'; on.classList.add('on'); off.classList.remove('on');
  }
}

/* ---------- Starten ---------- */
let launching = false;
async function launch(id, from) {
  const g = game(id); if (!g || launching) return;
  launching = true; setFeatured(id);
  const L = $('#launch'), cov = $('.launch-cover', L), img = $('img', cov);
  const src = (from && from.getBoundingClientRect().width ? from : $('#h-box')).getBoundingClientRect();
  const ratio = g.coverUrl ? Math.min(1.5, Math.max(0.62, g.ratio || 0.7)) : 0.7;
  let h = Math.min(innerHeight * 0.52, 460), w = h * ratio; if (w > innerWidth * 0.6) { w = innerWidth * 0.6; h = w / ratio; }
  const x = (innerWidth - w) / 2, y = (innerHeight - h) / 2 - 30;
  img.hidden = !g.coverUrl; if (g.coverUrl) img.src = g.coverUrl;
  cov.style.background = g.coverUrl ? '' : `linear-gradient(160deg, hsl(${hue(g)} 55% 34%), hsl(${hue(g) + 50} 60% 14%))`;
  Object.assign(cov.style, { width: w + 'px', height: h + 'px', transition: 'none', transform: `translate(${src.left}px, ${src.top}px) scale(${src.width / w}, ${src.height / h})` });
  $('#launch-title').textContent = g.title;
  L.hidden = false; L.classList.remove('out'); void L.offsetWidth;
  cov.style.transition = ''; cov.style.transform = `translate(${x}px, ${y}px)`; L.classList.add('on');
  const started = Date.now();
  const res = await api.launch(id);
  const close = () => { L.classList.add('out'); setTimeout(() => { L.hidden = true; L.classList.remove('on', 'out'); launching = false; }, 520); };
  if (!res.ok) { close(); toast(res.error || 'Start fehlgeschlagen', true); return; }
  if (res.isFolder) toast('Der Ordner wurde geöffnet, weil darin keine App liegt. Unter „Details“ kannst du eine Startdatei festlegen.');
  setTimeout(close, Math.max(600, 2600 - (Date.now() - started)));
}

/* ---------- Detailfenster ---------- */
const field = (label, html, wide) => `<label class="field${wide ? ' wide' : ''}"><span>${label}</span>${html}</label>`;
function artHtml(g) {
  return `<div class="big">${g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="">` : `<div class="ph" style="--ch:${hue(g)}"><b>${esc(g.title)}</b></div>`}</div>
    <div class="acts"><button class="btn ghost" data-act="upload-cover">Eigenes Cover hochladen</button></div>
    <div class="iconline">${g.iconUrl ? `<img src="${esc(g.iconUrl)}" alt="">` : '<i></i>'}<span>Icon<br><button data-act="upload-icon">${g.iconUrl ? 'ändern' : 'hochladen'}</button></span></div>`;
}
function openDetails(id) {
  const g = game(id); if (!g) return;
  sheetId = id; sheet.className = '';
  sheet.innerHTML = `<div class="sheet-head"><h3>${esc(g.title)}</h3><button class="icon-btn" data-act="close" aria-label="Schließen"><svg viewBox="0 0 20 20" width="18" height="18"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>
  <div class="sheet-body"><div class="art" id="d-art">${artHtml(g)}</div>
    <div class="form">
      ${field('Titel', `<input name="title" value="${esc(g.title)}">`, true)}
      ${field('Plattform', `<select name="platform"><option value="">Keine Angabe</option>${S.platforms.map((p) => `<option${p === g.platform ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>`)}
      ${field('Jahr', `<input name="year" inputmode="numeric" maxlength="4" value="${esc(g.year || '')}">`)}
      ${field('Genres, mit Komma getrennt', `<input name="genres" value="${esc((g.genres || []).join(', '))}" placeholder="Rennspiele, Abenteuer">`, true)}
      ${field('Beschreibung', `<textarea name="description" rows="2">${esc(g.description || '')}</textarea>`, true)}
      <div class="finder"><h4>Cover suchen</h4>
        <div class="searchline"><input id="d-q" value="${esc(g.title)}" placeholder="Spieltitel"><button class="btn solid" data-act="search">Suchen</button></div>
        <div class="results" id="d-res"></div>
        <p class="hint" id="d-hint">Durchsucht ${S.settings.sgdbKey ? 'SteamGridDB, ' : ''}libretro-Boxarts, Steam und Wikipedia.${S.settings.sgdbKey ? '' : ' Mit einem SteamGridDB-Schlüssel in den Einstellungen findest du noch mehr.'}</p>
      </div>
      <div class="field wide"><span>Ort${g.missing ? ' – hier liegt nichts mehr' : ''}</span><div class="pathline"><code title="${esc(g.path)}">&lrm;${esc(g.path)}</code><button class="btn ghost" data-act="reveal"${g.missing ? ' disabled' : ''}>Im Finder zeigen</button><button class="btn ghost" data-act="repath">Ändern</button></div></div>
      <div class="field wide"><span>Startdatei</span><div class="pathline"><code id="d-target">&lrm;${esc(g.target || 'Automatisch')}</code><button class="btn ghost" data-act="target">Festlegen</button>${g.target ? '<button class="btn ghost" data-act="untarget">Automatisch</button>' : ''}</div><p class="hint">Nur nötig, wenn das Spiel ein Ordner ist und die falsche Datei startet.</p></div>
    </div></div>
  <div class="sheet-foot"><button class="btn danger" data-act="remove">Aus dem Regal nehmen</button><span class="grow"></span><button class="btn ghost" data-act="close">Fertig</button><button class="btn solid" data-act="play">${PLAY}Spielen</button></div>`;
  if (!sheet.open) { sheet.showModal(); sheet.focus(); }
  if (!g.coverUrl) searchCovers();
}
function saveForm() {
  if (!sheetId || sheet.classList.contains('small')) return;
  const v = (n) => $(`[name=${n}]`, sheet).value.trim();
  const year = parseInt(v('year'), 10);
  api.update(sheetId, { title: v('title') || game(sheetId).title, platform: v('platform'), year: year > 1950 && year < 2100 ? year : undefined, description: v('description'), genres: v('genres').split(',').map((s) => s.trim()).filter(Boolean) });
}
async function searchCovers() {
  const box = $('#d-res'), q = $('#d-q').value.trim(); if (!q) return;
  box.innerHTML = '<span class="hint"><i class="spinner"></i>Suche läuft</span>';
  const id = sheetId, r = await api.searchCovers(q, $('[name=platform]', sheet).value);
  if (sheetId !== id || !sheet.open) return;
  if (!r.results.length) { box.innerHTML = `<span class="hint">Kein Cover für „${esc(q)}“ gefunden. Versuch einen kürzeren Titel oder lade ein eigenes Bild hoch.</span>`; return; }
  box.innerHTML = r.results.map((c, i) => `<button class="res" style="animation-delay:${i * 30}ms" data-url="${esc(c.url)}" title="${esc(c.title)}"><img src="${esc(c.thumb)}" alt="${esc(c.title)}" loading="lazy"><span>${esc(c.source === 'libretro' ? c.label : c.source)}</span></button>`).join('');
}
async function setImage(kind, src) {
  const r = await api.setImage(sheetId, kind, src);
  if (!r.ok) toast(r.error || 'Das Bild konnte nicht übernommen werden', true); else toast(kind === 'icon' ? 'Icon geändert' : 'Cover geändert');
  return r.ok;
}
sheet.addEventListener('click', async (e) => {
  const res = e.target.closest('.res');
  if (res) { res.classList.add('busy'); await setImage('cover', res.dataset.url); res.classList.remove('busy'); return; }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  e.preventDefault();
  const id = sheetId;
  if (act === 'close') sheet.close();
  else if (act === 'play') { sheet.close(); launch(id); }
  else if (act === 'search') searchCovers();
  else if (act === 'reveal') api.reveal(id);
  else if (act === 'upload-cover' || act === 'upload-icon') { const f = await api.pickImage(); if (f) setImage(act.endsWith('icon') ? 'icon' : 'cover', f); }
  else if (act === 'repath' || act === 'target') { const f = await api.pickTarget(id); if (f) { saveForm(); await api.update(id, act === 'repath' ? { path: f } : { target: f }); openDetails(id); } }
  else if (act === 'untarget') { saveForm(); await api.update(id, { target: '' }); openDetails(id); }
  else if (act === 'remove') {
    const b = e.target.closest('button');
    if (b.dataset.sure) { const t = game(id).title; sheetId = null; sheet.close(); await api.remove(id); toast(`„${t}“ aus dem Regal genommen`); }
    else { b.dataset.sure = 1; b.textContent = 'Wirklich entfernen? Das Spiel selbst bleibt erhalten'; setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'Aus dem Regal nehmen'; } }, 4000); }
  }
  else if (act === 'save-settings') { await api.setSettings({ sgdbKey: $('#s-key').value.trim() }); sheet.close(); toast('Einstellungen gespeichert'); }
  else if (act === 'fetch-missing') { const b = e.target.closest('button'); b.disabled = true; b.innerHTML = '<i class="spinner"></i>Lade Cover'; const n = await api.fetchMissing(); b.disabled = false; b.textContent = 'Fehlende Cover jetzt laden'; toast(n ? `${n} Cover geladen` : 'Keine neuen Cover gefunden'); }
  else if (act === 'link') api.openExternal(e.target.closest('[data-href]').dataset.href);
});
sheet.addEventListener('error', (e) => { if (e.target.closest?.('.res')) e.target.closest('.res').remove(); }, true);
sheet.addEventListener('change', (e) => { if (e.target.name) saveForm(); });
sheet.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'd-q') { e.preventDefault(); searchCovers(); } });
sheet.addEventListener('close', () => { if (sheetId) saveForm(); sheetId = null; });
sheet.addEventListener('mousedown', (e) => { if (e.target === sheet) sheet.close(); });

function openSettings() {
  sheetId = null; sheet.className = 'small';
  const missing = S.games.filter((g) => !g.coverUrl).length;
  sheet.innerHTML = `<div class="sheet-head"><h3>Einstellungen</h3><button class="icon-btn" data-act="close" aria-label="Schließen"><svg viewBox="0 0 20 20" width="18" height="18"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></button></div>
  <div class="sheet-body"><div class="form" style="grid-template-columns:1fr">
    ${field('SteamGridDB-Schlüssel', `<input id="s-key" type="password" value="${esc(S.settings.sgdbKey || '')}" placeholder="Optional">`)}
    <p class="hint">Neue Spiele bekommen ihr Cover automatisch aus libretro-Boxarts, Steam und Wikipedia. SteamGridDB hat die größte Auswahl an hochauflösenden Covern, braucht aber einen kostenlosen Schlüssel: <a data-act="link" data-href="https://www.steamgriddb.com/profile/preferences/api">steamgriddb.com öffnen</a>, anmelden und den API-Schlüssel hier einfügen.</p>
    <div><button class="btn ghost" data-act="fetch-missing">Fehlende Cover jetzt laden</button> <span class="hint">${missing ? `${missing} Spiele ohne Cover` : 'Alle Spiele haben ein Cover'}</span></div>
    <p class="hint">Bedienung: Pfeiltasten wählen, Eingabe startet, Leertaste öffnet Details, F markiert als Favorit. Ein Gamepad funktioniert ebenfalls.</p>
  </div></div>
  <div class="sheet-foot"><span class="grow"></span><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn solid" data-act="save-settings">Speichern</button></div>`;
  if (!sheet.open) { sheet.showModal(); sheet.focus(); }
}

/* ---------- Kontextmenü ---------- */
const menu = $('#menu');
function openMenu(id, x, y) {
  const g = game(id);
  menu.innerHTML = `<button data-m="play">Spielen</button><button data-m="details">Details und Cover</button><button data-m="fav">${g.favorite ? 'Kein Favorit mehr' : 'Als Favorit markieren'}</button><button data-m="reveal">Im Finder zeigen</button><hr><button class="danger" data-m="remove">Aus dem Regal nehmen</button>`;
  menu.hidden = false; menu.dataset.id = id;
  menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 10) + 'px'; menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 10) + 'px';
}
menu.addEventListener('click', async (e) => {
  const m = e.target.dataset.m, id = menu.dataset.id; menu.hidden = true; if (!m) return;
  if (m === 'play') launch(id, $(`.card[data-id="${CSS.escape(id)}"] .face`));
  else if (m === 'details') openDetails(id);
  else if (m === 'fav') toggleFav(id);
  else if (m === 'reveal') api.reveal(id);
  else if (m === 'remove') { const t = game(id).title; await api.remove(id); toast(`„${t}“ aus dem Regal genommen`); }
});
addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
addEventListener('blur', () => (menu.hidden = true));
function toggleFav(id) { const g = game(id); if (g) api.update(id, { favorite: !g.favorite }); }

/* ---------- Karten: Maus ---------- */
const rows = $('#rows');
rows.addEventListener('click', (e) => {
  const nav = e.target.closest('.nav');
  if (nav) { const t = $('.track', nav.parentNode); t.scrollBy({ left: (nav.classList.contains('next') ? 1 : -1) * t.clientWidth * 0.8 }); return; }
  const card = e.target.closest('.card'); if (!card) return;
  if (e.target.closest('.go')) launch(card.dataset.id, $('.face', card)); else { setFeatured(card.dataset.id); scroll.scrollTo({ top: 0, behavior: 'smooth' }); }
});
rows.addEventListener('dblclick', (e) => { const c = e.target.closest('.card'); if (c && !e.target.closest('.go')) launch(c.dataset.id, $('.face', c)); });
rows.addEventListener('contextmenu', (e) => { const c = e.target.closest('.card'); if (c) { e.preventDefault(); setFeatured(c.dataset.id); openMenu(c.dataset.id, e.clientX, e.clientY); } });
rows.addEventListener('mousemove', (e) => {
  const c = e.target.closest('.card'); if (!c) return;
  const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  c.style.setProperty('--ty', ((px - 0.5) * 14).toFixed(1) + 'deg'); c.style.setProperty('--tx', ((0.5 - py) * 12).toFixed(1) + 'deg');
  c.style.setProperty('--gx', px * 100 + '%'); c.style.setProperty('--gy', py * 100 + '%');
});
rows.addEventListener('mouseover', (e) => {
  const c = e.target.closest('.card'); clearTimeout(hoverTimer);
  if (c && c.dataset.id !== featured) hoverTimer = setTimeout(() => setFeatured(c.dataset.id), 420);
});
rows.addEventListener('mouseout', (e) => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) { clearTimeout(hoverTimer); c.style.setProperty('--tx', '0deg'); c.style.setProperty('--ty', '0deg'); } });
rows.addEventListener('focusin', (e) => { const c = e.target.closest('.card'); if (c && c.matches(':focus-visible')) setFeatured(c.dataset.id); });

/* ---------- Bühne: Bedienung ---------- */
$('#h-play').onclick = () => launch(featured);
$('#h-details').onclick = () => openDetails(featured);
$('#h-fav').onclick = (e) => { const b = e.currentTarget; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); toggleFav(featured); };
$('#h-box').onclick = () => openDetails(featured);
$('#hero').addEventListener('mousemove', (e) => {
  const px = e.clientX / innerWidth - 0.5, py = e.clientY / innerHeight - 0.5, b = $('#h-box');
  b.style.setProperty('--ry', (-20 + px * 16).toFixed(1) + 'deg'); b.style.setProperty('--rx', (4 - py * 10).toFixed(1) + 'deg'); b.style.setProperty('--sx', (30 + px * 80).toFixed(0) + '%');
});
$('#add').onclick = async () => { const ids = await api.pickGames(); if (ids.length) afterAdd(ids); };
$('#settings').onclick = openSettings;
const qInput = $('#q');
qInput.addEventListener('input', () => { query = qInput.value.trim(); firstPaint = false; renderRows(); if (query) { const first = $('.card', rows); if (first) setFeatured(first.dataset.id); } });
scroll.addEventListener('scroll', () => $('.bar').classList.toggle('solid', scroll.scrollTop > 40), { passive: true });

/* ---------- Tastatur und Gamepad ---------- */
function move(dx, dy) {
  const cur = document.activeElement?.closest?.('.card') || $(`.card.sel`, rows) || $('.card', rows); if (!cur) return;
  let next = cur;
  if (!document.activeElement?.closest?.('.card')) next = cur;
  else if (dx) { const all = $$('.card', cur.parentNode), i = all.indexOf(cur) + dx; next = all[Math.max(0, Math.min(all.length - 1, i))]; if (cur.closest('.grid') && !next) next = cur; }
  else {
    const rs = $$('.row', rows), ri = rs.indexOf(cur.closest('.row')) + dy;
    if (ri < 0) { scroll.scrollTo({ top: 0 }); return; }
    const row = rs[Math.min(rs.length - 1, ri)], x = cur.getBoundingClientRect().left + cur.offsetWidth / 2;
    next = $$('.card', row).reduce((best, c) => { const d = Math.abs(c.getBoundingClientRect().left + c.offsetWidth / 2 - x); return !best || d < best.d ? { c, d } : best; }, null)?.c || cur;
  }
  next.focus({ preventScroll: true, focusVisible: true });
  setFeatured(next.dataset.id);
  const t = next.parentNode, r = next.getBoundingClientRect(), pad = parseFloat(getComputedStyle(t).paddingLeft);
  if (r.left < pad) t.scrollBy({ left: r.left - pad - 20 }); else if (r.right > innerWidth - pad) t.scrollBy({ left: r.right - innerWidth + pad + 20 });
  const row = next.closest('.row').getBoundingClientRect();
  if (row.bottom > innerHeight - 10) scroll.scrollBy({ top: row.bottom - innerHeight + 30 }); else if (row.top < 80) scroll.scrollBy({ top: row.top - 100 });
}
addEventListener('keydown', (e) => {
  if (!menu.hidden && e.key === 'Escape') { menu.hidden = true; return; }
  if (sheet.open || launching) return;
  const typing = document.activeElement === qInput;
  if (e.key === 'Escape' && typing) { qInput.value = ''; qInput.dispatchEvent(new Event('input')); qInput.blur(); return; }
  if (typing && !['ArrowDown', 'Enter'].includes(e.key)) return;
  const k = e.key;
  if (k === 'ArrowRight') move(1, 0); else if (k === 'ArrowLeft') move(-1, 0); else if (k === 'ArrowDown') { if (typing) qInput.blur(); move(0, 1); } else if (k === 'ArrowUp') move(0, -1);
  else if (k === 'Enter') { const c = document.activeElement?.closest?.('.card'); if (typing) { qInput.blur(); move(0, 0); return; } if (c) launch(c.dataset.id, $('.face', c)); else if (document.activeElement === document.body) launch(featured); else return; }
  else if (k === ' ') { if (document.activeElement?.tagName === 'BUTTON') return; openDetails(featured); }
  else if (k.toLowerCase() === 'f' && !e.metaKey) toggleFav(featured);
  else if (k === '/') qInput.focus();
  else return;
  e.preventDefault();
});
let padPrev = {}, padAt = 0;
function pollPad(ts) {
  const p = [...(navigator.getGamepads?.() || [])].find(Boolean);
  if (p && document.hasFocus()) {
    const ax = p.axes, b = (i) => p.buttons[i]?.pressed;
    const now = { l: b(14) || ax[0] < -0.6, r: b(15) || ax[0] > 0.6, u: b(12) || ax[1] < -0.6, d: b(13) || ax[1] > 0.6, a: b(0), y: b(3), x: b(2), bk: b(1) };
    const hit = (k) => now[k] && (!padPrev[k] || (ts - padAt > 190 && 'lrud'.includes(k)));
    const key = (k) => dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    if (sheet.open) { if (now.bk && !padPrev.bk) sheet.close(); }
    else if (hit('l')) { key('ArrowLeft'); padAt = ts; } else if (hit('r')) { key('ArrowRight'); padAt = ts; } else if (hit('u')) { key('ArrowUp'); padAt = ts; } else if (hit('d')) { key('ArrowDown'); padAt = ts; }
    else if (hit('a')) launch(featured, $(`.card.sel .face`)); else if (hit('y')) openDetails(featured); else if (hit('x')) toggleFav(featured);
    padPrev = now;
  }
  requestAnimationFrame(pollPad);
}
requestAnimationFrame(pollPad);

/* ---------- Ziehen und Ablegen ---------- */
let dragDepth = 0;
const isImage = (f) => /\.(png|jpe?g|webp|gif|tiff?|heic|bmp|icns)$/i.test(f.name);
addEventListener('dragenter', (e) => { if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); dragDepth++; const d = $('#drop'); d.hidden = false; $('strong', d).textContent = sheetId ? 'Loslassen als neues Cover' : 'Loslassen zum Hinzufügen'; $('span', d).textContent = sheetId ? 'PNG, JPG oder WebP' : 'Apps, Ordner oder Startdateien'; });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  if (sheetId) { const img = files.find(isImage); if (img) setImage('cover', api.pathFor(img)); else toast('Hier kannst du ein Bild als Cover ablegen', true); return; }
  if (sheet.open) return;
  const ids = await api.addPaths(files.map((f) => api.pathFor(f)).filter(Boolean));
  if (ids.length) afterAdd(ids); else toast('Das liegt schon im Regal');
});
function afterAdd(ids) {
  toast(ids.length === 1 ? `„${game(ids[0])?.title}“ hinzugefügt. Cover wird gesucht` : `${ids.length} Spiele hinzugefügt. Cover werden gesucht`);
  setFeatured(ids[0]);
  const c = $(`.row[data-key="all"] .card[data-id="${CSS.escape(ids[0])}"]`); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
}

/* ---------- Zustand ---------- */
function apply(state) {
  S = state;
  renderFilters();
  renderRows();
  setFeatured(game(featured) ? featured : (S.games.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0] || S.games[Math.floor(Math.random() * S.games.length)])?.id, true);
  if (sheetId && sheet.open) { const g = game(sheetId); if (g) { $('#d-art').innerHTML = artHtml(g); } }
  if (firstPaint) setTimeout(() => { firstPaint = false; rows.classList.remove('load'); }, 2000);
}
api.on('state', apply);
api.on('toast', (m) => toast(m));
api.on('cmd', async (c) => { if (c === 'add') { if (!sheet.open) $('#add').click(); } else if (c === 'search') qInput.focus(); else if (c === 'settings') openSettings(); });
api.state().then(apply);
