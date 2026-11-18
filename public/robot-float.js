(function () {
  if (!window.matchMedia('(max-width:900px)').matches) return;
  if (document.querySelector('.robot-float')) return;
  var d = document.createElement('div');
  d.className = 'robot-float';
  var img = document.createElement('img');
  img.alt = '';
  img.decoding = 'async';
  img.src = '/img/robot.webp';
  img.onerror = function () { img.onerror = null; img.src = '/img/robot.png'; };
  d.appendChild(img);
  document.body.appendChild(d);
})();
