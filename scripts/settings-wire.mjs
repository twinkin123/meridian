import { readFileSync, writeFileSync } from 'node:fs';
const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
const before = s.length;

function rep(a, b) {
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' :: ' + a.slice(0, 60));
  s = s.split(a).join(b);
}

rep('<link rel="stylesheet" href="/faq.css?v=1">',
    '<link rel="stylesheet" href="/faq.css?v=1"><link rel="stylesheet" href="/settings.css?v=1">');
rep('<script src="/faq.js?v=1"></script>',
    '<script src="/faq.js?v=1"></script><script src="/settings.js?v=1"></script>');

const sec = s.indexOf('<section class="panel" id="p-settings">');
if (sec < 0) throw new Error('settings panel not found');
const end = s.indexOf('</section>', s.indexOf('id="pwMsg"></p>', sec));
if (end < 0) throw new Error('panel end not found');
s = s.slice(0, sec) + s.slice(end + '</section>'.length);

const blk = s.indexOf("(function(){  var list = document.getElementById('sessList');");
if (blk < 0) throw new Error('inline settings block not found');
const blkEnd = s.indexOf('})();</script>', blk);
if (blkEnd < 0) throw new Error('inline block end not found');
s = s.slice(0, blk) + s.slice(blkEnd + '})();</script>'.length);

writeFileSync(f, s);
console.log('app.html wired, ' + before + ' -> ' + s.length);
