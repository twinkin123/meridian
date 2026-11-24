/* search.js - header command palette. Self-contained: injects styles and panel,
   builds its registry from the page. Wires once per document. */
(function () {
  'use strict';
  var box = document.querySelector('.search');
  if (!box || box.dataset.wired === '1') return;
  var input = box.querySelector('input');
  if (!input) return;
  box.dataset.wired = '1';

  var css = [
    '.search{position:relative}',
    '.sres{position:absolute;top:calc(100% + 8px);left:0;min-width:290px;max-width:min(430px,92vw);background:#0e1210;border:1px solid #1e2622;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.55);padding:6px;z-index:90;display:none;max-height:min(58vh,420px);overflow:auto}',
    '.sres.on{display:block}',
    '.sres .it{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;cursor:pointer;color:#dfe7e2;font:13px/1.3 inherit;text-decoration:none}',
    '.sres .it .lb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.sres .it .sb{color:#7d8c85;font-size:10px;letter-spacing:.05em;text-transform:uppercase;flex:none}',
    '.sres .it.sel{background:#16201b}',
    '.sres .empty{padding:12px 10px;color:#7d8c85;font-size:12px}'
  ].join('');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var panel = document.createElement('div');
  panel.className = 'sres';
  panel.setAttribute('role', 'listbox');
  box.appendChild(panel);

  function collect() {
    var out = [];
    function add(label, sub, action) {
      label = (label || '').trim();
      if (!label) return;
      for (var i = 0; i < out.length; i++) if (out[i].label.toLowerCase() === label.toLowerCase()) return;
      out.push({ label: label, sub: sub || '', action: action });
    }

    Array.prototype.forEach.call(document.querySelectorAll('.rail a, .side a'), function (a) {
      var t = a.getAttribute('title') || (a.textContent || '').trim();
      var href = a.getAttribute('href') || '#';
      if (!t) return;
      add(t, href.charAt(0) === '/' ? href : 'panel', function () { a.click(); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tool'), function (b) {
      add((b.textContent || '').trim(), 'tool', function () { b.click(); });
    });

    Array.prototype.forEach.call(document.querySelectorAll('.tnav a'), function (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) !== '/') return;
      add((a.textContent || '').trim(), href, function () { location.href = href; });
    });

    [['Dashboard', '/dash.html'], ['App', '/app.html'], ['Docs', '/docs.html'],
     ['FAQ', '/faq.html'], ['Log in', '/auth.html?mode=login']].forEach(function (p) {
      add(p[0], p[1], function () { location.href = p[1]; });
    });

    return out;
  }

  var all = [];
  var hits = [];
  var sel = 0;

  function score(item, q) {
    var l = item.label.toLowerCase();
    if (l.indexOf(q) === 0) return 3;
    if (l.indexOf(' ' + q) > -1) return 2;
    if (l.indexOf(q) > -1) return 1;
    if (item.sub.toLowerCase().indexOf(q) > -1) return 1;
    return 0;
  }

  function render() {
    var q = input.value.trim().toLowerCase();
    panel.textContent = '';

    if (!q) { hits = all.slice(0, 8); }
    else {
      hits = all
        .map(function (it) { return { it: it, s: score(it, q) }; })
        .filter(function (r) { return r.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 10)
        .map(function (r) { return r.it; });
    }

    if (!hits.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Nothing matches "' + input.value.trim() + '"';
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
      row.href = it.sub.charAt(0) === '/' ? it.sub : '#';
      row.setAttribute('role', 'option');
      var lb = document.createElement('span');
      lb.className = 'lb';
      lb.textContent = it.label;
      row.appendChild(lb);
      if (it.sub && it.sub.charAt(0) === '/') {
        var sb = document.createElement('span');
        sb.className = 'sb';
        sb.textContent = 'page';
        row.appendChild(sb);
      }
      row.addEventListener('mousedown', function (e) { e.preventDefault(); });
      row.addEventListener('click', function (e) { e.preventDefault(); go(i); });
      panel.appendChild(row);
    });

    panel.classList.add('on');
  }

  function go(i) {
    var it = hits[i];
    if (!it) return;
    close();
    it.action();
  }

  function close() {
    panel.classList.remove('on');
    panel.textContent = '';
    input.blur();
  }

  input.addEventListener('focus', function () { all = collect(); render(); });
  input.addEventListener('input', function () { sel = 0; render(); });
  input.addEventListener('blur', function () { setTimeout(function () { if (!panel.matches(':hover')) panel.classList.remove('on'); }, 120); });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel++; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel--; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (panel.classList.contains('on')) go(sel); }
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
    all = collect();
    sel = 0;
    render();
  };
})();