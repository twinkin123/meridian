import { readFileSync, writeFileSync } from 'node:fs';
const c = 'public/robot-float.css';
let s = readFileSync(c, 'utf8').replace(/\r\n/g, '\n');
s = s.split('left:calc(50% - 92px);bottom:12px;').join('right:12px;bottom:12px;');
s = s.split('background:radial-gradient(circle at 50% 58%,rgba(45,226,214,.22),transparent 70%);').join('-webkit-mask-image:radial-gradient(ellipse 52% 52% at 50% 50%,#000 52%,transparent 92%);mask-image:radial-gradient(ellipse 52% 52% at 50% 50%,#000 52%,transparent 92%);');
writeFileSync(c, s);
const f = 'public/app.html';
writeFileSync(f, readFileSync(f, 'utf8').split('/robot-float.css?v=4').join('/robot-float.css?v=5'));
console.log('corner + mask');
