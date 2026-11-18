(function () {
  var ov = null, listEl = null, msgEl = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .split('&').join('&amp;').split('<').join('&lt;')
      .split('>').join('&gt;').split('"').join('&quot;');
  }

  function when(iso) {
    try { return new Date(iso).toLocaleString(); } catch (_) { return '-'; }
  }

  function shortUa(ua) {
    if (!ua) return 'Unknown device';
    var b = 'Browser';
    if (ua.indexOf('Firefox') > -1) b = 'Firefox';
    else if (ua.indexOf('Edg') > -1) b = 'Edge';
    else if (ua.indexOf('Chrome') > -1) b = 'Chrome';
    else if (ua.indexOf('Safari') > -1) b = 'Safari';
    else if (ua.indexOf('PowerShell') > -1 || ua.indexOf('curl') > -1) b = 'Script client';
    var os = '';
    if (ua.indexOf('Windows') > -1) os = 'Windows';
    else if (ua.indexOf('Mac OS') > -1) os = 'macOS';
    else if (ua.indexOf('Android') > -1) os = 'Android';
    else if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) os = 'iOS';
    else if (ua.indexOf('Linux') > -1) os = 'Linux';
    return os ? b + ' on ' + os : b;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    if (!ov) return;
    ov.remove();
    ov = null; listEl = null; msgEl = null;
    document.body.classList.remove('st-open');
    document.removeEventListener('keydown', onKey);
  }

  function msg(t, k) {
    if (!msgEl) return;
    msgEl.textContent = t;
    msgEl.className = 'st-msg' + (k ? ' ' + k : '');
  }
  async function loadMe() {
    try {
      var r = await fetch('/me', { credentials: 'same-origin' });
      if (!r.ok) return;
      var j = await r.json();
      var e = ov && ov.querySelector('#stEmail');
      if (e) e.textContent = j.email || '';
    } catch (_) {}
  }

  async function loadSessions() {
    if (!listEl) return;
    listEl.innerHTML = '<li class="sub">Loading...</li>';
    try {
      var r = await fetch('/auth/sessions', { credentials: 'same-origin' });
      if (!r.ok) { listEl.innerHTML = '<li class="sub">Sign in again to see sessions.</li>'; return; }
      var d = await r.json();
      var rows = d.sessions || [];
      if (!rows.length) { listEl.innerHTML = '<li class="sub">No sessions.</li>'; return; }
      listEl.innerHTML = rows.map(function (s) {
        var tag = s.current ? ' <span class="pill">this device</span>' : '';
        var rev = s.revoked ? ' <span class="pill">revoked</span>' : '';
        var btn = s.revoked ? '' : '<button class="btn line" data-rev="' + s.id + '"' + (s.current ? ' data-cur="1"' : '') + ' type="button">' + (s.current ? 'Sign out' : 'Revoke') + '</button>';
        return '<li' + (s.revoked ? ' class="rev"' : '') + '><div><b>' + esc(shortUa(s.ua)) + tag + rev + '</b><span class="sub">' + esc(s.ip || 'unknown ip') + ' - last seen ' + when(s.lastSeenAt) + '</span></div>' + btn + '</li>';
      }).join('');
    } catch (_) { listEl.innerHTML = '<li class="sub">Could not load sessions.</li>'; }
  }

  async function revoke(id, cur) {
    var r = await fetch('/auth/sessions/' + id, { method: 'DELETE', credentials: 'same-origin' });
    if (!r.ok) return;
    if (cur) { if (window.__logout) window.__logout(); else location.replace('/auth.html'); return; }
    loadSessions();
  }

  async function savePw() {
    var c = ov.querySelector('#stCur');
    var n = ov.querySelector('#stNew');
    if (n.value.length < 8) return msg('New password needs 8+ characters.', 'err');
    var r = await fetch('/auth/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ current: c.value, password: n.value })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) return msg(d.error === 'bad_credentials' ? 'Current password is wrong.' : 'Could not update password.', 'err');
    msg('Password updated. Other sessions signed out.', 'ok');
    c.value = '';
    n.value = '';
    loadSessions();
  }
  function build() {
    ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = '<div class="st-sheet" role="dialog" aria-modal="true" aria-label="Settings">'
      + '<div class="st-head"><div class="st-ico">&#9881;</div><h3>Settings</h3><button class="st-x" type="button" aria-label="Close">&times;</button></div>'
      + '<div class="st-card"><span class="lbl">Account</span><p class="hint" id="stEmail"></p><p class="hint">No KYC on this account. Access is geo-restricted.</p>'
      + '<div class="row"><button class="btn" id="stLogout" type="button">Log out</button></div></div>'
      + '<div class="st-card"><span class="lbl">Active sessions</span><p class="hint">Everywhere this account is signed in. Revoke anything you do not recognise.</p>'
      + '<ul class="st-sess" id="stSess"></ul>'
      + '<div class="row"><button class="btn line" id="stAll" type="button">Sign out everywhere else</button></div></div>'
      + '<div class="st-card"><span class="lbl">Change password</span><p class="hint">Changing it signs out every other session.</p>'
      + '<div class="row"><input id="stCur" type="password" placeholder="Current password" autocomplete="current-password"></div>'
      + '<div class="row"><input id="stNew" type="password" placeholder="New password, 8+ characters" autocomplete="new-password"></div>'
      + '<div class="row"><button class="btn p" id="stSave" type="button">Update password</button></div>'
      + '<p class="st-msg" id="stMsg"></p></div>'
      + '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('st-open');
    listEl = ov.querySelector('#stSess');
    msgEl = ov.querySelector('#stMsg');

    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.st-x').addEventListener('click', close);
    ov.querySelector('#stLogout').addEventListener('click', function () {
      if (window.__logout) window.__logout(); else location.replace('/auth.html');
    });
    ov.querySelector('#stAll').addEventListener('click', async function () {
      if (!confirm('Sign out every other session?')) return;
      var r = await fetch('/auth/sessions', { method: 'DELETE', credentials: 'same-origin' });
      if (r.ok) loadSessions();
    });
    ov.querySelector('#stSave').addEventListener('click', savePw);
    listEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-rev]');
      if (!b) return;
      b.disabled = true;
      revoke(b.dataset.rev, b.dataset.cur === '1');
    });
    document.addEventListener('keydown', onKey);
  }

  function open() {
    if (ov) return;
    build();
    loadMe();
    loadSessions();
  }

  window.openSettings = open;

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-panel="p-settings"], a[href="#settings"]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  var tok = new URLSearchParams(location.search).get('reset');
  if (tok) {
    var main = document.querySelector('.main');
    var d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = '<span class="lbl">Set a new password</span><p class="hint">This link works once and expires in 30 minutes.</p>'
      + '<div class="row"><input id="rsPw" type="password" placeholder="New password, 8+ characters" autocomplete="new-password"></div>'
      + '<div class="row"><button class="btn" id="rsGo" type="button">Save password</button></div>'
      + '<p class="hint" id="rsMsg"></p>';
    main.insertBefore(d, main.firstChild);
    d.querySelector('#rsGo').addEventListener('click', async function () {
      var pwv = d.querySelector('#rsPw').value;
      var m = d.querySelector('#rsMsg');
      if (pwv.length < 8) { m.textContent = 'Needs 8+ characters.'; return; }
      var r = await fetch('/auth/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tok, password: pwv })
      });
      if (r.ok) { m.textContent = 'Saved. Redirecting...'; setTimeout(function () { location.replace('/app.html'); }, 600); }
      else { m.textContent = 'That link expired or was already used.'; }
    });
  }
})();
