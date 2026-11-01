/* Pannello admin RagePad. Parla con server/api/admin.php: ogni rotta è protetta lato server (solo developer).
 * Il token sta in sessionStorage e viaggia solo nell'header Authorization. */
(() => {
  'use strict';
  const API = location.hostname === '127.0.0.1' || location.hostname === 'localhost'
    ? (new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8898/api/index.php')
    : 'https://soundboard.athost.it/team/api/index.php';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
  const when = (ms) => (ms ? new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const ago = (ms) => { if (!ms) return 'mai'; const m = Math.round((Date.now() - ms) / 60000); if (m < 2) return 'adesso'; if (m < 60) return `${m} min fa`; const h = Math.round(m / 60); if (h < 48) return `${h} ore fa`; return `${Math.round(h / 24)} giorni fa`; };
  const ROLE = { owner: 'Capo 👑', admin: 'Admin', mod: 'Moderatore', member: 'Membro' };
  const REASON = { copyright: 'Copyright', offensive: 'Offensivo', illegal: 'Illegale/privacy', other: 'Altro' };

  let token = sessionStorage.getItem('adminToken') || '';
  let stats = null;
  const state = { view: 'oggi', q: '', filter: '', page: 0 };
  let qTimer = null;
  let audioUrl = null;

  // ---------- rete ----------
  async function api(route, body, { blob = false, auth = true } = {}) {
    const headers = {};
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !blob) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${API}?r=${route}`, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (blob) { if (!res.ok) throw new Error(`File non disponibile (HTTP ${res.status})`); return res.blob(); }
    let data; const txt = await res.text();
    try { data = JSON.parse(txt); } catch { throw new Error(`Risposta strana dal server (HTTP ${res.status})`); }
    if (!res.ok || data.error) {
      if (data.code === 'noauth') { logout(); }
      throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code });
    }
    return data;
  }
  const toast = (msg, bad = false) => { const t = $('#toast'); t.textContent = msg; t.className = `toast ${bad ? 'bad' : ''}`; clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), bad ? 6000 : 3000); };
  async function act(fn, ok) { try { const r = await fn(); if (ok) toast(ok); return r; } catch (err) { toast(err.message, true); return null; } }

  // ---------- accesso ----------
  function logout() { token = ''; sessionStorage.removeItem('adminToken'); $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#lgErr').textContent = '';
    try {
      const r = await api('auth/login', { email: $('#lgEmail').value.trim(), password: $('#lgPass').value, device: 'Pannello admin (browser)', accept: $('#lgAccept').checked }, { auth: false });
      token = r.token; sessionStorage.setItem('adminToken', token);
      await enter();
    } catch (err) {
      if (err.code === 'terms') $('#lgTermsRow').classList.remove('hidden');
      $('#lgErr').textContent = err.message;
    }
  });
  $('#logout').addEventListener('click', async () => { await act(() => api('auth/logout', {})); logout(); });

  async function enter() {
    try { const me = await api('admin/me'); $('#meName').textContent = me.name; }
    catch (err) { logout(); $('#lgErr').textContent = err.code === 'forbidden' ? 'Questo account non è tra i developer: niente pannello.' : err.message; return; }
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    refreshStats();
    route();
  }
  async function refreshStats() {
    stats = await api('admin/stats').catch(() => null);
    if (!stats) return;
    document.querySelectorAll('[data-cnt]').forEach((el) => { const v = stats[el.dataset.cnt]; el.textContent = v ? String(v) : ''; });
    if (state.view === 'oggi') renderOggi();
  }

  // ---------- navigazione ----------
  const VIEWS = {
    oggi: { title: 'Oggi', search: false },
    utenti: { title: 'Utenti', search: 'Nome o email…', filters: [['', 'Tutti'], ['blocked', 'Bloccati'], ['unconfirmed', 'Email non confermata']] },
    gruppi: { title: 'Gruppi', search: 'Nome o codice…' },
    audio: { title: 'Audio', search: 'Suono, autore o gruppo…', filters: [['', 'Tutti'], ['reported', '🚩 Segnalati'], ['hidden', 'Nascosti'], ['big', 'Più pesanti']] },
    immagini: { title: 'Immagini', search: 'Nome o gruppo…' },
    segnalazioni: { title: 'Segnalazioni 🚩', search: false },
    feedback: { title: 'Feedback 🐞', search: false, filters: [['open', 'Aperte'], ['done', 'Risolte'], ['all', 'Tutte']] },
    antispam: { title: 'Anti-spam', search: false },
    impostazioni: { title: 'Impostazioni', search: false },
    registro: { title: 'Registro delle azioni', search: false },
  };
  function route() {
    const v = location.hash.replace('#', '').split('/')[0] || 'oggi';
    if (!VIEWS[v]) { location.hash = '#oggi'; return; }
    if (v !== state.view) { state.q = ''; state.filter = VIEWS[v].filters ? VIEWS[v].filters[0][0] : ''; state.page = 0; $('#q').value = ''; }
    state.view = v;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
    $('#title').textContent = VIEWS[v].title;
    $('#searchBox').classList.toggle('hidden', !VIEWS[v].search);
    if (VIEWS[v].search) $('#q').placeholder = VIEWS[v].search;
    $('#filters').innerHTML = (VIEWS[v].filters || []).map(([k, n]) => `<button type="button" class="btn small ${state.filter === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
    $('#pager').classList.add('hidden');
    load();
    const sub = location.hash.split('/')[1];
    if (sub) openDetail(v, Number(sub));
  }
  window.addEventListener('hashchange', route);
  $('#q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = $('#q').value.trim(); state.page = 0; load(); }, 250); });
  $('#filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; state.filter = b.dataset.f; state.page = 0; document.querySelectorAll('#filters .btn').forEach((x) => x.classList.toggle('on', x === b)); load(); });
  $('#reload').addEventListener('click', () => { refreshStats(); load(); });
  $('#prev').addEventListener('click', () => { if (state.page > 0) { state.page--; load(); } });
  $('#next').addEventListener('click', () => { state.page++; load(); });
  $('#content').addEventListener('click', (e) => {
    const row = e.target.closest('tr.row');
    if (row && !e.target.closest('button, a, audio')) { location.hash = `#${state.view}/${row.dataset.id}`; return; }
    const b = e.target.closest('[data-act]');
    if (b) handleAction(b, e);
  });

  function pager(total) {
    const pages = Math.max(1, Math.ceil(total / 50));
    $('#pager').classList.toggle('hidden', pages <= 1);
    $('#pageInfo').textContent = `pagina ${state.page + 1} di ${pages} · ${total} in tutto`;
    $('#prev').disabled = state.page === 0; $('#next').disabled = state.page >= pages - 1;
  }
  const empty = (msg) => `<div class="empty">${msg}</div>`;

  async function load() {
    const c = $('#content');
    const v = state.view;
    try {
      if (v === 'oggi') { if (!stats) stats = await api('admin/stats'); renderOggi(); return; }
      if (v === 'utenti') { const r = await api('admin/users', { q: state.q, filter: state.filter, page: state.page }); pager(r.total); c.innerHTML = r.items.length ? usersTable(r.items) : empty('Nessun utente trovato.'); return; }
      if (v === 'gruppi') { const r = await api('admin/teams', { q: state.q, page: state.page }); pager(r.total); c.innerHTML = r.items.length ? teamsTable(r.items) : empty('Nessun gruppo trovato.'); return; }
      if (v === 'audio') { const r = await api('admin/sounds', { q: state.q, filter: state.filter, page: state.page }); pager(r.total); c.innerHTML = r.items.length ? soundsTable(r.items) : empty('Nessun suono trovato.'); return; }
      if (v === 'immagini') { const r = await api('admin/media', { q: state.q, page: state.page }); pager(r.total); c.innerHTML = r.items.length ? mediaTable(r.items) : empty('Nessuna immagine.'); loadThumbs(); return; }
      if (v === 'segnalazioni') { const r = await api('admin/reports'); c.innerHTML = r.items.length ? reportsTable(r.items) : empty('Nessuna segnalazione aperta 🎉'); return; }
      if (v === 'feedback') { const r = await api('feedback/list', { status: state.filter || 'open' }); c.innerHTML = r.items.length ? feedbackList(r.items) : empty('Niente qui.'); return; }
      if (v === 'antispam') { const r = await api('admin/limits'); c.innerHTML = limitsView(r); return; }
      if (v === 'impostazioni') { const r = await api('admin/settings'); c.innerHTML = settingsView(r); return; }
      if (v === 'registro') { const r = await api('admin/log', { page: state.page }); $('#pager').classList.remove('hidden'); $('#pageInfo').textContent = `pagina ${state.page + 1}`; $('#prev').disabled = state.page === 0; $('#next').disabled = r.items.length < 50; c.innerHTML = r.items.length ? logTable(r.items) : empty('Nessuna azione registrata.'); }
    } catch (err) { c.innerHTML = empty(`⚠ ${esc(err.message)}`); }
  }

  // ---------- viste ----------
  function renderOggi() {
    const s = stats; if (!s) return;
    const tile = (n, label, hot = false) => `<div class="tile ${hot && n ? 'hot' : ''}"><b>${n}</b><span>${label}</span></div>`;
    $('#content').innerHTML = `
      <div class="tiles">
        ${tile(s.users, `account (${s.usersOk} confermati)`)}${tile(s.usersDay, 'nuovi nelle 24 ore')}${tile(s.activeDay, 'attivi nelle 24 ore')}${tile(s.blocked, 'bloccati', true)}
        ${tile(s.teams, `gruppi (+${s.teamsWeek} questa settimana)`)}${tile(s.sounds, `suoni (+${s.soundsWeek} questa settimana)`)}${tile(s.soundsHidden, 'suoni nascosti')}${tile(s.media, 'immagini')}
        ${tile(mb(s.storageBytes), 'spazio sul disco')}${tile(s.reportsOpen, 'segnalazioni 🚩', true)}${tile(s.feedbackOpen, 'feedback aperti 🐞', true)}${tile(s.limitsBlocked, 'in cooldown anti-spam', true)}
      </div>
      <h3 style="margin-bottom:10px">Ultime cose successe</h3>
      <ul class="timeline">${s.recent.map((r) => `<li><time>${when(r.at)}</time><a href="#${{ user: 'utenti', team: 'gruppi', sound: 'audio', report: 'segnalazioni', feedback: 'feedback' }[r.kind]}${['user', 'team', 'sound'].includes(r.kind) ? '/' + r.id : ''}">${esc(r.text)}</a></li>`).join('')}</ul>`;
  }
  const userTag = (u) => (u.blockedAt ? '<span class="tag bad">bloccato</span>' : !u.emailOk ? '<span class="tag warn">email da confermare</span>' : '<span class="tag ok">ok</span>') + (u.developer ? ' <span class="tag dev">dev</span>' : '');
  const usersTable = (items) => `<table><thead><tr><th>Nome</th><th>Email</th><th class="num">Gruppi</th><th class="num">Suoni</th><th>Ultimo accesso</th><th>Stato</th></tr></thead><tbody>${items.map((u) => `
    <tr class="row" data-id="${u.id}"><td><b>${esc(u.name)}</b><span class="sub">dal ${when(u.createdAt)}</span></td><td>${esc(u.email)}</td><td class="num">${u.groups}</td><td class="num">${u.sounds}<span class="sub">${mb(u.bytes)}</span></td><td>${ago(u.lastSeen)}</td><td>${userTag(u)}</td></tr>`).join('')}</tbody></table>`;
  const teamIcon = (t) => `<span class="ic" ${t.color ? `style="--g:${esc(t.color)}"` : ''}>${esc(t.icon || '👥')}</span>`;
  const teamsTable = (items) => `<table><thead><tr><th>Gruppo</th><th>Codice</th><th>Capo</th><th class="num">Persone</th><th class="num">Suoni</th><th class="num">Spazio</th><th>Attività</th></tr></thead><tbody>${items.map((t) => `
    <tr class="row" data-id="${t.id}"><td>${teamIcon(t)}<b>${esc(t.name)}</b>${t.pending ? ` <span class="tag warn">${t.pending} in attesa</span>` : ''}</td><td><code>${esc(t.code)}</code></td><td>${esc(t.owner || '—')}<span class="sub">${esc(t.ownerEmail || '')}</span></td><td class="num">${t.members}</td><td class="num">${t.sounds}</td><td class="num">${mb(t.bytes + t.mediaBytes)}</td><td>${ago(t.lastSeen)}</td></tr>`).join('')}</tbody></table>`;
  const soundRow = (s) => `<tr class="row" data-id="${s.id}"><td><button type="button" class="btn small" data-act="play" data-id="${s.id}" title="Ascolta">▶</button></td><td><b>${esc(s.emoji ? s.emoji + ' ' : '')}${esc(s.name)}</b><span class="sub">${esc(s.ext)} · ${mb(s.size)}${s.trimStart != null || s.trimEnd != null ? ' · tagliato' : ''}</span></td><td>${esc(s.owner || '—')}<span class="sub">${esc(s.ownerEmail || '')}</span></td><td><a href="#gruppi/${s.teamId}">${esc(s.team)}</a></td><td class="num">${s.reactions || ''}</td><td>${s.reports ? `<span class="tag bad">🚩 ${s.reports}</span>` : ''} ${s.hidden ? '<span class="tag warn">nascosto</span>' : ''}</td><td>${when(s.createdAt)}</td></tr>`;
  const soundsTable = (items) => `<table><thead><tr><th></th><th>Suono</th><th>Caricato da</th><th>Gruppo</th><th class="num">❤</th><th>Stato</th><th>Quando</th></tr></thead><tbody>${items.map(soundRow).join('')}</tbody></table>`;
  const mediaTable = (items) => `<table><thead><tr><th></th><th>Immagine</th><th>Gruppo</th><th>Caricata da</th><th class="num">Peso</th><th></th></tr></thead><tbody>${items.map((m) => `
    <tr data-id="${m.id}"><td><img class="thumb" data-media="${m.id}" alt=""></td><td><b>${esc(m.name)}</b><span class="sub">${m.width}×${m.height} ${esc(m.ext)}</span></td><td><a href="#gruppi/${m.teamId}">${esc(m.team)}</a></td><td>${esc(m.owner || '—')}</td><td class="num">${mb(m.size)}</td><td><button type="button" class="btn small danger" data-act="media-delete" data-id="${m.id}" data-name="${esc(m.name)}">Elimina</button></td></tr>`).join('')}</tbody></table>`;
  async function loadThumbs() {
    for (const img of document.querySelectorAll('img[data-media]')) {
      try { const b = await api(`admin/media-file&id=${img.dataset.media}`, undefined, { blob: true }); img.src = URL.createObjectURL(b); } catch { /* resta vuota */ }
    }
  }
  const reportsTable = (items) => `<table><thead><tr><th>Quando</th><th>Suono</th><th>Motivo</th><th>Segnalato da</th><th>Azioni</th></tr></thead><tbody>${items.map((r) => `
    <tr data-id="${r.id}"><td>${when(r.createdAt)}</td><td><button type="button" class="btn small" data-act="play" data-id="${r.soundId}" title="Ascolta">▶</button> <a href="#audio/${r.soundId}"><b>${esc(r.sound || 'suono eliminato')}</b></a>${r.hidden ? ' <span class="tag warn">nascosto</span>' : ''}<span class="sub">di ${esc(r.owner || '—')} in «${esc(r.team)}»</span></td><td><span class="tag">${REASON[r.reason] || esc(r.reason)}</span>${r.note ? `<span class="sub">«${esc(r.note)}»</span>` : ''}</td><td>${esc(r.reporter || '—')}</td>
    <td class="actions"><button type="button" class="btn small" data-act="report" data-id="${r.id}" data-do="dismiss">Ignora</button><button type="button" class="btn small" data-act="report" data-id="${r.id}" data-do="hide">Nascondi suono</button><button type="button" class="btn small danger" data-act="report" data-id="${r.id}" data-do="delete" data-name="${esc(r.sound || '')}">Elimina suono</button></td></tr>`).join('')}</tbody></table>`;
  const feedbackList = (items) => `<ul class="list" style="gap:10px">${items.map((f) => `<li style="flex-direction:column;align-items:stretch;gap:6px" data-id="${f.id}">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="tag ${f.kind === 'bug' ? 'bad' : f.kind === 'idea' ? 'ok' : ''}">${{ bug: '🐞 problema', idea: '💡 idea', other: '💬 altro' }[f.kind] || esc(f.kind)}</span><b>${esc(f.name || 'anonimo')}</b><span class="hint">${esc(f.email || f.contact || '')} · v${esc(f.appVersion || '?')} · ${esc(f.os || '')} · ${when(f.createdAt)}</span><span class="sp"></span>${f.done ? `<span class="tag ok">risolta${f.thanked ? ' · ringraziato' : ''}</span>` : ''}</div>
    <pre>${esc(f.text)}</pre>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><label style="flex:1;min-width:220px">Risposta / nota<textarea rows="2" data-note="${f.id}">${esc(f.note || '')}</textarea></label>
      <button type="button" class="btn small" data-act="fb-note" data-id="${f.id}">Salva nota</button>
      ${f.done ? `<button type="button" class="btn small ghost" data-act="fb-done" data-id="${f.id}" data-done="0">Riapri</button>` : `<button type="button" class="btn small primary" data-act="fb-done" data-id="${f.id}" data-done="1" title="${f.canThank ? 'Manda anche la mail di ringraziamento con la nota' : ''}">✓ Risolta${f.canThank ? ' + grazie' : ''}</button>`}
      <button type="button" class="btn small danger ghost" data-act="fb-delete" data-id="${f.id}">Elimina</button></div></li>`).join('')}</ul>`;
  const limitsView = (r) => `${r.items.length ? `<table><thead><tr><th>Chi · pulsante</th><th class="num">Colpi</th><th class="num">Infrazioni</th><th>Fermo fino a</th><th></th></tr></thead><tbody>${r.items.map((l) => `
    <tr><td><code>${esc(l.key)}</code></td><td class="num">${l.hits}</td><td class="num">${l.strikes}</td><td>${l.blockedUntil > Date.now() ? `<span class="tag bad">${when(l.blockedUntil)}</span>` : '<span class="hint">libero</span>'}</td><td><button type="button" class="btn small" data-act="limit-clear" data-key="${esc(l.key)}">Sblocca</button></td></tr>`).join('')}</tbody></table>
    <p style="margin-top:12px"><button type="button" class="btn small danger ghost" data-act="limit-clear" data-key="*">Azzera tutti i contatori</button></p>` : empty('Nessuno in cooldown e nessuna infrazione recente.')}
    <h3 style="margin:24px 0 8px">Limiti attivi (al minuto, in finestra)</h3>
    <table><thead><tr><th>Pulsante</th><th class="num">Massimo</th><th class="num">Finestra</th></tr></thead><tbody>${Object.entries(r.rules).map(([k, [n, s]]) => `<tr><td><code>${esc(k)}</code></td><td class="num">${n}</td><td class="num">${s >= 3600 ? `${s / 3600} h` : s >= 60 ? `${s / 60} min` : `${s} s`}</td></tr>`).join('')}</tbody></table>`;
  const settingsView = (r) => `<p class="hint">Questi limiti vincono su config.php. Lascia vuoto per tornare al valore predefinito. Developer con accesso al pannello: <b>${r.developers.map(esc).join(', ')}</b> (si cambiano in config.php).</p>
    <div class="form" id="settingsForm">${r.items.map((s) => `<label>${esc(s.label)} <small>(predefinito ${s.default}, da ${s.min} a ${s.max})</small><input type="number" min="${s.min}" max="${s.max}" data-key="${s.key}" value="${s.saved ? s.value : ''}" placeholder="${s.value}"></label>`).join('')}</div>
    <p style="margin-top:14px"><button type="button" class="btn primary" data-act="settings-save">Salva impostazioni</button></p>`;
  const logTable = (items) => `<table><thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Su</th><th>Dettagli</th></tr></thead><tbody>${items.map((l) => `<tr><td>${when(l.at)}</td><td>${esc(l.admin)}</td><td><code>${esc(l.action)}</code></td><td>${esc(l.target || '')}</td><td class="hint">${esc(l.detail || '')}</td></tr>`).join('')}</tbody></table>`;

  // ---------- scheda di dettaglio ----------
  const drawer = $('#drawer');
  function closeDrawer() { drawer.classList.add('hidden'); stopAudio(); if (location.hash.includes('/')) history.replaceState(null, '', location.hash.split('/')[0]); }
  $('#drawerClose').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.classList.contains('hidden')) closeDrawer(); });
  drawer.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) handleAction(b, e); });
  function showDrawer(title, html) { $('#drawerTitle').textContent = title; $('#drawerBody').innerHTML = html; drawer.classList.remove('hidden'); }

  async function openDetail(view, id) {
    try {
      if (view === 'utenti') return userDetail(await api('admin/user', { id }));
      if (view === 'gruppi') return teamDetail(await api('admin/team', { id }));
      if (view === 'audio') { const r = await api('admin/sounds', { q: '', page: 0, filter: '' }); const s = r.items.find((x) => x.id === id) || (await api('admin/sound-file&id=' + id, undefined, { blob: true }), null); return soundDetail(s || { id }); }
    } catch (err) { toast(err.message, true); }
  }
  function userDetail(d) {
    const u = d.user;
    showDrawer(u.name, `
      <dl class="kv"><dt>Email</dt><dd>${esc(u.email)} ${userTag(u)}</dd><dt>Iscritto</dt><dd>${when(u.createdAt)}</dd><dt>Ultimo accesso</dt><dd>${ago(u.lastSeen)}</dd><dt>Diritti sui suoni</dt><dd>${u.rightsAt ? 'dichiarati il ' + when(u.rightsAt) : 'non ancora'}</dd><dt>Termini</dt><dd>${esc(u.termsVersion || 'da accettare')}</dd>${u.blockedAt ? `<dt>Bloccato</dt><dd>${when(u.blockedAt)}${u.blockedReason ? ` — «${esc(u.blockedReason)}»` : ''}</dd>` : ''}${d.cloud && d.cloud.size ? `<dt>Backup cloud</dt><dd>${mb(d.cloud.size)} · ${when(d.cloud.updatedAt || d.cloud.at)}</dd>` : ''}</dl>
      <div class="sec"><h3>Gruppi (${d.groups.length})</h3><ul class="list">${d.groups.map((g) => `<li><a href="#gruppi/${g.teamId}">${esc(g.team)}</a> <span class="tag">${ROLE[g.role] || g.role}</span>${g.muted ? '<span class="tag warn">bloccato nel gruppo</span>' : ''}${g.pending ? '<span class="tag warn">in attesa</span>' : ''}<span class="hint">come «${esc(g.name)}» · ${ago(g.lastSeen)}</span><span class="sp"></span><button type="button" class="btn small ghost" data-act="user" data-id="${u.id}" data-do="leave" data-member="${g.memberId}" data-name="${esc(g.team)}">Fai uscire</button></li>`).join('') || '<li class="hint">In nessun gruppo</li>'}</ul></div>
      <div class="sec"><h3>Suoni caricati (${d.sounds.length})</h3><ul class="list">${d.sounds.slice(0, 30).map((s) => `<li><button type="button" class="btn small" data-act="play" data-id="${s.id}">▶</button> <b>${esc(s.name)}</b><span class="hint">${esc(s.team)} · ${mb(s.size)}${s.reports ? ' · 🚩 ' + s.reports : ''}${s.hidden ? ' · nascosto' : ''}</span><span class="sp"></span><a href="#audio/${s.id}">apri</a></li>`).join('') || '<li class="hint">Nessuno</li>'}</ul><div id="player"></div></div>
      <div class="sec"><h3>Dispositivi collegati (${d.sessions.length})</h3><ul class="list">${d.sessions.map((s) => `<li>${esc(s.device)}<span class="hint">${ago(s.lastSeen)}</span></li>`).join('') || '<li class="hint">Nessuno</li>'}</ul></div>
      ${d.bans.length ? `<div class="sec"><h3>Ban e sospensioni</h3><ul class="list">${d.bans.map((b) => `<li>${esc(b.team)} <span class="tag ${b.active ? 'bad' : ''}">${b.until === null ? 'per sempre' : b.active ? 'fino al ' + when(b.until) : 'finita'}</span><span class="hint">${esc(b.reason || '')} · da ${esc(b.by)}</span></li>`).join('')}</ul></div>` : ''}
      <div class="sec"><h3>Azioni</h3><div class="actions">
        <button type="button" class="btn small" data-act="user" data-id="${u.id}" data-do="rename" data-name="${esc(u.name)}">✏ Rinomina</button>
        ${u.emailOk ? '' : `<button type="button" class="btn small" data-act="user" data-id="${u.id}" data-do="confirm">✓ Conferma email</button>`}
        <button type="button" class="btn small" data-act="user" data-id="${u.id}" data-do="logout">Scollega tutti i dispositivi</button>
        ${u.blockedAt ? `<button type="button" class="btn small primary" data-act="user" data-id="${u.id}" data-do="unblock">Sblocca</button>` : `<button type="button" class="btn small danger" data-act="user" data-id="${u.id}" data-do="block" data-name="${esc(u.name)}">⛔ Blocca ovunque</button>`}
      </div></div>
      <div class="sec danger-zone"><h3>Zona pericolosa</h3><div class="actions">
        <button type="button" class="btn small danger ghost" data-act="user" data-id="${u.id}" data-do="delete-sounds" data-name="${esc(u.name)}" data-n="${d.sounds.length}">Elimina tutti i suoi suoni</button>
        <button type="button" class="btn small danger" data-act="user" data-id="${u.id}" data-do="delete" data-name="${esc(u.name)}">💣 Elimina account</button>
      </div></div>`);
  }
  function teamDetail(d) {
    const t = d.team;
    showDrawer(`${t.icon || '👥'} ${t.name}`, `
      <dl class="kv"><dt>Codice</dt><dd><code>${esc(t.code)}</code></dd><dt>Creato</dt><dd>${when(t.createdAt)}</dd><dt>Capo</dt><dd>${esc(t.owner || '—')} <span class="hint">${esc(t.ownerEmail || '')}</span></dd><dt>Spazio</dt><dd>${t.sounds} suoni (${mb(t.bytes)}) · ${t.media} immagini (${mb(t.mediaBytes)})</dd><dt>Ingressi</dt><dd>${t.approval ? 'da approvare' : 'liberi con il codice'}</dd></dl>
      <div class="sec"><h3>Persone (${d.members.length})</h3><ul class="list">${d.members.map((m) => `<li><span class="tag ${m.online ? 'ok' : ''}">${m.online ? 'online' : ago(m.lastSeen)}</span><b>${esc(m.name)}</b><span class="hint">${esc(m.email || 'senza account')}</span><span class="tag">${ROLE[m.role] || m.role}</span>${m.muted ? '<span class="tag warn">bloccato</span>' : ''}${m.pending ? '<span class="tag warn">in attesa</span>' : ''}<span class="sp"></span>
        ${m.userId ? `<a href="#utenti/${m.userId}">scheda</a>` : ''}
        ${m.pending ? `<button type="button" class="btn small primary" data-act="team" data-id="${t.id}" data-do="approve" data-member="${m.memberId}">Accetta</button>` : ''}
        ${m.role !== 'owner' ? `<select data-role="${m.memberId}" title="Ruolo"><option value="member" ${m.role === 'member' ? 'selected' : ''}>Membro</option><option value="mod" ${m.role === 'mod' ? 'selected' : ''}>Moderatore</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option></select>
          <button type="button" class="btn small ghost" data-act="team" data-id="${t.id}" data-do="owner" data-member="${m.memberId}" data-name="${esc(m.name)}" title="Diventa il capo">👑</button>` : ''}
        <button type="button" class="btn small ghost" data-act="team" data-id="${t.id}" data-do="${m.muted ? 'unmute' : 'mute'}" data-member="${m.memberId}">${m.muted ? '🔊' : '🔇'}</button>
        ${m.role !== 'owner' ? `<button type="button" class="btn small danger ghost" data-act="team" data-id="${t.id}" data-do="kick" data-member="${m.memberId}" data-name="${esc(m.name)}">Espelli</button>` : ''}</li>`).join('')}</ul></div>
      <div class="sec"><h3>Suoni (${d.sounds.length})</h3><ul class="list">${d.sounds.slice(0, 50).map((s) => `<li><button type="button" class="btn small" data-act="play" data-id="${s.id}">▶</button> <b>${esc(s.name)}</b><span class="hint">di ${esc(s.owner || '—')} · ${mb(s.size)}${s.reports ? ' · 🚩 ' + s.reports : ''}${s.hidden ? ' · nascosto' : ''}</span><span class="sp"></span><a href="#audio/${s.id}">apri</a></li>`).join('') || '<li class="hint">Nessuno</li>'}${d.sounds.length > 50 ? `<li class="hint">… e altri ${d.sounds.length - 50}: <a href="#audio" data-team="${t.id}">vedi in Audio</a></li>` : ''}</ul><div id="player"></div></div>
      ${d.bans.length ? `<div class="sec"><h3>Ban (${d.bans.length})</h3><ul class="list">${d.bans.map((b) => `<li><b>${esc(b.name)}</b><span class="tag ${b.active ? 'bad' : ''}">${b.until === null ? 'per sempre' : b.active ? 'fino al ' + when(b.until) : 'finita'}</span><span class="hint">${esc(b.reason || '')} · da ${esc(b.by)}${b.hiddenSounds ? ` · ${b.hiddenSounds} audio nascosti` : ''}</span><span class="sp"></span><button type="button" class="btn small" data-act="team" data-id="${t.id}" data-do="unban" data-ban="${b.id}">Sblocca</button></li>`).join('')}</ul></div>` : ''}
      <div class="sec"><h3>Azioni</h3><div class="actions">
        <button type="button" class="btn small" data-act="team" data-id="${t.id}" data-do="rename" data-name="${esc(t.name)}">✏ Rinomina</button>
        <button type="button" class="btn small" data-act="team" data-id="${t.id}" data-do="regen">🔄 Nuovo codice</button>
      </div></div>
      <div class="sec danger-zone"><h3>Zona pericolosa</h3><div class="actions"><button type="button" class="btn small danger" data-act="team" data-id="${t.id}" data-do="delete" data-name="${esc(t.name)}">💣 Elimina il gruppo per tutti</button></div></div>`);
    drawer.querySelectorAll('select[data-role]').forEach((sel) => sel.addEventListener('change', async () => { await act(() => api('admin/team-action', { id: t.id, action: 'role', memberId: Number(sel.dataset.role), role: sel.value }), 'Ruolo cambiato'); }));
  }
  function soundDetail(s) {
    if (!s.name) { showDrawer('Suono', '<p class="hint">Non trovato nell\'elenco corrente: cercalo in Audio.</p>'); return; }
    showDrawer(`${s.emoji || '🔊'} ${s.name}`, `
      <div id="player"></div>
      <dl class="kv"><dt>Gruppo</dt><dd><a href="#gruppi/${s.teamId}">${esc(s.team)}</a></dd><dt>Caricato da</dt><dd>${esc(s.owner || '—')} ${s.ownerUserId ? `<a href="#utenti/${s.ownerUserId}">scheda</a>` : ''}<span class="hint"> ${esc(s.ownerEmail || '')}</span></dd><dt>File</dt><dd>${esc(s.ext)} · ${mb(s.size)}</dd><dt>Quando</dt><dd>${when(s.createdAt)}</dd><dt>Reazioni</dt><dd>${s.reactions}</dd><dt>Segnalazioni</dt><dd>${s.reports ? `🚩 ${s.reports} <button type="button" class="btn small ghost" data-act="sound" data-id="${s.id}" data-do="clear-reports">Azzera</button>` : 'nessuna'}</dd><dt>Stato</dt><dd>${s.hidden ? '<span class="tag warn">nascosto a tutti</span>' : '<span class="tag ok">visibile</span>'}</dd></dl>
      <div class="sec"><h3>Azioni</h3><div class="actions">
        <button type="button" class="btn small" data-act="play" data-id="${s.id}">▶ Ascolta</button>
        <button type="button" class="btn small" data-act="sound" data-id="${s.id}" data-do="rename" data-name="${esc(s.name)}">✏ Rinomina</button>
        <button type="button" class="btn small" data-act="sound" data-id="${s.id}" data-do="${s.hidden ? 'show' : 'hide'}">${s.hidden ? '👁 Rendi visibile' : '🙈 Nascondi a tutti'}</button>
        <button type="button" class="btn small danger" data-act="sound" data-id="${s.id}" data-do="delete" data-name="${esc(s.name)}">🗑 Elimina per tutti</button>
      </div></div>`);
    playSound(s.id);
  }

  // ---------- ascolto ----------
  function stopAudio() { document.querySelectorAll('audio').forEach((a) => { a.pause(); a.remove(); }); if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; } }
  async function playSound(id) {
    stopAudio();
    const host = drawer.classList.contains('hidden') ? null : $('#player');
    try {
      const b = await api(`admin/sound-file&id=${id}`, undefined, { blob: true });
      audioUrl = URL.createObjectURL(b);
      const a = document.createElement('audio'); a.controls = true; a.autoplay = true; a.src = audioUrl;
      if (host) host.replaceChildren(a); else { a.style.position = 'fixed'; a.style.left = '20px'; a.style.bottom = '20px'; a.style.width = '360px'; a.style.zIndex = '30'; document.body.appendChild(a); }
    } catch (err) { toast(err.message, true); }
  }

  // ---------- azioni ----------
  async function handleAction(b, e) {
    e.preventDefault(); e.stopPropagation();
    const id = Number(b.dataset.id); const d = b.dataset;
    const reloadAll = () => { refreshStats(); load(); };
    switch (d.act) {
      case 'play': return playSound(id);
      case 'user': {
        const body = { id, action: d.do };
        if (d.do === 'rename') { const n = prompt('Nuovo nome:', d.name); if (!n) return; body.name = n; }
        if (d.do === 'block') { const r = prompt(`Bloccare «${d.name}» ovunque? Non potrà più entrare da nessun computer. Motivo (facoltativo, lo vedrà):`); if (r === null) return; body.reason = r; body.hideSounds = confirm('Nascondere anche tutti i suoni che ha caricato?'); }
        if (d.do === 'unblock') body.showSounds = confirm('Rendere di nuovo visibili i suoi suoni nascosti?');
        if (d.do === 'leave') { if (!confirm(`Far uscire l'utente da «${d.name}»?`)) return; body.memberId = Number(d.member); }
        if (d.do === 'delete-sounds' && !confirm(`Eliminare per sempre i ${d.n} suoni caricati da «${d.name}», da tutti i gruppi?`)) return;
        if (d.do === 'delete') { if (!confirm(`Eliminare l'account di «${d.name}»? Esce da tutti i gruppi, spariscono email, nome, dispositivi e backup. Non si torna indietro.`)) return; body.withSounds = confirm('Eliminare ANCHE i suoni e le immagini che ha caricato? (Annulla = restano ai gruppi, senza il suo nome)'); }
        const r = await act(() => api('admin/user-action', body), 'Fatto');
        if (!r) return;
        if (r.deleted) { closeDrawer(); reloadAll(); return; }
        openDetail('utenti', id); load(); refreshStats(); return;
      }
      case 'team': {
        const body = { id, action: d.do };
        if (d.member) body.memberId = Number(d.member);
        if (d.ban) body.banId = Number(d.ban);
        if (d.do === 'rename') { const n = prompt('Nuovo nome del gruppo:', d.name); if (!n) return; body.name = n; }
        if (d.do === 'regen' && !confirm('Nuovo codice? Quello vecchio smette di funzionare.')) return;
        if (d.do === 'owner' && !confirm(`Passare il ruolo di capo a «${d.name}»? Il capo attuale diventa admin.`)) return;
        if (d.do === 'kick' && !confirm(`Espellere «${d.name}» dal gruppo? Potrà rientrare con il codice.`)) return;
        if (d.do === 'delete' && !confirm(`Eliminare «${d.name}» PER TUTTI? Suoni, immagini e membri spariscono. Non si torna indietro.`)) return;
        const r = await act(() => api('admin/team-action', body), 'Fatto');
        if (!r) return;
        if (r.deleted) { closeDrawer(); reloadAll(); return; }
        openDetail('gruppi', id); load(); return;
      }
      case 'sound': {
        const body = { id, action: d.do };
        if (d.do === 'rename') { const n = prompt('Nuovo nome:', d.name); if (!n) return; body.name = n; }
        if (d.do === 'delete' && !confirm(`Eliminare «${d.name}» per tutti? Sparisce dal gruppo e dal server.`)) return;
        const r = await act(() => api('admin/sound-action', body), 'Fatto');
        if (!r) return;
        if (r.deleted) { closeDrawer(); reloadAll(); return; }
        soundDetail(r.sound); load(); return;
      }
      case 'media-delete': if (!confirm(`Eliminare l'immagine «${d.name}» per tutti?`)) return; if (await act(() => api('admin/media-action', { id, action: 'delete' }), 'Immagine eliminata')) reloadAll(); return;
      case 'report': {
        if (d.do === 'delete' && !confirm(`Eliminare il suono «${d.name}» per tutti e chiudere la segnalazione?`)) return;
        if (await act(() => api('admin/report-action', { id, action: d.do }), 'Segnalazione chiusa')) reloadAll(); return;
      }
      case 'fb-note': { const note = $(`textarea[data-note="${id}"]`).value; if (await act(() => api('feedback/update', { id, note }), 'Nota salvata')) load(); return; }
      case 'fb-done': { const note = $(`textarea[data-note="${id}"]`)?.value; if (await act(() => api('feedback/update', { id, done: d.done === '1', ...(note !== undefined ? { note } : {}) }), d.done === '1' ? 'Risolta' : 'Riaperta')) reloadAll(); return; }
      case 'fb-delete': if (!confirm('Eliminare questa segnalazione?')) return; if (await act(() => api('feedback/delete', { id }), 'Eliminata')) reloadAll(); return;
      case 'limit-clear': if (d.key === '*' && !confirm('Azzerare tutti i contatori anti-spam?')) return; if (await act(() => api('admin/limit-clear', { key: d.key }), 'Sbloccato')) reloadAll(); return;
      case 'settings-save': {
        const values = {};
        document.querySelectorAll('#settingsForm input[data-key]').forEach((i) => { values[i.dataset.key] = i.value === '' ? null : Number(i.value); });
        if (await act(() => api('admin/settings-save', { values }), 'Impostazioni salvate')) load(); return;
      }
    }
  }

  // ---------- avvio ----------
  if (token) enter(); else $('#login').classList.remove('hidden');
})();
