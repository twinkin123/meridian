/* profile-chip.js - header identity reads "Profile" and opens Settings. Loaded last. */
(function(){
  'use strict';
  var who = document.getElementById('who');
  if (!who) return;

  function relabel(){
    var t = who.textContent.trim();
    if (t && t !== 'Profile') who.title = t + ' - settings';
    if (t !== 'Profile') who.textContent = 'Profile';
  }

  relabel();
  new MutationObserver(relabel).observe(who, { childList: true, characterData: true, subtree: true });

  who.setAttribute('role', 'button');
  who.setAttribute('tabindex', '0');

  who.addEventListener('click', function(){
    var b = document.querySelector('[data-panel="p-settings"]');
    if (b) b.click();
  });

  who.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); who.click(); }
  });
})();