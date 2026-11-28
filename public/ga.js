(function () {
  var ID = 'G-CDXMR6PYQE';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', ID);
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
})();

window.track = function (name, params) {
  try {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  } catch (e) {}
};
