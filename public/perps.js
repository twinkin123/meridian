(function () {
  var overlay = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('wd-open');
    document.removeEventListener('keydown', onKey);
    if (location.hash === '#perps') history.replaceState(null, '', location.pathname + location.search);
  }

  var MARKETS = [['SOL-PERP', 'Solana'], ['BTC-PERP', 'Bitcoin'], ['ETH-PERP', 'Ethereum']];

  function build() {
    overlay = el('div', 'wd-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'wd-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Perps');

    var head = el('div', 'wd-head');
    head.appendChild(el('div', 'wd-ico', '\u2197'));
    head.appendChild(el('h3', null, 'Perps'));
    var x = el('button', 'wd-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    sheet.appendChild(el('div', 'wd-bal', 'Leveraged perpetuals, settled on Solana'));

    var card = el('div', 'wd-card');
    card.appendChild(el('p', 'hint', 'Not live yet. Long or short with up to 10x on the pairs below.'));

    var list = el('ul', 'list');
    MARKETS.forEach(function (m) {
      var li = el('li');
      var d = el('div');
      d.appendChild(el('b', null, m[0]));
      d.appendChild(el('span', 'sub', m[1]));
      li.appendChild(d);
      li.appendChild(el('span', 'pill', '10x'));
      list.appendChild(li);
    });
    card.appendChild(list);

    var row = el('div', 'row');
    var go = el('button', 'btn p', 'Open a position');
    go.type = 'button';
    go.disabled = true;
    row.appendChild(go);
    card.appendChild(row);
    sheet.appendChild(card);

    sheet.appendChild(el('div', 'wd-foot', '\u26a0 Preview only \u2014 orders do not reach the book yet.'));

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('wd-open');
    document.addEventListener('keydown', onKey);
  }

  function open() { if (overlay) return; build(); }

  window.openPerps = open;

  document.addEventListener('click', function (e) {
    var t = e.target.closest('a[href="#perps"]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  if (location.hash === '#perps') open();
})();
