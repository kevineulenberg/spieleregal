/* Spieleregal – Widget */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PLAY = '<svg viewBox="0 0 20 20" width="20" height="20"><path d="M6 3.500v13l10.500-6.500z" fill="currentColor"/></svg>';
function hue(g) {
  if (g.color) {
    const [r, gg, b] = g.color.map((v) => v / 255), max = Math.max(r, gg, b), min = Math.min(r, gg, b), d = max - min;
    if (d > 0.04) { const h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4; return Math.round((h * 60 + 360) % 360); }
  }
  let h = 0; for (const c of g.id) h = (h * 31 + c.charCodeAt(0)) % 360; return h;
}
let sig = '';
function render(state) {
  const played = state.games.filter((g) => g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  // Reicht der Verlauf nicht, füllen Favoriten und zuletzt hinzugefügte Spiele auf
  const rest = state.games.filter((g) => !g.lastPlayed).sort((a, b) => (b.favorite - a.favorite) || (b.addedAt - a.addedAt));
  const pool = [...played, ...rest];
  const list = []; let width = 0;
  for (const g of pool) {
    const w = 164 * (g.coverUrl ? Math.min(1.15, Math.max(0.62, g.ratio || 0.7)) : 0.7) + 14;
    if (width + w > 684) continue;
    list.push(g); width += w;
    if (list.length === 5) break;
  }
  $('#sub').textContent = played.length ? 'Zuletzt gespielt' : 'Deine Spiele';
  const next = list.map((g) => g.id + g.coverUrl).join('|');
  if (next === sig) return; sig = next;
  const lead = list[0];
  document.documentElement.style.setProperty('--h', lead ? hue(lead) : 268);
  $('#glow').style.backgroundImage = lead && lead.coverUrl ? `url("${lead.coverUrl}")` : 'none';
  $('#games').innerHTML = list.length ? list.map((g, i) => `<button class="g" data-id="${esc(g.id)}" title="${esc(g.title)} spielen" aria-label="${esc(g.title)} spielen" style="--i:${i};--ch:${hue(g)};--r:${g.coverUrl ? Math.min(1.15, Math.max(0.62, g.ratio || 0.7)) : 0.7}">${g.coverUrl ? `<img src="${esc(g.coverUrl)}" alt="" draggable="false">` : `<span class="ph">${esc(g.title)}</span>`}<span class="play"><i>${PLAY}</i></span></button>`).join('')
    : '<p class="empty">Noch keine Spiele im Regal. Öffne die Bibliothek und füge welche hinzu.</p>';
}
$('#games').addEventListener('click', async (e) => {
  const b = e.target.closest('.g'); if (!b || b.classList.contains('busy')) return;
  b.classList.add('busy');
  const r = await api.launch(b.dataset.id);
  setTimeout(() => b.classList.remove('busy'), 1800);
  if (!r.ok) { const m = document.createElement('div'); m.className = 'msg'; m.textContent = r.error || 'Start fehlgeschlagen'; $('.w').append(m); setTimeout(() => m.remove(), 6000); }
});
$('#open').onclick = () => api.showMain();
$('#hide').onclick = () => api.hideWidget();
api.on('state', render);
api.state().then(render);
