/* search.js - header docs search. Indexes documentation sections, opens the docs
   page filtered to the term. Wires once per document. */
(function () {
  'use strict';
  var box = document.querySelector('.hsearch, .search');
  if (!box || box.dataset.wired === '1') return;
  var input = box.querySelector('input');
  if (!input) return;
  box.dataset.wired = '1';

  var DOCS = '/docs.html';
  var FALLBACK = [
    ['What Quvio is', 'what-is-quvio'], ['The ledger', 'ledger'], ['Deposits', 'deposits'],
    ['The 30-day lock', 'lock'], ['Daily credit', 'credit'], ['Withdrawals', 'withdrawals'],
    ['Referrals', 'referrals'], ['Perps', 'perps'], ['Swap', 'swap'],
    ['Security', 'security'], ['Risk', 'risk'], ['Risk disclosures', 'legal'], ['FAQ', 'faq']
  ];

  var st = document.createElement('style');
  st.textContent = [
    '.search,.hsearch{position:relative}',
    '.sres{position:absolute;top:calc(100% + 8px);left:0;min-width:290px;max-width:min(430px,92vw);background:#0e1210;border:1px solid #1e2622;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.55);padding:6px;z-index:90;display:none;max-height:min(58vh,420px);overflow:auto}',
    '.sres.on{display:block}',
    '.sres .it{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;cursor:pointer;color:#dfe7e2;font:13px/1.3 inherit;text-decoration:none}',
    '.sres .it .lb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sres .it .sb{color:#7d8c85;font-size:10px;letter-spacing:.05em;text-transform:uppercase;flex:none}',
    '.sres .it.sel{background:#16201b}',
    '.sres .empty{padding:12px 10px;color:#7d8c85;font-size:12px}',
    '.sres .hd{padding:8px 10px 4px;color:#5f6167;font-size:10px;letter-spacing:.09em;text-transform:uppercase}'
  ].join('');
  document.head.appendChild(st);

  var panel = document.createElement('div');
  panel.className = 'sres';
  panel.setAttribute('role', 'listbox');
  box.appendChild(panel);
  box.addEventListener('click', function (e) { if (e.target !== input) input.focus(); });

  var index = null;

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch(DOCS, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (html) {
        var out = [];
        if (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          Array.prototype.forEach.call(doc.querySelectorAll('main section[id]'), function (s) {
            var h = s.querySelector('h2, h3');
            if (!h) return;
            out.push({
              label: (h.textContent || '').trim(),
              id: s.id,
              text: (s.textContent || '').toLowerCase()
            });
          });
        }
        if (!out.length) {
          out = FALLBACK.map(function (f) { return { label: f[0], id: f[1], text: '' }; });
        }
        index = out;
        return index;
      })
      .catch(function () {
        index = FALLBACK.map(function (f) { return { label: f[0], id: f[1], text: '' }; });
        return index;
      });
  }

  var hits = [];
  var sel = 0;

  function score(it, q) {
    var l = it.label.toLowerCase();
    if (l.indexOf(q) === 0) return 4;
    if (l.indexOf(' ' + q) > -1) return 3;
    if (l.indexOf(q) > -1) return 2;
    if (it.text.indexOf(q) > -1) return 1;
    return 0;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    panel.textContent = '';

    var all = index || [];
    if (!q) {
      hits = all.slice(0, 8);
    } else {
      hits = all
        .map(function (it) { return { it: it, s: score(it, q) }; })
        .filter(function (r) { return r.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 10)
        .map(function (r) { return r.it; });
    }

    var hd = document.createElement('div');
    hd.className = 'hd';
    hd.textContent = q ? 'Documentation' : 'Search the documentation';
    panel.appendChild(hd);

    if (!hits.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No docs match "' + input.value.trim() + '" — Enter to open docs anyway';
      panel.appendChild(e);
      sel = 0;
      panel.classList.add('on');
      return;
    }

    if (sel > hits.length - 1) sel = hits.length - 1;
    if (sel < 0) sel = 0;

    hits.forEach(function (it, i) {
      var row = document.createElement('a');
      row.className = 'it' + (i === sel ? ' sel' : '');
      row.href = DOCS + '#' + it.id;
      row.setAttribute('role', 'option');
      var lb = document.createElement('span');
      lb.className = 'lb';
      lb.textContent = it.label;
      row.appendChild(lb);
      row.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
      row.addEventListener('click', function (ev) { ev.preventDefault(); go(i); });
      panel.appendChild(row);
    });

    panel.classList.add('on');
  }

  function go(i) {
    var term = input.value.trim();
    var it = hits[i];
    var url = DOCS + (term ? '?q=' + encodeURIComponent(term) : '');
    if (it && it.id) url += '#' + it.id;
    close();
    location.href = url;
  }

  function close() {
    panel.classList.remove('on');
    panel.textContent = '';
    input.blur();
  }

  input.addEventListener('focus', function () { loadIndex().then(render); });
  input.addEventListener('input', function () { sel = 0; render(); });
  input.addEventListener('blur', function () {
    setTimeout(function () { if (!panel.matches(':hover')) panel.classList.remove('on'); }, 120);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel++; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel--; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(panel.classList.contains('on') ? sel : 0); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; close(); }
  });

  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    var hot = (k === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey);
    if (!hot) return;
    var t = e.target;
    if (k === '/' && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  document.addEventListener('click', function (e) {
    if (!box.contains(e.target)) panel.classList.remove('on');
  });

  window.openSearch = function (q) {
    input.focus();
    if (q != null) input.value = q;
    loadIndex().then(function () { sel = 0; render(); });
  };
})();