(function () {
  if (document.querySelector('.wl')) return;

  var A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) {
    var digits = [0], i, j, carry, out = '';
    for (i = 0; i < bytes.length; i++) {
      carry = bytes[i];
      for (j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    for (i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
    for (j = digits.length - 1; j >= 0; j--) out += A[digits[j]];
    return out;
  }

  var wrap = document.createElement('div');
  wrap.className = 'wl';
  wrap.hidden = true;
  wrap.innerHTML =
    '<div class="wl-card" role="dialog" aria-modal="true" aria-labelledby="wlTitle">' +
      '<button class="wl-x" type="button" aria-label="Close">&times;</button>' +
      '<h3 id="wlTitle">Welcome to Quvio</h3>' +
      '<p class="wl-sub">Log in or open an account. A wallet signature is all it takes.</p>' +
      '<div class="wl-wallets">' +
        '<button type="button" data-w="phantom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 6h16v9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><circle cx="9.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.5" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>Phantom</button>' +
        '<button type="button" data-w="solflare"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7"/></svg>Solflare</button>' +
        '<button type="button" data-w="more"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>More</button>' +
      '</div>' +
      '<div class="wl-or">or</div>' +
      '<label class="wl-label" for="wlEmail">Email and password</label>' +
      '<div class="wl-row"><input id="wlEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>' +
      '<div class="wl-row" style="margin-top:9px"><input id="wlPw" type="password" autocomplete="current-password" placeholder="Password"></div>' +
      '<button type="button" class="wl-signin" id="wlGo">Sign in</button>' +
      '<button type="button" class="wl-new" id="wlNew">Create account</button>' +
      '<p class="wl-forgot"><a href="#" id="wlForgot">Forgot password?</a></p>' +
      '<div class="wl-ref"><input id="wlRef" placeholder="Referral code (optional)" autocomplete="off"><button type="button" id="wlRefGo">Apply</button></div>' +
      '<p class="wl-note">Signing in with a wallet opens the account. Nothing else about it changes.</p>' +
      '<p class="wl-err" id="wlErr" hidden></p>' +
      '<p class="wl-foot">You sign a message. No password, no seed phrase.</p>' +
    '</div>';
  document.body.appendChild(wrap);

  var errEl = wrap.querySelector('#wlErr');
  var email = wrap.querySelector('#wlEmail');
  var ref = wrap.querySelector('#wlRef');
  var pw = wrap.querySelector('#wlPw');

  try { ref.value = localStorage.getItem('mrd_ref') || ''; } catch (_) {}
  var q = new URLSearchParams(location.search).get('ref');
  if (q) { ref.value = q.toUpperCase(); }

  function say(msg) {
    errEl.textContent = msg;
    errEl.hidden = !msg;
  }

  function open() {
    wrap.hidden = false;
    document.body.classList.add('wl-lock');
    setTimeout(function () { email.focus(); }, 40);
  }

  function close() {
    wrap.hidden = true;
    document.body.classList.remove('wl-lock');
    say('');
  }

  function refParam() {
    var v = (ref.value || '').trim().toUpperCase();
    if (!v) return '';
    try { localStorage.setItem('mrd_ref', v); } catch (_) {}
    return v;
  }

  async function post(url, body) {
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(j.error || 'request_failed');
    return j;
  }

  function provider(kind) {
    if (kind === 'phantom') return (window.phantom && window.phantom.solana) || null;
    if (kind === 'solflare') return window.solflare || null;
    return null;
  }

  async function run(kind) {
    var p = provider(kind);
    var label = kind === 'phantom' ? 'Phantom' : 'Solflare';
    if (!p) { say(label + ' is not installed in this browser.'); return; }

    var btn = wrap.querySelector('[data-w="' + kind + '"]');
    btn.disabled = true;
    say('');

    try {
      var res = await p.connect();
      var addr = String((p.publicKey || (res && res.publicKey) || '').toString());
      if (!addr) throw new Error('no_address');

      var n = await post('/auth/wallet/nonce', { addr: addr });
      var bytes = new TextEncoder().encode(n.message);

      var signed = await p.signMessage(bytes, 'utf8');
      var raw = signed && signed.signature ? signed.signature : signed;
      var sig = b58(raw instanceof Uint8Array ? raw : new Uint8Array(raw));

      await post('/auth/wallet', { addr: addr, signature: sig, ref: refParam() });
      location.href = '/app.html';
    } catch (e) {
      var m = e && e.message;
      say(
        m === 'no_nonce' ? 'The sign-in expired. Try again.'
        : m === 'bad_signature' ? 'That signature did not verify. Try again.'
        : m === 'too_many_attempts' ? 'Too many attempts. Wait a minute.'
        : m === 'wallet_taken' ? 'That wallet is already linked to another account.'
        : m && m !== 'request_failed' ? m
        : 'Could not connect. Open the wallet and try again.'
      );
    } finally {
      btn.disabled = false;
    }
  }

  wrap.querySelectorAll('[data-w]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-w');
      if (k === 'more') { location.href = '/auth.html' + (refParam() ? '?ref=' + refParam() : ''); return; }
      run(k);
    });
  });

  async function wlPost(url, body) {
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    var j = await r.json().catch(function () { return {}; });
    return { ok: r.ok, error: j.error, data: j };
  }

  function wlMsg(code) {
    return code === 'weak_password' ? 'Password needs at least 8 characters.'
      : code === 'bad_email' ? 'That email address does not look right.'
      : code === 'too_many_attempts' ? 'Too many attempts. Wait a minute.'
      : code === 'invalid_credentials' || code === 'bad_credentials' ? 'Email or password is wrong.'
      : code === 'email_taken' ? 'That email is already registered. Press Continue to log in.'
      : 'Something went wrong. Try again.';
  }

  wrap.querySelector('#wlGo').addEventListener('click', async function () {
    var v = (email.value || '').trim();
    var p = pw.value || '';
    var r = refParam();
    say('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { say('That email address does not look right.'); email.focus(); return; }
    if (p.length < 8) { say('Password needs at least 8 characters.'); pw.focus(); return; }
    var btn = this;
    btn.disabled = true;
    try {
      var a = await wlPost('/auth/signup', { email: v, password: p, ref: r });
      if (!a.ok && a.error === 'email_taken') {
        a = await wlPost('/auth/login', { email: v, password: p, ref: r });
      }
      if (!a.ok) { say(wlMsg(a.error)); btn.disabled = false; pw.focus(); pw.select(); return; }
      location.href = '/app.html';
    } catch (_) {
      say('Network error. Try again.');
      btn.disabled = false;
    }
  });

  wrap.querySelector('#wlNew').addEventListener('click', function () {
    var v = (email.value || '').trim();
    var r = refParam();
    var qs = ['mode=create'];
    if (r) qs.push('ref=' + encodeURIComponent(r));
    if (v) {
      qs.push('email=' + encodeURIComponent(v));
      try { localStorage.setItem('mrd_email', v); } catch (_) {}
    }
    location.href = '/auth.html?' + qs.join('&');
  });

  wrap.querySelector('#wlForgot').addEventListener('click', async function (e) {
    e.preventDefault();
    var v = (email.value || '').trim();
    say('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { say('Type your email first, then press the link.'); email.focus(); return; }
    var res = await wlPost('/auth/forgot', { email: v });
    if (!res.ok) { say('Too many attempts. Wait a minute.'); return; }
    var link = res.data.link || '';
    if (link) {
      var full = link.indexOf('http') === 0 ? link : location.origin + link;
      errEl.hidden = false;
      errEl.innerHTML = 'Reset link ready. <a href="' + full + '">Set a new password</a>';
    } else {
      say('If that email exists, a reset link is on its way. It expires in 30 minutes.');
    }
  });

  email.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') wrap.querySelector('#wlGo').click();
  });

  pw.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') wrap.querySelector('#wlGo').click();
  });

  wrap.querySelector('#wlRefGo').addEventListener('click', function () {
    refParam();
    say('Referral code saved.');
  });

  wrap.querySelector('.wl-x').addEventListener('click', close);
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !wrap.hidden) close();
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-wl]') : null;
    if (!a) return;
    e.preventDefault();
    open();
  });

  window.walletSheet = open;
})();