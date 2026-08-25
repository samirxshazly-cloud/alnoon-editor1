const esc=(s='')=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const ARROWS=/(<=>|⇌|↔|<->|-->|->|=>|→|⟶)/g;
const CONDITION_WORDS=/^(?:حرارة|تسخين|heat|Δ|ضغط|pressure|ضوء|light|حفاز|عامل\s*مساعد|catalyst|Pt|Ni|MnO2)$/i;

export function arrowMatches(text=''){return [...String(text).matchAll(ARROWS)];}
function formulaCount(side=''){
  return (String(side).match(/(?:^|[\s+])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()\[\]^+\-]*)/g)||[]).length;
}
export function detectChemicalEquation(text=''){
  const s=String(text).trim(), a=arrowMatches(s);
  if(a.length!==1) return false;
  const i=a[0].index||0, raw=a[0][0];
  const left=s.slice(0,i), right=s.slice(i+raw.length);
  return formulaCount(left)>=1 && formulaCount(right)>=1 && (/\+/.test(left)||/\+/.test(right)||formulaCount(left)===1||formulaCount(right)===1);
}

export function parseReactionArrow(text=''){
  const s=String(text);
  const explicit=[/-\[([^\]]{1,50})\]->/u,/-\(([^)]{1,50})\)->/u,/-\{([^}]{1,50})\}->/u];
  for(const re of explicit){const m=s.match(re); if(m) return {raw:m[0],condition:m[1].trim(),kind:'forward',index:m.index};}
  const loose=s.match(/-\s*([^<>\n]{1,32}?)\s*->/u);
  if(loose && CONDITION_WORDS.test(loose[1].trim())) return {raw:loose[0],condition:loose[1].trim(),kind:'forward',index:loose.index};
  const plain=s.match(/(<=>|⇌|↔|<->|-->|->|=>|→|⟶)/);
  if(!plain) return null;
  return {raw:plain[0],condition:'',kind:/(<=>|⇌|↔|<->)/.test(plain[0])?'equilibrium':'forward',index:plain.index};
}

function formatFormula(raw=''){
  let s=esc(raw.trim());
  const stash=[]; const hold=h=>`§${stash.push(h)-1}§`;
  s=s.replace(/\((aq|s|l|g)\)/gi,(_,st)=>hold(`<span class="chem-state">(${st})</span>`));
  s=s.replace(/([A-Za-z][A-Za-z0-9()\[\]]*)\(\s*([+\-]?\d+|\d+[+\-]|0)\s*\)/g,(_,formula,ox)=>{
    const f=formula.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');
    return hold(`<span class="chem-species">${f}<sup class="chem-oxidation">${ox}</sup></span>`);
  });
  s=s.replace(/\^\{?\(?([+\-]?\d+|\d+[+\-]|[+\-])\)?\}?/g,(_,v)=>hold(`<sup class="chem-charge">${v}</sup>`));
  s=s.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');
  s=s.replace(/§(\d+)§/g,(_,i)=>stash[Number(i)]||'');
  return s;
}

function arrowSvg(kind='forward'){
  if(kind==='equilibrium') return `<svg class="chem-arrow-svg equilibrium" viewBox="0 0 64 24" aria-hidden="true"><path d="M5 8 H53"/><path d="M47 4 L55 8 L47 12"/><path d="M59 16 H11"/><path d="M17 12 L9 16 L17 20"/></svg>`;
  return `<svg class="chem-arrow-svg" viewBox="0 0 64 20" aria-hidden="true"><path d="M5 10 H55"/><path d="M48 4 L58 10 L48 16"/></svg>`;
}
export function formatChemicalEquation(text=''){
  const source=String(text).trim(), a=parseReactionArrow(source);
  if(!a) return `<span class="chem-side">${formatFormula(source)}</span>`;
  const left=source.slice(0,a.index).trim(), right=source.slice(a.index+a.raw.length).trim();
  return `<span class="chem-side">${formatFormula(left)}</span><span class="chem-arrow-wrap" contenteditable="false" data-source="${esc(a.raw)}">${a.condition?`<span class="chem-condition">${esc(a.condition)}</span>`:''}${arrowSvg(a.kind)}</span><span class="chem-side">${formatFormula(right)}</span>`;
}
export function renderScientificArrows(raw=''){
  return esc(raw).replace(/(&lt;=&gt;|&lt;-&gt;|--&gt;|-&gt;|=&gt;|→|⟶|⇌|↔)/g,m=>{
    const reversible=/&lt;=&gt;|&lt;-&gt;|⇌|↔/.test(m); return `<span class="inline-arrow" contenteditable="false">${arrowSvg(reversible?'equilibrium':'forward')}</span>`;
  });
}
export function enhanceMixedText(text=''){
  const raw=String(text);
  if(!detectChemicalEquation(raw)) return renderScientificArrows(raw).replace(/\n/g,'<br>');
  const a=parseReactionArrow(raw); if(!a) return renderScientificArrows(raw).replace(/\n/g,'<br>');
  const formulas=[...raw.matchAll(/(?:\d+\s*)?[A-Z][A-Za-z0-9()\[\]^+\-]*/g)];
  if(formulas.length<2) return renderScientificArrows(raw).replace(/\n/g,'<br>');
  const first=formulas[0].index||0,last=formulas.at(-1),end=(last.index||0)+last[0].length;
  return `${renderScientificArrows(raw.slice(0,first))}<bdi class="chem-inline" dir="ltr">${formatChemicalEquation(raw.slice(first,end))}</bdi>${renderScientificArrows(raw.slice(end))}`.replace(/\n/g,'<br>');
}
export function chemistryWarnings(text=''){
  const out=[], a=parseReactionArrow(text);
  if(!a) out.push('لم يتم التعرف على سهم تفاعل واضح.');
  if(arrowMatches(text).length>1) out.push('السطر يحتوي عدة أسهم ويبدو تسلسلاً/مخططًا لا معادلة واحدة.');
  if(/\b(?:حرارة|تسخين|heat|ضغط|ضوء|حفاز|عامل مساعد)\b/i.test(text)&&a&&!a.condition) out.push('يوجد شرط تفاعل محتمل غير مثبت فوق السهم.');
  return out;
}
export function setArrow(text='',kind='forward'){
  const a=parseReactionArrow(text); if(!a) return `${String(text).trim()} ${kind==='equilibrium'?'⇌':'->'} `;
  const rep=kind==='equilibrium'?'⇌':'->'; return String(text).slice(0,a.index).trimEnd()+` ${rep} `+String(text).slice(a.index+a.raw.length).trimStart();
}
export function setCondition(text='',condition=''){
  const a=parseReactionArrow(text); if(!a) return text;
  const c=String(condition).trim(); const arrow=a.kind==='equilibrium'?'⇌':'->';
  const token=c?`-[${c}]->`:arrow;
  return String(text).slice(0,a.index).trimEnd()+` ${token} `+String(text).slice(a.index+a.raw.length).trimStart();
}
