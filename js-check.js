
(function(){
  var gone = false;
  async function guard(){
    if (gone || document.hidden) return;
    try {
      var r = await fetch('/me', { cache: 'no-store' });
      if (r.status === 401) { gone = true; location.replace('/auth.html'); }
    } catch (_) {}
  }
  guard();
  setInterval(guard, 1500);
  window.addEventListener('pageshow', guard);
  window.addEventListener('focus', guard);
  document.addEventListener('visibilitychange', guard);
})();

