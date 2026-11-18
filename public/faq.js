
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
    document.body.classList.remove('fq-open');
    document.removeEventListener('keydown', onKey);
  }

  var QA = [
    ['What is the minimum?', '$10 to stake and $10 to withdraw. Closing a balance in full is exempt from both.'],
    ['When is credit posted?', 'Every 24 hours at 00:15 UTC, on principal only.'],
    ['What does it cost?', 'A 15% performance fee, charged only on gains above the high-water mark.'],
    ['What if a withdrawal is rejected?', 'It goes back to reserve, and locks again for 30 days once reserve reaches $10.'],
    ['Why is my withdrawal capped?', 'The cap scales with your balance and with how long the address has been on your list. A new address starts lower.'],
    ['Where is my stake address?', 'On the dashboard, or in the Stake panel. USDC or SOL on Solana only.']
  ];

  function build() {
    overlay = el('div', 'fq-overlay');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var sheet = el('div', 'fq-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'FAQ');

    var head = el('div', 'fq-head');
    head.appendChild(el('div', 'fq-ico', '?'));
    head.appendChild(el('h3', null, 'FAQ'));
    var x = el('button', 'fq-x', '\u00d7');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    head.appendChild(x);
    sheet.appendChild(head);

    var list = el('div', 'fq-list');
    list.innerHTML = QA.map(function (q) {
      return '<div class="fq-item"><b>' + q[0] + '</b><p>' + q[1] + '</p></div>';
    }).join('');
    sheet.appendChild(list);

    var foot = el('div', 'fq-foot');
    foot.textContent = 'Anything not covered here \u2014 ask before you send.';
    sheet.appendChild(foot);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    document.body.classList.add('fq-open');
    document.addEventListener('keydown', onKey);
  }

  function open() {
    if (overlay) return;
    build();
  }

  window.openFaq = open;
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goto="p-faq"], a[href="#faq"]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  if (location.hash === '#faq') open();
})();
