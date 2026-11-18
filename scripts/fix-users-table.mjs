import { readFileSync, writeFileSync } from 'node:fs';

function patch(file, pairs) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(/\r\n/g, '\n');
  for (const [find, repl] of pairs) {
    const n = src.split(find).length - 1;
    if (n > 1) throw new Error(file + ': expected 1 match, got ' + n + ' :: ' + find.slice(0, 60));
    if (n === 0) { console.log('SKIP ' + file + ' :: ' + find.slice(0, 40)); continue; }
    src = src.split(find).join(repl);
  }
  writeFileSync(file, src);
  console.log('ok ' + file);
}

writeFileSync('migrations/0034_user_admin.sql', [
  'alter table users add column if not exists frozen_at timestamptz;',
  'alter table users add column if not exists frozen_reason text;',
  'create index if not exists users_frozen on users (frozen_at) where frozen_at is not null;',
  '',
].join('\n'));
console.log('ok migration');

const routes = [];
const R = (s) => routes.push(s);

R("const USER_SORTS: Record<string, string> = {");
R("  created_at: 'u.created_at', email: 'u.email', available: 'available',");
R("  reserve: 'reserve', locked: 'locked', deposited: 'dep_usd',");
R("  withdrawn: 'wd_usd', last_polled_at: 'u.last_polled_at',");
R("};");
R("");
R("function tempPassword(): string {");
R("  return randomBytes(12).toString('base64url').slice(0, 14);");
R("}");
R("");
R("adminRouter.get('/users', async (req, res) => {");
R("  const q = String(req.query.q ?? '').trim();");
R("  const sort = USER_SORTS[String(req.query.sort ?? '')] ?? USER_SORTS.created_at;");
R("  const dir = String(req.query.dir ?? '') === 'asc' ? 'asc' : 'desc';");
R("  const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 200);");
R("  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);");
R("");
R("  const where = `where ($1 = '' or u.email ilike '%' || $1 || '%'");
R("      or u.deposit_addr = $1 or u.referral_code = upper($1) or u.id::text = $1)`;");
R("");
R("  const base = `");
R("    from users u");
R("    left join (");
R("      select user_id,");
R("             coalesce(sum(balance) filter (where code = '2000'), 0) available,");
R("             coalesce(sum(balance) filter (where code = '2050'), 0) reserve,");
R("             coalesce(sum(balance) filter (where code = '2070'), 0) locked,");
R("             coalesce(sum(balance) filter (where code = '2060'), 0) vesting,");
R("             coalesce(sum(balance) filter (where code = '2080'), 0) rewards,");
R("             coalesce(sum(balance) filter (where code = '2010'), 0) in_flight");
R("        from v_balance group by user_id");
R("    ) b on b.user_id = u.id");
R("    left join (");
R("      select user_id, count(*)::int dep_n, coalesce(sum(usd_at_det), 0) dep_usd");
R("        from deposits group by user_id");
R("    ) d on d.user_id = u.id");
R("    left join (");
R("      select user_id, count(*)::int wd_n, coalesce(sum(usd_amount), 0) wd_usd");
R("        from withdrawals group by user_id");
R("    ) w on w.user_id = u.id");
R("    ${where}`;");
R("");
R("  const { rows } = await pool.query(");
R("    `select u.id, u.email, u.tier, u.is_admin, u.must_change_pw, u.created_at,");
R("            u.deposit_addr, u.privy_address, u.referral_code, u.lifetime_dep,");
R("            u.last_polled_at, u.frozen_at, u.frozen_reason,");
R("            coalesce(b.available, 0) available, coalesce(b.reserve, 0) reserve,");
R("            coalesce(b.locked, 0) locked, coalesce(b.vesting, 0) vesting,");
R("            coalesce(b.rewards, 0) rewards, coalesce(b.in_flight, 0) in_flight,");
R("            coalesce(d.dep_n, 0) dep_n, coalesce(d.dep_usd, 0) dep_usd,");
R("            coalesce(w.wd_n, 0) wd_n, coalesce(w.wd_usd, 0) wd_usd,");
R("            (select count(*)::int from sessions s where s.user_id = u.id");
R("              and s.revoked_at is null and s.expires_at > now()) live_sessions");
R("       ${base}");
R("      order by ${sort} ${dir} nulls last, u.created_at desc");
R("      limit $2 offset $3`,");
R("    [q, limit, offset],");
R("  );");
R("");
R("  const t = await pool.query<{ n: string; available: string; reserve: string; locked: string; dep: string; wd: string }>(");
R("    `select count(*)::text n,");
R("            coalesce(sum(coalesce(b.available, 0)), 0)::text available,");
R("            coalesce(sum(coalesce(b.reserve, 0)), 0)::text reserve,");
R("            coalesce(sum(coalesce(b.locked, 0)), 0)::text locked,");
R("            coalesce(sum(coalesce(d.dep_usd, 0)), 0)::text dep,");
R("            coalesce(sum(coalesce(w.wd_usd, 0)), 0)::text wd");
R("       ${base}`,");
R("    [q],");
R("  );");
R("  const tt = t.rows[0];");
R("  res.json({ users: rows, total: Number(tt.n), totals: {");
R("    available: tt.available, reserve: tt.reserve, locked: tt.locked,");
R("    dep: tt.dep, wd: tt.wd } });");
R("});");
R("");
R("adminRouter.post('/users/:id/admin', async (req, res) => {");
R("  const want = req.body?.is_admin === true || req.body?.is_admin === 'true';");
R("  const r = await pool.query<{ is_admin: boolean }>(");
R("    `update users set is_admin = $2 where id = $1 returning is_admin`,");
R("    [req.params.id, want],");
R("  );");
R("  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });");
R("  res.json({ ok: true, is_admin: r.rows[0].is_admin });");
R("});");
R("");
R("adminRouter.post('/users/:id/tier', async (req, res) => {");
R("  const tier = Number(req.body?.tier);");
R("  if (!Number.isInteger(tier) || tier < 0 || tier > 4) return res.status(400).json({ error: 'bad_tier' });");
R("  const r = await pool.query(`update users set tier = $2 where id = $1`, [req.params.id, tier]);");
R("  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });");
R("  res.json({ ok: true, tier });");
R("});");
R("");
R("adminRouter.post('/users/:id/freeze', async (req, res) => {");
R("  const frozen = req.body?.frozen === true || req.body?.frozen === 'true';");
R("  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : null;");
R("  const r = await pool.query(");
R("    `update users");
R("        set frozen_at = case when $2 then now() else null end,");
R("            frozen_reason = case when $2 then $3 else null end");
R("      where id = $1 returning id`,");
R("    [req.params.id, frozen, reason],");
R("  );");
R("  if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' });");
R("  await notifyUser(req.params.id, frozen ? 'account_frozen' : 'account_unfrozen',");
R("    frozen ? 'Your account is frozen, so withdrawals are paused until an admin lifts it.'");
R("      : 'Your account is unfrozen. Withdrawals work again.');");
R("  res.json({ ok: true, frozen });");
R("});");
R("");
R("adminRouter.post('/users/:id/password', async (req, res) => {");
R("  const given = typeof req.body?.password === 'string' ? req.body.password : '';");
R("  const pw = given.length >= 8 ? given : tempPassword();");
R("  await setPassword(req.params.id, pw, true);");
R("  await revokeAllSessions(req.params.id);");
R("  await notifyUser(req.params.id, 'password_reset',");
R("    'An admin set a temporary password. You must change it on next sign-in.');");
R("  res.json({ ok: true, password: pw });");
R("});");
R("");

patch('src/admin.ts', [
  ["import { breakGlassOk, sessionFromToken, isAdmin } from './auth.js';",
   "import { breakGlassOk, sessionFromToken, isAdmin, setPassword, revokeAllSessions } from './auth.js';\nimport { notifyUser } from './notify.js';\nimport { randomBytes } from 'node:crypto';"],
  ["adminRouter.get('/stats'", routes.join('\n') + "adminRouter.get('/stats'"],
]);
patch('src/withdrawals.ts', [
  ["export type Asset = 'SOL' | 'USDC';",
   "export type Asset = 'SOL' | 'USDC';\n\n/** Per-user freeze set from the admin panel; independent of the global level. */\nexport async function isUserFrozen(userId: string): Promise<boolean> {\n  const r = await pool.query<{ frozen_at: string | null }>(`select frozen_at from users where id = $1`, [userId]);\n  return Boolean(r.rows[0]?.frozen_at);\n}"],
  ["  if (source !== 'rewards' && (await freezeLevel()) >= 2) return { ok: false, error: 'frozen' };",
   "  if (source !== 'rewards' && (await freezeLevel()) >= 2) return { ok: false, error: 'frozen' };\n  if (source !== 'rewards' && (await isUserFrozen(userId))) return { ok: false, error: 'user_frozen' };"],
]);
const card = `    <div class="card">
      <span class="mono">Users</span>
      <p class="lede" style="margin-top:8px">Every account with balances and activity. Actions apply immediately.</p>
      <div class="uhead">
        <input id="uSearch" type="search" placeholder="Search email, wallet, referral code or user id" spellcheck="false">
        <button class="btn" id="uGo" type="button">Search</button>
      </div>
      <div class="msg" id="uMsg"></div>
      <div id="uTotals"></div>
      <div class="tblwrap">
        <table class="tbl">
          <thead><tr>
            <th><button data-sort="email" type="button">User</button></th>
            <th>Tier</th>
            <th>Role</th>
            <th><button data-sort="created_at" type="button">Joined</button></th>
            <th><button data-sort="last_polled_at" type="button">Last seen</button></th>
            <th><button data-sort="available" type="button">Available</button></th>
            <th><button data-sort="reserve" type="button">Reserve</button></th>
            <th><button data-sort="locked" type="button">Locked</button></th>
            <th>Vesting</th>
            <th>Rewards</th>
            <th><button data-sort="deposited" type="button">Deposited</button></th>
            <th><button data-sort="withdrawn" type="button">Withdrawn</button></th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="users"><tr><td colspan="13" class="empty">Loading...</td></tr></tbody>
        </table>
      </div>
      <div class="row">
        <button class="btn" id="uPrev" type="button">Prev</button>
        <button class="btn" id="uNext" type="button">Next</button>
      </div>
    </div>

`;
let usersJs = '';
usersJs += `  var uState = { q: '', sort: 'created_at', dir: 'desc', offset: 0 };

  function esc(s){
    return String(s == null ? '' : s)
      .split('&').join('&amp;').split('<').join('&lt;')
      .split('>').join('&gt;').split('"').join('&quot;');
  }

  function ago(d){
    var s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    return Math.round(s / 86400) + 'd ago';
  }

  async function loadUsers(){
    var box = document.getElementById('users');
    var tot = document.getElementById('uTotals');
    var url = '/admin/users?q=' + encodeURIComponent(uState.q) + '&sort=' + uState.sort +
      '&dir=' + uState.dir + '&offset=' + uState.offset;
    try {
      var r = await fetch(url, { headers: h() });
      var j = await r.json().catch(function(){ return {}; });
      if (!r.ok) {
        box.innerHTML = '<tr><td colspan="13" class="empty">' + esc(j.error || 'Could not load.') + '</td></tr>';
        return;
      }
      var rows = j.users || [];
      var t = j.totals || {};
      tot.textContent = j.total + ' users match - available ' + money(t.available) +
        ' - reserve ' + money(t.reserve) + ' - locked ' + money(t.locked) +
        ' - deposited ' + money(t.dep) + ' - withdrawn ' + money(t.wd);
      if (!rows.length) {
        box.innerHTML = '<tr><td colspan="13" class="empty">No users match.</td></tr>';
        return;
      }
`;
usersJs += `
      box.innerHTML = rows.map(function(u){
        var acts =
          '<button class="btn sm" data-act="admin" data-id="' + u.id + '" data-v="' +
            (u.is_admin ? '0' : '1') + '" type="button">' + (u.is_admin ? 'Demote' : 'Make admin') + '</button> ' +
          '<button class="btn sm" data-act="pw" data-id="' + u.id + '" type="button">Reset pw</button> ' +
          '<button class="btn sm ' + (u.frozen_at ? '' : 'd') + '" data-act="freeze" data-id="' + u.id +
            '" data-v="' + (u.frozen_at ? '0' : '1') + '" type="button">' + (u.frozen_at ? 'Unfreeze' : 'Freeze') + '</button>';
        return '<tr>' +
          '<td><b>' + esc(u.email) + '</b>' +
            '<span class="sub">' + esc(u.id.slice(0, 8)) + ' - ' + esc(u.referral_code || 'no code') + '</span>' +
            '<span class="sub">' + esc(u.privy_address || u.deposit_addr || 'no wallet') + '</span>' +
            (u.frozen_at ? '<span class="sub">frozen ' + ago(u.frozen_at) +
              (u.frozen_reason ? ': ' + esc(u.frozen_reason) : '') + '</span>' : '') +
          '</td>' +
          '<td><select class="tier" data-act="tier" data-id="' + u.id + '">' +
            [0,1,2,3,4].map(function(n){
              return '<option value="' + n + '"' + (Number(u.tier) === n ? ' selected' : '') + '>' + n + '</option>';
            }).join('') +
          '</select></td>' +
          '<td>' + (u.is_admin ? '<span class="pill ok">admin</span>' : '<span class="pill">user</span>') +
            (u.must_change_pw ? '<span class="sub">must change pw</span>' : '') + '</td>' +
          '<td>' + new Date(u.created_at).toLocaleDateString() + '</td>' +
          '<td>' + (u.last_polled_at ? ago(u.last_polled_at) : 'never') +
            '<span class="sub">' + u.live_sessions + ' session(s)</span></td>' +
          '<td class="num">' + money(u.available) + '</td>' +
          '<td class="num">' + money(u.reserve) + '</td>' +
          '<td class="num">' + money(u.locked) + '</td>' +
          '<td class="num">' + money(u.vesting) + '</td>' +
          '<td class="num">' + money(u.rewards) + '</td>' +
          '<td class="num">' + money(u.dep_usd) + '<span class="sub">' + u.dep_n + ' dep</span></td>' +
          '<td class="num">' + money(u.wd_usd) + '<span class="sub">' + u.wd_n + ' wd</span></td>' +
          '<td class="acts">' + acts + '</td>' +
        '</tr>';
      }).join('');
    } catch (_) {
      box.innerHTML = '<tr><td colspan="13" class="empty">Could not load.</td></tr>';
    }
  }
`;
usersJs += `  async function userAct(act, id, v){
    if (act === 'freeze' && v === '1' && !confirm('Freeze this user? They cannot request withdrawals until you unfreeze.')) return;
    if (act === 'admin' && v === '0' && !confirm('Remove admin rights from this user?')) return;
    if (act === 'pw' && !confirm('Set a new temporary password? All their sessions end now.')) return;
    var body = act === 'tier' ? { tier: Number(v) }
      : act === 'admin' ? { is_admin: v === '1' }
      : act === 'freeze' ? { frozen: v === '1' } : {};
    var r = await fetch('/admin/users/' + id + '/' + act, {
      method: 'POST',
      headers: h({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body)
    });
    var j = await r.json().catch(function(){ return {}; });
    if (!r.ok) { msg('uMsg', j.error || 'Failed.', 'err'); return; }
    msg('uMsg', j.password
      ? 'Temporary password: ' + j.password + ' - they must change it on next sign-in.'
      : 'Saved.', 'ok');
    loadUsers();
  }

  document.getElementById('uGo').onclick = function(){
    uState.q = document.getElementById('uSearch').value.trim();
    uState.offset = 0;
    loadUsers();
  };
  document.getElementById('uSearch').addEventListener('keydown', function(e){
    if (e.key === 'Enter') document.getElementById('uGo').onclick();
  });
  document.getElementById('uPrev').onclick = function(){
    uState.offset = Math.max(0, uState.offset - 50);
    loadUsers();
  };
  document.getElementById('uNext').onclick = function(){
    uState.offset += 50;
    loadUsers();
  };
  document.querySelectorAll('[data-sort]').forEach(function(b){
    b.onclick = function(){
      if (uState.sort === b.dataset.sort) uState.dir = uState.dir === 'asc' ? 'desc' : 'asc';
      else { uState.sort = b.dataset.sort; uState.dir = 'desc'; }
      uState.offset = 0;
      loadUsers();
    };
  });
  document.getElementById('users').addEventListener('click', function(e){
    var b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT') return;
    userAct(b.dataset.act, b.dataset.id, b.dataset.v);
  });
  document.getElementById('users').addEventListener('change', function(e){
    var s = e.target.closest('select[data-act]');
    if (s) userAct('tier', s.dataset.id, s.value);
  });

`;
patch('public/admin.html', [
  ['    <div class="card">\n      <span class="mono">Withdrawal queue</span>',
   card + '    <div class="card">\n      <span class="mono">Withdrawal queue</span>'],
  ["loadQueue(); loadClaims(); loadSweeps(); loadRuns(); }",
   "loadQueue(); loadClaims(); loadSweeps(); loadRuns(); loadUsers(); }"],
  ["  document.getElementById('gateGo').onclick = unlock;",
   usersJs + "  document.getElementById('gateGo').onclick = unlock;"],
]);
const css = `
.uhead{display:flex;gap:8px;align-items:center;margin-top:12px}
.uhead input{flex:1;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font:inherit;font-size:13px;background:#0a0a0b;color:var(--ink)}
.uhead input:focus{outline:none;border-color:var(--purple)}
#uTotals{margin-top:10px;font-family:"Space Mono",monospace;font-size:10.5px;letter-spacing:.06em;color:var(--ink-3);text-transform:uppercase}
.tblwrap{overflow-x:auto;margin-top:10px;border:1px solid var(--line);border-radius:12px}
table.tbl{width:100%;border-collapse:collapse;font-size:12.5px;min-width:1180px}
table.tbl th{text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);white-space:nowrap;background:#0a0a0b}
table.tbl th button{background:none;border:none;color:var(--ink-3);font:inherit;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:0}
table.tbl th button:hover{color:var(--purple)}
table.tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
table.tbl tr:last-child td{border-bottom:none}
table.tbl td.num{font-family:"Space Mono",monospace;white-space:nowrap;text-align:right}
table.tbl td.acts{white-space:nowrap}
.btn.sm{padding:5px 9px;font-size:11px;border-radius:7px}
select.tier{background:#0a0a0b;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:4px 6px;font:inherit;font-size:11px}
`;

const cssFile = 'public/admin.css';
writeFileSync(cssFile, readFileSync(cssFile, 'utf8').replace(/\r\n/g, '\n') + css);
console.log('ok ' + cssFile);
console.log('done');
