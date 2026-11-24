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
          '<div class="sup-sec sup-shot"><span>Screenshots</span>' +
            '<button type="button" id="supShot">Add screenshot</button></div>' +
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
      ov.querySelector('#supNote').textContent = 'Not wired to a mailbox yet - use support@quvio.io until it is.';
    });
    setTimeout(function () { ov.querySelector('#supTopic').focus(); }, 40);
  }

  link.addEventListener('click', function (e) { e.preventDefault(); open(); });
})();