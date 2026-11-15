/* Spieleregal – Regal-Ansicht: Hüllen stehen mit dem Rücken nach vorn und lassen sich herausziehen */
const DVD = { kind: 'dvd', h: 1, d: 0.078, plastic: '#17171b', ink: '#fff' };
const BOX = { kind: 'box', h: 0.66, d: 0.155 };
// Maße relativ zur DVD-Hülle (19 cm hoch); Farben wie die echten Hüllen der jeweiligen Plattform
const CASES = {
  'Nintendo 64': BOX, 'SNES': BOX, 'NES': { kind: 'box', h: 0.93, d: 0.1 }, 'Mega Drive': { ...DVD, h: 0.93, d: 0.12 },
  'Game Boy': { kind: 'box', h: 0.66, d: 0.115 }, 'Game Boy Color': { kind: 'box', h: 0.66, d: 0.115 }, 'Game Boy Advance': { kind: 'box', h: 0.68, d: 0.115 },
  'Nintendo DS': { ...DVD, h: 0.66, d: 0.08 }, 'Nintendo 3DS': { ...DVD, h: 0.66, d: 0.07, plastic: '#eceef1', ink: '#23232a' },
  'GameCube': DVD, 'Wii': { ...DVD, plastic: '#eef0f3', ink: '#23232a' }, 'Wii U': { ...DVD, plastic: '#2f9fdc' },
  'PlayStation': { ...DVD, h: 0.66, d: 0.056, plastic: '#2b2b33' }, 'PlayStation 2': DVD, 'PlayStation 3': { ...DVD, h: 0.9, plastic: '#cfd5dc', ink: '#23232a' }, 'PSP': { ...DVD, h: 0.9, d: 0.07, plastic: '#d5dae0', ink: '#23232a' },
  'Xbox': { ...DVD, plastic: '#3c8c2b' }, 'Xbox 360': { ...DVD, plastic: '#86c552', ink: '#17250c' },
  'Dreamcast': { ...DVD, h: 0.66, d: 0.056, plastic: '#e9ebee', ink: '#23232a' }, 'Saturn': { ...DVD, h: 0.93, d: 0.09 },
};
let pulled = null;

function caseSpec(g, H) {
  const c = CASES[g.platform] || DVD;
  const h = Math.round(H * c.h), ratio = g.coverUrl ? Math.min(1.5, Math.max(0.62, g.ratio || 0.71)) : 0.71;
  // Rücken etwas kräftiger als maßstabsgetreu, damit Titel und Motiv lesbar bleiben
  const w = Math.round(h * ratio), d = Math.round(H * c.d * 1.6);
  return { ...c, h, w, d, slot: d + 2 };
}
function caseHtml(g, s) {
  const art = g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="" draggable="false">` : `<div class="ph"><b>${esc(g.title)}</b></div>`;
  return `<div class="case ${s.kind}${g.coverUrl ? ' art' : ''}" style="--w:${s.w}px;--h:${s.h}px;--d:${s.d}px;--ch:${hue(g)};--plastic:${s.plastic || '#111'};--ink:${s.ink || '#fff'}${g.coverUrl ? `;--art:url('${g.coverUrl.replace(/'/g, '%27')}')` : ''}">
    <div class="sway"><div class="front">${art}<i class="gloss"></i></div>
    <div class="spine"><span class="plat">${esc(SHORT[g.platform] || g.platform || '')}</span><span class="ttl">${esc(g.title)}</span></div>
    <div class="top"></div></div></div>`;
}
function shelfGames() {
  let g = platform ? S.games.filter((x) => x.platform === platform) : S.games;
  if (query) { const q = query.toLowerCase(); g = g.filter((x) => [x.title, x.platform, ...(x.genres || [])].join(' ').toLowerCase().includes(q)); }
  return g;
}
function renderShelf() {
  const el = $('#shelf'); if (!el) return;
  const games = shelfGames();
  const H = Math.round(Math.min(340, Math.max(210, innerHeight * 0.3)));
  const avail = Math.min(840, el.clientWidth - 2 * parseFloat(getComputedStyle(el).paddingLeft)) - 92;
  const groups = new Map();
  for (const g of games) groups.set(g.platform || '', [...(groups.get(g.platform || '') || []), g]);
  const ordered = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  // Gruppen auf Böden verteilen; zu breite Gruppen laufen auf dem nächsten Boden weiter
  // Böden gleichmäßig füllen statt den ersten voll und den letzten fast leer zu lassen
  const widths = ordered.map(([, list]) => list.reduce((n, g) => n + caseSpec(g, H).slot, 0) + 30);
  const total = widths.reduce((a, b) => a + b, 0), count = Math.max(1, Math.ceil(total / avail));
  const maxW = Math.min(avail, Math.max(total / count * 1.12, Math.min(avail, Math.max(...widths, 0))));
  const boards = [[]]; let used = 0;
  for (const [name, list] of ordered) {
    let part = [], width = 0;
    const flush = () => { if (part.length) { boards[boards.length - 1].push({ name, items: part }); used += width + 30; part = []; width = 0; } };
    const sorted = list.sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map((g) => ({ g, s: caseSpec(g, H) }));
    const total = sorted.reduce((n, x) => n + x.s.slot, 0);
    if (used && used + Math.min(total, maxW * 0.5) > maxW) { boards.push([]); used = 0; }
    for (const x of sorted) {
      if (used + width + x.s.slot > maxW && (part.length || used)) { flush(); boards.push([]); used = 0; }
      part.push(x); width += x.s.slot;
    }
    flush();
  }
  if (!games.length) { el.innerHTML = `<div class="empty-state">${S.games.length ? 'Kein Spiel passt zu dieser Auswahl.' : 'Dein Regal ist leer. Zieh eine App oder einen Ordner in dieses Fenster oder klick oben auf „Spiel hinzufügen“.'}</div>`; return; }
  let i = 0;
  el.innerHTML = `<div class="cabinet" style="--H:${H}px">${boards.filter((b) => b.length).map((b) => `<div class="board"><div class="lamp"></div><div class="stand">${b.map((grp) => `<div class="grp">${grp.items.map(({ g, s }) => `<button class="slot${g.missing ? ' lost' : ''}" data-id="${esc(g.id)}" style="--sw:${s.slot}px;--h:${s.h}px;--i:${i++}" aria-label="${esc(g.title)}" title="${esc(g.title)}">${caseHtml(g, s)}<i class="foot"></i></button>`).join('')}<span class="tag">${esc(SHORT[grp.name] || grp.name || 'Ohne Plattform')}</span></div>`).join('')}</div><div class="plank"></div></div>`).join('')}</div>`;
  el.classList.toggle('load', firstPaint);
}

/* ---------- Herausziehen ---------- */
const pullEl = $('#pull');
function pullOut(id) {
  const g = game(id), slot = $(`.slot[data-id="${CSS.escape(id)}"]`); if (!g || !slot || pulled) return;
  const H = parseFloat(getComputedStyle($('.cabinet')).getPropertyValue('--H')), s = caseSpec(g, H), r = slot.getBoundingClientRect();
  pulled = id; featured = id; document.documentElement.style.setProperty('--h', hue(g));
  const stage = $('.pull-stage', pullEl);
  stage.innerHTML = caseHtml(g, s);
  const c = $('.case', stage);
  const scale = Math.min(innerHeight * 0.6 / s.h, innerWidth * 0.36 / s.w, 2.2);
  const tx = innerWidth * 0.3 - (s.w * scale) / 2, ty = innerHeight * 0.5 - (s.h * scale) / 2 + 10;
  const sx = r.left, sy = r.bottom - s.h;
  c.style.cssText += `;position:fixed;left:0;top:0;margin:0;transform-origin:0 0;transition:none`;
  const T = (x, y, z, a, k) => `translate(${x}px, ${y}px) perspective(1500px) translateZ(${z}px) rotateY(${a}deg) scale(${k})`;
  slot.classList.add('gone');
  $('#p-title').textContent = g.title; $('#p-title').classList.toggle('long', g.title.length > 24);
  $('#p-desc').textContent = g.description || '';
  $('#p-meta').innerHTML = (g.platform ? `<span class="chip">${esc(g.platform)}</span>` : '') + (g.year ? `<span>${esc(g.year)}</span>` : '') + (g.genres || []).map((x) => `<span>${esc(x)}</span>`).join('') + (g.missing ? '<span class="chip warn">Nicht gefunden</span>' : '');
  $('#p-stats').textContent = g.playCount ? `${g.playCount}× gestartet, zuletzt ${ago(g.lastPlayed)}` : 'Noch nie gestartet';
  $('#p-fav').classList.toggle('on', !!g.favorite);
  pullEl.hidden = false; void pullEl.offsetWidth; pullEl.classList.add('on');
  const anim = c.animate([
    { transform: T(sx, sy, 0, 90, 1), offset: 0 },
    { transform: T(sx, sy - 4, 190, 66, 1), offset: 0.34, easing: 'cubic-bezier(.3,0,.2,1)' },
    { transform: T(tx, ty, 0, -14, scale), offset: 1 },
  ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1000, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
  anim.finished.then(() => { if (pulled === id) c.classList.add('idle'); }).catch(() => {});
  pullEl._back = { sx, sy, tx, ty, scale, T, slot, c };
  document.activeElement?.blur?.();
}
function pushBack(then) {
  const b = pullEl._back; if (!pulled || !b) return;
  b.c.classList.remove('idle'); pullEl.classList.remove('on');
  const anim = b.c.animate([
    { transform: b.T(b.tx, b.ty, 0, -14, b.scale), offset: 0 },
    { transform: b.T(b.sx, b.sy - 4, 190, 66, 1), offset: 0.66 },
    { transform: b.T(b.sx, b.sy, 0, 90, 1), offset: 1 },
  ], { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 620, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  const id = pulled;
  anim.finished.catch(() => {}).then(() => {
    pullEl.hidden = true; $('.pull-stage', pullEl).innerHTML = ''; pulled = null; pullEl._back = null;
    $$('.slot.gone').forEach((s) => s.classList.remove('gone'));
    const s = $(`.slot[data-id="${CSS.escape(id)}"]`); if (s) s.focus({ preventScroll: true });
    if (then) then();
  });
}
function refreshPulled() {
  if (!pulled) return; const g = game(pulled);
  if (!g) { pullEl.hidden = true; pullEl.classList.remove('on'); pulled = null; return; }
  $('#p-fav').classList.toggle('on', !!g.favorite);
  $('#p-stats').textContent = g.playCount ? `${g.playCount}× gestartet, zuletzt ${ago(g.lastPlayed)}` : 'Noch nie gestartet';
  const s = $(`.slot[data-id="${CSS.escape(pulled)}"]`); if (s) { s.classList.add('gone'); pullEl._back.slot = s; }
}

const shelfEl = $('#shelf');
shelfEl.addEventListener('click', (e) => { const s = e.target.closest('.slot'); if (s) pullOut(s.dataset.id); });
shelfEl.addEventListener('contextmenu', (e) => { const s = e.target.closest('.slot'); if (s) { e.preventDefault(); openMenu(s.dataset.id, e.clientX, e.clientY); } });
shelfEl.addEventListener('mouseover', (e) => { const s = e.target.closest('.slot'); if (s) document.documentElement.style.setProperty('--h', s.querySelector('.case').style.getPropertyValue('--ch')); });
pullEl.addEventListener('click', (e) => {
  if (e.target.closest('#p-play')) { const id = pulled; launch(id, $('.pull-stage .front', pullEl)); }
  else if (e.target.closest('#p-details')) { const id = pulled; pushBack(() => openDetails(id)); }
  else if (e.target.closest('#p-fav')) { const b = $('#p-fav'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); toggleFav(pulled); }
  else if (!e.target.closest('.pull-info') || e.target.closest('#p-close')) pushBack();
});
pullEl.addEventListener('mousemove', (e) => {
  const c = $('.pull-stage .sway', pullEl); if (!c) return;
  c.style.setProperty('--mx', ((e.clientX / innerWidth - 0.3) * 26).toFixed(1) + 'deg'); c.style.setProperty('--my', ((0.5 - e.clientY / innerHeight) * 10).toFixed(1) + 'deg');
});
// Tastatur im Regal: Pfeile wandern von Hülle zu Hülle, auch über Böden hinweg
function shelfKey(e) {
  if (pulled) {
    if (e.key === 'Escape') { pushBack(); return true; }
    if (e.key === 'Enter' && !pullEl.contains(document.activeElement)) { launch(pulled, $('.pull-stage .front', pullEl)); return true; }
    return e.key.startsWith('Arrow');
  }
  const all = $$('.slot', shelfEl); if (!all.length) return false;
  const cur = document.activeElement?.closest?.('.slot');
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') next = cur ? all[Math.max(0, Math.min(all.length - 1, all.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : -1)))] : all[0];
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!cur) next = all[0];
    else {
      const bs = $$('.board', shelfEl), bi = bs.indexOf(cur.closest('.board')) + (e.key === 'ArrowDown' ? 1 : -1), x = cur.getBoundingClientRect().left;
      if (bs[bi]) next = $$('.slot', bs[bi]).reduce((best, c) => { const d = Math.abs(c.getBoundingClientRect().left - x); return !best || d < best.d ? { c, d } : best; }, null)?.c;
    }
  } else if ((e.key === 'Enter' || e.key === ' ') && cur) { pullOut(cur.dataset.id); return true; }
  else return false;
  if (next) { next.focus({ focusVisible: true }); next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); document.documentElement.style.setProperty('--h', next.querySelector('.case').style.getPropertyValue('--ch')); }
  return true;
}
let shelfResize;
addEventListener('resize', () => { clearTimeout(shelfResize); shelfResize = setTimeout(() => { if (view === 'shelf' && !pulled) renderShelf(); }, 150); });
