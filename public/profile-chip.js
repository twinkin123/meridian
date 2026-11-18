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
    if (window.openSettings) window.openSettings();
  });

  who.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); who.click(); }
  });
})();/* greeting */
(function(){ var el = document.getElementById("welcome"); if (!el) return; var seen = false; try { seen = localStorage.getItem("mrd_seen") === "1"; } catch (e) {} el.textContent = seen ? "Welcome back" : "Welcome"; try { localStorage.setItem("mrd_seen", "1"); } catch (e) {} })();
