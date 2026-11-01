'use strict';
/* Sito: emoji → icone (Font Awesome servito da noi) e → personaggi della gang (simboli SVG della pagina, se ci sono) */
(function () {
  const ICON = {
    '👥': 'users', '👤': 'user', '🎉': 'champagne-glasses', '✅': 'circle-check', '⏳': 'hourglass-half', '🚫': 'ban',
    '🗄': 'box-archive', '🚩': 'flag', '🔑': 'key', '📬': 'envelope', '🚪': 'door-open', '💣': 'bomb', '🔁': 'rotate',
    '📥': 'download', '🎲': 'dice', '📦': 'box', '🎙': 'microphone', '⬇': 'download', '🔄': 'rotate', '⚠': 'triangle-exclamation',
    '🔊': 'volume-high', '⭐': 'star', '🏆': 'trophy', '✨': 'wand-magic-sparkles', '🎧': 'headphones', '✂': 'scissors',
    '🎛': 'sliders', '🔒': 'lock', '🌐': 'globe', '👑': 'crown', '🛡': 'shield-halved', '🙈': 'eye-slash', '🧼': 'soap',
    '🪟': 'window-restore', '📻': 'radio', '🤖': 'robot', '🏔': 'mountain', '⛪': 'church', '📞': 'phone', '📢': 'bullhorn',
    '📣': 'bullhorn', '🐿': 'otter', '👹': 'dragon', '👧': 'person-dress', '👩': 'person-dress', '👵': 'person-cane',
    '🧔': 'person', '🧒': 'child', '👴': 'person-cane', '🤫': 'wind', '😈': 'skull', '🙂': 'ban', '▶': 'play', '⏺': 'circle',
    '🎮': 'gamepad', '🕹': 'gamepad', '⌨': 'keyboard', '〰': 'wave-square', '📯': 'bullhorn', '🥁': 'drum', '🦘': 'arrows-up-down',
    '💨': 'wind', '🔫': 'bolt', '🚨': 'tower-broadcast', '👏': 'hands-clapping', '🔔': 'bell', '🪙': 'coins', '💀': 'skull',
    '👾': 'ghost', '📺': 'tv', '🎵': 'music', '🎶': 'music', '💥': 'burst', '😂': 'face-laugh-squint', '👇': 'hand-point-down',
    '🗂': 'folder-open', '📜': 'scroll', '🛁': 'bath', '🖥': 'desktop', '🏁': 'flag-checkered', '💌': 'envelope-open-text',
    '🔐': 'lock', '🧹': 'broom', '🍿': 'film', '🐌': 'shoe-prints',
  };
  const CHAR = { '🍄': 'fungo', '🥒': 'cetriolo', '🍌': 'banana', '🍆': 'melanzana', '🚀': 'razzo', '🎳': 'birillo', '🍭': 'ghiacciolo', '💄': 'rossetto' };
  const keys = [...Object.keys(ICON), ...Object.keys(CHAR)].map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const RE = new RegExp(`(${keys.join('|')})️?`, 'g');
  const TEST = new RegExp(RE.source);
  const hasSym = (id) => !!document.getElementById('c-' + id);
  const SKIP = 'script, style, input, textarea, select, option, canvas, svg, i.fa-solid, [data-noicons]';
  function run(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (TEST.test(n.nodeValue) && !n.parentElement?.closest(SKIP) ? 1 : 2) });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    for (const n of list) {
      const f = document.createDocumentFragment(); const t = n.nodeValue; let last = 0; RE.lastIndex = 0;
      for (let m; (m = RE.exec(t));) {
        if (m.index > last) f.appendChild(document.createTextNode(t.slice(last, m.index)));
        const e = m[1];
        if (CHAR[e] && hasSym(CHAR[e])) {
          const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ico-char'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('data-e', e);
          const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#c-' + CHAR[e]); s.appendChild(u); f.appendChild(s);
        } else if (ICON[e]) { const i = document.createElement('i'); i.className = `fa-solid fa-${ICON[e]} ico-inline`; i.dataset.e = e; f.appendChild(i); }
        else if (CHAR[e]) { const i = document.createElement('i'); i.className = 'fa-solid fa-star ico-inline'; i.dataset.e = e; f.appendChild(i); }
        last = m.index + m[0].length;
      }
      if (last < t.length) f.appendChild(document.createTextNode(t.slice(last)));
      n.replaceWith(f);
    }
  }
  const start = () => {
    run(document.body);
    new MutationObserver((ms) => { for (const m of ms) for (const node of m.addedNodes) { const el = node.nodeType === 1 ? node : node.parentElement; if (el && !el.closest(SKIP)) run(node.nodeType === 1 ? node : node.parentNode); } })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
