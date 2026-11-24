(function () {
  var link = document.getElementById('contactOpen');
  if (!link) return;
  var ov = null;
  function close() { if (!ov) return; ov.remove(); ov = null; document.body.classList.remove('wl-lock'); }

  function open() {
    if (ov) return;
    ov = document.createElement('div');
    ov.className = 'tr-ov';
    ov.innerHTML =
      '<div class="tr-sheet" role="dialog" aria-modal="true" aria-label="Contact support">' +
        '<div class="tr-head"><span class="tr-ico">&#9993;</span><h3>Contact support</h3>' +
        '<a class="tr-x" href="#!" aria-label="Close">&times;</a></div>' +
        '<form class="sup" id="supForm">' +
          '<div class="sup-sec"><label for="supTopic">Topic</label>' +
            '<select id="supTopic"><option>Select a topic</option><option>Deposit</option>' +
            '<option>Withdrawal</option><option>Account</option><option>Referral</option>' +
            '<option>Something else</option></select>' +
            '<div class="sup-chips"><button class="sup-chip" type="button">Deposit not credited</button>' +
            '<button class="sup-chip" type="button">Withdrawal delayed</button>' +
            '<button class="sup-chip" type="button">Wrong network</button></div></div>' +
          '<div class="sup-sec"><div class="sup-row"><div><label for="supNet">Network</label>' +
            '<select id="supNet"><option>Select</option><option>Solana</option><option>Base</option>' +
            '<option>Ethereum</option><option>Other</option></select></div>' +
            '<div><label for="supTok">Token</label>' +
            '<select id="supTok"><option>Select</option><option>USDC</option><option>SOL</option>' +
            '<option>ETH</option><option>Other</option></select></div></div>' +
            '<div style="margin-top:12px"><label for="supAmt">Amount</label>' +
            '<input id="supAmt" placeholder="0.00" inputmode="decimal"></div></div>' +
          '<div class="sup-sec"><label for="supTx">Transaction hash</label>' +
            '<div class="sup-tx"><input id="supTx" placeholder="Paste the signature">' +
            '<label class="sup-none"><input type="checkbox" id="supNoTx"> None</label></div>' +
            '<div style="margin-top:12px"><label for="supAddr">Address sent to</label>' +
            '<input id="supAddr" placeholder="Your deposit address"></div></div>' +
          '<div class="sup-sec"><label for="supBody">What happened</label>' +
            '<textarea id="supBody" placeholder="Include times, amounts and anything you already tried."></textarea></div>' +
          '<button class="sup-send" type="submit">Send</button>' +
          '<p class="sup-note" id="supNote"></p>' +
        '</form></div>';
    document.body.appendChild(ov);
    document.body.classList.add('wl-lock');
    ov.querySelector('.tr-x').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    ov.querySelectorAll('.sup-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        var t = c.textContent;
        ov.querySelector('#supTopic').value = t.indexOf('Deposit') === 0 ? 'Deposit'
          : t.indexOf('Withdrawal') === 0 ? 'Withdrawal' : 'Something else';
        ov.querySelector('#supBody').value = t + '. ';
        ov.querySelector('#supBody').focus();
      });
    });
    ov.querySelector('#supForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var note = ov.querySelector('#supNote');
      var send = ov.querySelector('.sup-send');
      if (send.disabled) return;
      var topic = ov.querySelector('#supTopic').value;
      var body = ov.querySelector('#supBody').value.trim();
      if (topic === 'Select a topic') { note.textContent = 'Pick a topic first.'; return; }
      if (body.length < 5) { note.textContent = 'Tell us what happened.'; return; }
      send.disabled = true;
      note.textContent = 'Sending...';
      fetch('/support/ticket', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic,
          network: ov.querySelector('#supNet').value,
          token: ov.querySelector('#supTok').value,
          amount: ov.querySelector('#supAmt').value,
          txHash: ov.querySelector('#supNoTx').checked ? '' : ov.querySelector('#supTx').value,
          address: ov.querySelector('#supAddr').value,
          body: body
        })
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (d) {
          if (d && d.ok) {
            ov.querySelector('#supForm').innerHTML = '<div class="sup-done"><h4>Ticket sent</h4>' +
              '<p>We reply to your account email. Most tickets are answered within a few hours.</p></div>';
            return;
          }
          send.disabled = false;
          note.textContent = d && d.error === 'rate_limited'
            ? 'Too many tickets. Try again in a few minutes.'
            : 'Could not send. Email support@quvio.io instead.';
        })
        .catch(function () {
          send.disabled = false;
          note.textContent = 'Could not send. Email support@quvio.io instead.';
        });
    });
    setTimeout(function () { ov.querySelector('#supTopic').focus({ preventScroll: true }); }, 40);
  }

  link.addEventListener('click', function (e) { e.preventDefault(); open(); });
})();
