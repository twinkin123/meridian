import { readFileSync, writeFileSync } from 'node:fs';

const F = 'public/app.html';
let h = readFileSync(F, 'utf8');

if (h.includes('/faq.js')) {
  console.log('already patched');
  process.exit(0);
}

const re = /\s*<section class="panel" id="p-faq">[\s\S]*?<\/section>/;
const n = (h.match(new RegExp(re.source, 'g')) || []).length;
if (n !== 1) throw new Error(`expected 1 faq panel, got ${n}`);
h = h.replace(re, '');

const linkAnchor = '<link rel="stylesheet" href="/addresses.css">';
if (h.split(linkAnchor).length - 1 !== 1) throw new Error('css anchor missing');
h = h.replace(linkAnchor, linkAnchor + '\n<link rel="stylesheet" href="/faq.css?v=1">');

const jsAnchor = '<script src="/addresses.js"></script>';
if (h.split(jsAnchor).length - 1 !== 1) throw new Error('js anchor missing');
h = h.replace(jsAnchor, jsAnchor + '<script src="/faq.js?v=1"></script>');

writeFileSync(F, h);

writeFileSync('public/faq.css', `
.fq-overlay{position:fixed;inset:0;background:rgba(6,6,9,.72);backdrop-filter:blur(6px);z-index:120;display:flex;align-items:center;justify-content:center;padding:16px}
.fq-sheet{width:100%;max-width:520px;background:var(--panel);border:1px solid var(--line2);border-radius:18px;padding:18px;color:var(--txt);box-shadow:0 24px 70px rgba(0,0,0,.6);max-height:92vh;overflow:auto}
.fq-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.fq-ico{width:30px;height:30px;border-radius:9px;background:rgba(139,92,246,.16);color:var(--pur);display:grid;place-items:center;font-size:14px;font-weight:700}
.fq-head h3{margin:0;font-size:16px;font-weight:600}
.fq-x{margin-left:auto;background:none;border:0;color:var(--mut);font-size:19px;cursor:pointer;line-height:1}
.fq-list{display:flex;flex-direction:column}
.fq-item{border-bottom:1px solid var(--line);padding:12px 0}
.fq-item:first-child{padding-top:0}
.fq-item:last-child{border-bottom:none;padding-bottom:0}
.fq-item b{display:block;font-size:13px;font-weight:600;color:var(--txt)}
.fq-item p{margin:3px 0 0;font-size:11.5px;line-height:1.5;color:var(--mut)}
.fq-foot{margin-top:14px;font-size:11.5px;color:var(--mut);border-top:1px solid var(--line);padding-top:11px;line-height:1.45}
body.fq-open{overflow:hidden}
@media (max-width:560px){.fq-overlay{padding:0;align-items:flex-end}.fq-sheet{max-width:100%;border-radius:18px 18px 0 0;max-height:94vh}}
`);

writeFileSync('public/faq.js', `
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
    var x = el('button', 'fq-x', '\\u00d7');
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
    foot.textContent = 'Anything not covered here \\u2014 ask before you send.';
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
`);

console.log('faq is now a sheet');