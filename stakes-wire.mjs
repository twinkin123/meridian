import { readFileSync, writeFileSync } from 'node:fs';

const H = 'public/app.html';
let s = readFileSync(H, 'utf8');

const set = (a, b) => { if (!s.includes(a)) throw new Error('miss: ' + a.slice(0, 40)); s = s.replace(a, b); };

set('<div class="st-meta"><span class="st-bal">3.28942304 SOL</span><button type="button">MAX</button><i>&#183;</i><button type="button">50%</button><i>&#183;</i><button type="button">%</button></div>',
    '<div class="st-meta"><span class="st-bal" id="stBal">$0.00</span><button type="button" id="stMax">MAX</button><i>&#183;</i><button type="button" id="stHalf">50%</button><i>&#183;</i><button type="button" id="stPct">%</button></div>');

set('<input class="st-input" value="1000" inputmode="decimal" aria-label="Stake amount">',
    '<input class="st-input" id="stAmt" value="" placeholder="0.00" inputmode="decimal" aria-label="Stake amount">');

set('<button type="button">$100</button><button type="button">$500</button><button class="on" type="button">$1,000</button><button type="button">$5,000</button>',
    '<button type="button" data-amt="100">$100</button><button type="button" data-amt="500">$500</button><button type="button" data-amt="1000">$1,000</button><button type="button" data-amt="5000">$5,000</button>');

set('<b class="st-proj-v">$10.00 &#8211; $40.00</b>', '<b class="st-proj-v" id="stProj">&ndash;</b>');
set('<em>at 1&#8211;4% daily, before the 15% fee</em>', '<em id="stProjNote">at the last applied rate, before the 15% fee</em>');

set('<b class="st-today-v">+2.97%</b>', '<b class="st-today-v" id="stRate">&ndash;</b>');
set('<span>November 20, 2026</span>', '<span id="stDate">Today</span>');
set('<button type="button" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="m14.5 6-6 6 6 6"/></svg></button>',
    '<button type="button" id="stPrev" aria-label="Previous day"><svg viewBox="0 0 24 24"><path d="m14.5 6-6 6 6 6"/></svg></button>');
set('<button type="button" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></svg></button>',
    '<button type="button" id="stNext" aria-label="Next day"><svg viewBox="0 0 24 24"><path d="m9.5 6 6 6-6 6"/></svg></button>');

set('<button class="st-cta" type="button" disabled>Lock $1,000 for 30 days</button>',
    '<button class="st-cta" type="button" id="stCta" disabled>Enter an amount</button>');

// calculator ids already sc* ; give its chips values
set('<button type="button">$100</button><button class="on" type="button">$1k</button><button type="button">$5k</button><button type="button">$25k</button><button type="button">$100k</button>',
    '<button type="button" data-val="100">$100</button><button class="on" type="button" data-val="1000">$1k</button><button type="button" data-val="5000">$5k</button><button type="button" data-val="25000">$25k</button><button type="button" data-val="100000">$100k</button>');

const tag = '<script src="/compound.js?v=6"></script>';
if (!s.includes(tag)) throw new Error('script anchor not found');
s = s.replace(tag, tag + '<script src="/stake.js?v=1"></script>');

writeFileSync(H, s);
console.log('page wired');
