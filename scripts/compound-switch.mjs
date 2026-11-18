import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync('public/compound.css', `.cmp{position:absolute;top:14px;right:186px;display:inline-flex;align-items:center;gap:8px;padding:0;border:0;background:none;color:var(--ink-3);font-family:"Space Mono",monospace;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
.cmp-lbl{white-space:nowrap}
.cmp-track{position:relative;flex:none;width:36px;height:20px;border-radius:99px;background:rgba(255,255,255,.1);border:1px solid var(--line-2);transition:background .18s ease,border-color .18s ease}
.cmp-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#cfcfda;transition:transform .18s ease,background .18s ease}
.cmp.on .cmp-track{background:#3b82f6;border-color:#3b82f6}
.cmp.on .cmp-knob{transform:translateX(16px);background:#fff}
.cmp.on .cmp-lbl{color:var(--txt)}
@media (max-width:620px){.cmp{position:static;margin:0 0 0 8px;vertical-align:middle;font-size:9px}}
`);

const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
const a = '<button class="cmp on" id="cmpToggle" type="button" aria-pressed="true"><span class="dot"></span>Auto compound</button>';
const b = '<button class="cmp on" id="cmpToggle" type="button" aria-pressed="true"><span class="cmp-lbl">Auto compound</span><span class="cmp-track"><span class="cmp-knob"></span></span></button>';
const n = s.split(a).length - 1;
if (n !== 1) throw new Error('anchor ' + n);
s = s.split(a).join(b).split('/compound.css?v=1').join('/compound.css?v=2');
writeFileSync(f, s);
console.log('switch');
