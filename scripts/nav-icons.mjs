import { readFileSync, writeFileSync } from 'node:fs';

writeFileSync('public/nav-icons.css', `html body .side a{display:flex;align-items:center;gap:9px}
html body .side a .ico{display:grid !important;place-items:center;width:16px;height:16px;flex:0 0 auto;opacity:.7}
html body .side a .ico svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
html body .side a:hover .ico,html body .side a.on .ico{opacity:1}
@media (max-width:900px){html body .side a{gap:7px}html body .side a .ico,html body .side a .ico svg{width:15px;height:15px}}
`);

const icons = {
  '&#9636;': '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  '&#9650;': '<svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></svg>',
  '&#9660;': '<svg viewBox="0 0 24 24"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>',
  '&#8801;': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  '&#8962;': '<svg viewBox="0 0 24 24"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>',
  '&#9881;': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 11a2 2 0 1 1 0 4Z"/></svg>',
  '?': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.2.9-1.2 1.7v.3"/><path d="M12 17.1h.01"/></svg>',
  '&#43;': '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>',
};

const f = 'public/app.html';
let s = readFileSync(f, 'utf8');
for (const [ent, svg] of Object.entries(icons)) {
  const a = '<span class="ico">' + ent + '</span>';
  const n = s.split(a).length - 1;
  if (n !== 1) throw new Error('want 1, got ' + n + ' for ' + ent);
  s = s.split(a).join('<span class="ico">' + svg + '</span>');
}
s = s.split('</head>').join('<link rel="stylesheet" href="/nav-icons.css?v=1"></head>');
writeFileSync(f, s);
console.log('icons in');
