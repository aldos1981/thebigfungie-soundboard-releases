/*
 * Sito in due lingue (italiano / English).
 * Le pagine restano scritte in italiano; se la lingua è l'inglese carico lang-en.js (window.SITE_EN: { "frase italiana": "English" })
 * e sostituisco le frasi: un «pezzo» è un elemento con testo e solo tag in linea dentro (b, a, span, br…), chiave = il suo HTML.
 * Lingua: ?lang=en|it (resta ricordata), altrimenti quella del browser (italiano solo se il browser è in italiano).
 * Le frasi nuove si raccolgono con scripts/site-i18n-extract.js (usa __I18N_KEYS qui sotto).
 */
(function siteLang() {
  'use strict';
  const STORE = 'sbLang';
  const norm = (s) => String(s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const INLINE = 'a,b,strong,em,i,span,small,br,code,kbd,sup,sub,u,mark,img,abbr,s,svg[data-e],svg[data-e] *';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEMPLATE', 'CANVAS', 'CODE']);
  const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];
  const hasWords = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);

  function pickLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'it' || q === 'en') { try { localStorage.setItem(STORE, q); } catch { /* niente */ } return q; }
    try { const s = localStorage.getItem(STORE); if (s === 'it' || s === 'en') return s; } catch { /* niente */ }
    return /^it\b/i.test(navigator.language || 'it') ? 'it' : 'en';
  }

  const skipEl = (el) => SKIP.has(el.tagName.toUpperCase()) || !!el.closest('[data-noi18n]');
  /** HTML di un pezzo con le icone di icons.js rimesse come emoji (la chiave è sempre quella «originale») */
  function keyOf(el) {
    if (!el.querySelector('[data-e]')) return norm(el.innerHTML);
    const c = el.cloneNode(true);
    c.querySelectorAll('[data-e]').forEach((x) => x.replaceWith(document.createTextNode(x.getAttribute('data-e'))));
    c.normalize();
    return norm(c.innerHTML);
  }
  function isUnit(el) {
    let text = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && hasWords(n.nodeValue)) { text = true; break; }
    return text && !el.querySelector(`*:not(${INLINE})`);
  }
  /** pezzi da tradurre sotto root: elementi «unità» e testi sciolti */
  function scan(root, units, texts) {
    if (root.nodeType === 3) { if (hasWords(root.nodeValue) && root.parentElement && !skipEl(root.parentElement)) texts.push(root); return; }
    if (root.nodeType !== 1 || skipEl(root) || root.closest('[data-i18n]')) return;
    if (isUnit(root)) { units.push(root); return; }
    for (const n of root.childNodes) scan(n, units, texts);
  }
  const attrEls = (root) => (root.nodeType === 1 ? [root, ...root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))] : []);

  // ---------- raccolta delle frasi (per lo script di estrazione) ----------
  window.__I18N_KEYS = function collect() {
    const units = [], texts = [], keys = new Set();
    scan(document.body, units, texts);
    units.forEach((el) => keys.add(keyOf(el)));
    texts.forEach((n) => keys.add(norm(n.nodeValue)));
    attrEls(document.body).forEach((el) => ATTRS.forEach((a) => { const v = el.getAttribute(a); if (v && hasWords(v)) keys.add(norm(v)); }));
    if (document.title) keys.add(norm(document.title));
    document.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name^="twitter:"]').forEach((m) => {
      const v = m.getAttribute('content'); if (v && hasWords(v) && !/^https?:/.test(v)) keys.add(norm(v));
    });
    return [...keys].filter(hasWords);
  };

  const lang = pickLang();
  document.documentElement.lang = lang;

  function translate(root, D) {
    const units = [], texts = [];
    scan(root, units, texts);
    for (const el of units) {
      const en = D[keyOf(el)] ?? (el.children.length ? undefined : D[norm(el.textContent)]);
      if (en !== undefined) { el.innerHTML = en; el.setAttribute('data-i18n', ''); }
    }
    for (const n of texts) {
      const en = D[norm(n.nodeValue)];
      if (en !== undefined) { const m = n.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/); n.nodeValue = m[1] + en + m[2]; }
    }
    for (const el of attrEls(root)) for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && D[norm(v)] !== undefined) el.setAttribute(a, D[norm(v)]);
    }
  }

  function start(D) {
    translate(document.body, D);
    if (D[norm(document.title)]) document.title = D[norm(document.title)];
    document.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name^="twitter:"]').forEach((m) => {
      const v = D[norm(m.getAttribute('content') || '')]; if (v) m.setAttribute('content', v);
    });
    // contenuti creati dopo (novità, finestre, conti alla rovescia): traduco anche quelli
    new MutationObserver((list) => {
      for (const r of list) for (const n of r.addedNodes) {
        const el = n.nodeType === 1 ? n : n.parentElement;
        if (el && !el.closest('[data-i18n]')) translate(n, D);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function addSwitch() {
    const b = document.createElement('div');
    b.className = 'lang-switch';
    b.setAttribute('data-noi18n', '');
    b.innerHTML = `<a href="?lang=it" class="${lang === 'it' ? 'on' : ''}" title="Italiano">IT</a><a href="?lang=en" class="${lang === 'en' ? 'on' : ''}" title="English">EN</a>`;
    b.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      const l = a.textContent.toLowerCase();
      try { localStorage.setItem(STORE, l); } catch { /* niente */ }
      const u = new URL(location.href); u.searchParams.set('lang', l); location.href = u.toString();
    });
    const css = document.createElement('style');
    css.textContent = '.lang-switch{position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(18,12,51,.88);box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:blur(6px);font:800 12px/1 Rubik,system-ui,sans-serif}'
      + '.lang-switch a{color:#c9c3ff;text-decoration:none;padding:7px 10px;border-radius:999px}.lang-switch a.on{background:#ffd23f;color:#1d1450}.lang-switch a:hover:not(.on){color:#fff}';
    document.head.appendChild(css);
    document.body.appendChild(b);
  }

  // i link alle altre pagine del sito si portano dietro la lingua scelta
  function keepLangInLinks() {
    if (lang !== 'en') return;
    document.querySelectorAll('a[href$=".html"], a[href*=".html#"], a[href*=".html?"]').forEach((a) => {
      const h = a.getAttribute('href'); if (/^https?:/.test(h)) return;
      const u = new URL(h, location.href); u.searchParams.set('lang', 'en'); a.setAttribute('href', u.pathname.split('/').pop() + u.search + u.hash);
    });
  }

  function boot() {
    addSwitch();
    if (lang !== 'en') return;
    keepLangInLinks();
    if (window.SITE_EN) { start(window.SITE_EN); return; }
    const s = document.createElement('script');
    s.src = 'lang-en.js';
    s.onload = () => { if (window.SITE_EN) start(window.SITE_EN); };
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
