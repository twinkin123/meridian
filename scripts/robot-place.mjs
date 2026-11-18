import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync('public/robot-float.css', `.robot-float{display:none}
@media (max-width:900px){
  .robot-float{display:block;position:fixed;left:calc(50% - 92px);bottom:12px;width:64px;height:64px;z-index:34;pointer-events:none;filter:drop-shadow(0 0 14px rgba(45,226,214,.35))}
  .robot-float video{display:block;width:100%;height:100%;object-fit:contain}
}
`);

const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
if (!s.includes('robot-float.css')) {
  const n = s.split('/compound.css?v=4').length - 1;
  if (n !== 1) throw new Error('css anchor ' + n);
  s = s.split('/compound.css?v=4').join('/compound.css?v=4"><link rel="stylesheet" href="/robot-float.css?v=2');
}
if (!s.includes('robot-float.js')) {
  const a = '<script src="/compound.js?v=4"></script>';
  if (s.split(a).length - 1 !== 1) throw new Error('js anchor');
  s = s.split(a).join(a + '<script src="/robot-float.js?v=2"></script>');
}
writeFileSync(f, s);
console.log('positioned');
