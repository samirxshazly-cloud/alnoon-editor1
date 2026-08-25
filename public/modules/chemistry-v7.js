const esc=(s='')=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ARROW_RE=/(<=>|<->|⇌|↔|-->|->|=>|→|⟶)/g;
const COND_WORD=/(?:حرارة|تسخين|heat|Δ|ضغط|pressure|ضوء|light|حفاز|عامل\s*مساعد|catalyst|Pt|Ni|MnO2)/i;

function formulaCount(side=''){
  return (String(side).match(/(?:^|[\s+])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()\[\]_\^+\-]*)/g)||[]).length;
}
export function detectChemicalEquation(text=''){
  const s=String(text).trim();
  const arrows=[...s.matchAll(ARROW_RE)];
  if(arrows.length!==1) return false;
  const a=arrows[0], i=a.index||0;
  const left=s.slice(0,i), right=s.slice(i+a[0].length);
  return formulaCount(left)>=1 && formulaCount(right)>=1;
}
export function parseArrow(text=''){
  const s=String(text);
  const explicit=[/-\[([^\]]{1,60})\]->/u,/-\{([^}]{1,60})\}->/u];
  for(const re of explicit){const m=s.match(re);if(m)return{raw:m[0],condition:m[1].trim(),type:'single',index:m.index||0};}
  const loose=s.match(/-\s*([^<>\n]{1,40}?)\s*->/u);
  if(loose&&COND_WORD.test(loose[1].trim())) return{raw:loose[0],condition:loose[1].trim(),type:'single',index:loose.index||0};
  const m=s.match(/(<=>|<->|⇌|↔|-->|->|=>|→|⟶)/);
  if(!m)return null;
  return{raw:m[0],condition:'',type:/(<=>|<->|⇌|↔)/.test(m[0])?'reversible':'single',index:m.index||0};
}
function svgArrow(type='single'){
  if(type==='reversible') return `<svg viewBox="0 0 56 22" aria-hidden="true"><path d="M3 7 H46"/><path d="M40 2 L47 7 L40 12"/><path d="M53 15 H10"/><path d="M16 10 L9 15 L16 20"/></svg>`;
  return `<svg viewBox="0 0 56 18" aria-hidden="true"><path d="M3 9 H47"/><path d="M40 3 L49 9 L40 15"/></svg>`;
}
function arrowHTML(type,condition=''){
  return `<span class="chem-arrow-box" contenteditable="false">${condition?`<span class="chem-condition">${esc(condition)}</span>`:''}<span class="chem-arrow-svg">${svgArrow(type)}</span></span>`;
}
function naturalFormula(html=''){
  let s=html,stash=[];const hold=x=>`§${stash.push(x)-1}§`;
  s=s.replace(/\((aq|s|l|g)\)/gi,(_,v)=>hold(`<span class="chem-state">(${v})</span>`));
  s=s.replace(/_\{?([0-9]+)\}?/g,(_,v)=>hold(`<sub>${v}</sub>`));
  s=s.replace(/\^\{?\(?([+\-]?\d+|\d+[+\-]|[+\-])\)?\}?/g,(_,v)=>hold(`<sup>${v}</sup>`));
  s=s.replace(/((?:[A-Z][a-z]?\d*)+|\))(\(\s*([+\-]?\d+|\d+[+\-])\s*\))/g,(_,species,_all,ox)=>{const fs=species.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');return hold(`${fs}<sup class="chem-oxidation">${ox}</sup>`)});
  s=s.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');
  s=s.replace(/([A-Za-z0-9\)\]])([+\-])(?=\s|$|\+)/g,'$1<sup>$2</sup>');
  s=s.replace(/§(\d+)§/g,(_,i)=>stash[Number(i)]||'');
  return s;
}
function formatSide(side=''){
  const escaped=esc(String(side).trim());
  return naturalFormula(escaped);
}
export function formatChemicalEquation(text=''){
  const source=String(text).trim();const a=parseArrow(source);
  if(!a)return `<span class="chem-side">${formatSide(source)}</span>`;
  const left=source.slice(0,a.index).trim(), right=source.slice(a.index+a.raw.length).trim();
  return `<span class="equation-line"><span class="chem-side">${formatSide(left)}</span>${arrowHTML(a.type,a.condition)}<span class="chem-side">${formatSide(right)}</span></span>`;
}
export function enhanceMixedText(text=''){
  const raw=String(text);
  return raw.split('\n').map(line=>{
    if(!detectChemicalEquation(line)) return esc(line).replace(/(\s*)(<=>|<->|-->|->|=>|→|⟶|⇌|↔)(\s*)/g,(_m,_a,a)=>arrowHTML(/<=>|<->|⇌|↔/.test(a)?'reversible':'single',''));
    const a=parseArrow(line);if(!a)return esc(line);
    const formulas=[...line.matchAll(/(?:\d+\s*)?[A-Z][A-Za-z0-9()\[\]_\^+\-]*/g)];
    if(formulas.length<2)return esc(line);
    const first=formulas[0].index||0,last=formulas.at(-1),end=(last.index||0)+last[0].length;
    return `${esc(line.slice(0,first))}<bdi class="chem-inline" dir="ltr">${formatChemicalEquation(line.slice(first,end))}</bdi>${esc(line.slice(end))}`;
  }).join('<br>');
}
export function setArrow(text,type='single'){
  const s=String(text);const a=parseArrow(s);const token=type==='reversible'?'<=>':'->';
  if(!a)return `${s.trim()} ${token} `;
  const cond=a.condition?`-[${a.condition}]->`:token;
  const repl=type==='reversible'?'<=>':cond;
  return s.slice(0,a.index).trimEnd()+' '+repl+' '+s.slice(a.index+a.raw.length).trimStart();
}
export function setCondition(text,condition=''){
  const s=String(text),a=parseArrow(s);if(!a)return s;
  const token=a.type==='reversible'?'<=>':condition?`-[${condition.trim()}]->`:'->';
  return s.slice(0,a.index).trimEnd()+' '+token+' '+s.slice(a.index+a.raw.length).trimStart();
}
export function chemistryWarnings(text=''){
  const w=[],s=String(text),a=parseArrow(s);if(!a)w.push('لا يوجد سهم تفاعل واضح.');
  if((s.match(ARROW_RE)||[]).length>1)w.push('السطر يحتوي أكثر من سهم؛ قد يكون سلسلة نشاط لا معادلة واحدة.');
  if(COND_WORD.test(s)&&a&&!a.condition)w.push('يوجد شرط تفاعل محتمل غير مثبت أعلى السهم.');
  return w;
}
