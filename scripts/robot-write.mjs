import { writeFileSync } from 'node:fs';
writeFileSync('public/robot-float.css', `.robot-float{display:none}
@media (max-width:900px){
  .robot-float{display:block;position:fixed;left:calc(50% - 92px);bottom:12px;width:64px;height:64px;z-index:60;pointer-events:none;background:radial-gradient(circle at 50% 58%,rgba(45,226,214,.22),transparent 70%);filter:drop-shadow(0 0 14px rgba(45,226,214,.4))}
  .robot-float img{display:block;width:100%;height:100%;object-fit:contain}
}
`);
writeFileSync('public/robot-float.js', `(function () {
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
`);
console.log('files written');
