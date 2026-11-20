/* dash-align-v3 - set the notification and referral boxes to a shared bottom line. */
(function(){
  'use strict';
  var raf = 0, busy = false;

  function cards(){
    return [document.getElementById('notesCard'), document.querySelector('.ref-list-card')];
  }

  function run(){
    var c = cards();
    if (!c[0] || !c[1]) return;
    var desktop = window.matchMedia('(min-width:901px)').matches;

    c.forEach(function(el){ el.style.removeProperty('height'); });
    if (!desktop) return;

    var a = c[0].getBoundingClientRect();
    var b = c[1].getBoundingClientRect();
    var target = Math.max(a.bottom, b.bottom);

    c.forEach(function(el){
      var r = el.getBoundingClientRect();
      el.style.setProperty('height', Math.max(0, Math.round(target - r.top)) + 'px', 'important');
    });
  }

  function schedule(){
    if (raf) return;
    raf = requestAnimationFrame(function(){ raf = 0; run(); });
  }

  function observe(){
    var c = cards();
    if (!c[0] || !c[1] || typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(function(){
      if (busy) return;
      busy = true;
      schedule();
      setTimeout(function(){ busy = false; }, 80);
    });
    c.forEach(function(el){ ro.observe(el); });
  }

  schedule();
  observe();
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  [150, 600, 1500, 3000].forEach(function(t){ setTimeout(schedule, t); });
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) schedule(); });
  var notes = document.getElementById('notes');
  if (notes && typeof MutationObserver !== 'undefined') new MutationObserver(schedule).observe(notes, { childList: true });
  var refs = document.getElementById('refList');
  if (refs && typeof MutationObserver !== 'undefined') new MutationObserver(schedule).observe(refs, { childList: true });
})();