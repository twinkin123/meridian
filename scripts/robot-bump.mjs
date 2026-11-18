import { readFileSync, writeFileSync } from 'node:fs';
const c = 'public/robot-float.css';
let s = readFileSync(c, 'utf8').replace(/\r\n/g, '\n');
s = s.split('z-index:60;pointer-events:none;').join('z-index:60;pointer-events:none;background:radial-gradient(circle at 50% 58%,rgba(45,226,214,.22),transparent 70%);');
writeFileSync(c, s);
const f = 'public/app.html';
writeFileSync(f, readFileSync(f, 'utf8')
  .split('/robot-float.css?v=3').join('/robot-float.css?v=4')
  .split('/robot-float.js?v=3').join('/robot-float.js?v=4'));
console.log('bumped');
