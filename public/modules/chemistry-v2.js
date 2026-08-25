const esc=(s='')=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ARROW_RE=/(<=>|⇌|↔|<->|-->|->|=>|→|⟶)/g;
const KNOWN_CONDITION=/(?:حرارة|تسخين|heat|Δ|ضغط|pressure|ضوء|light|حفاز|عامل\s*مساعد|catalyst|Pt|Ni|MnO2)/i;

function arrows(text=''){return [...String(text).matchAll(ARROW_RE)]}
function sideFormulaCount(side=''){
  return (String(side).match(/(?:^|[\s+])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()[\]^+\-]*)/g)||[]).length;
}
export function detectChemicalEquation(text=''){
  const t=String(text).trim();
  const a=arrows(t);
  if(a.length!==1)return false;
  const idx=a[0].index||0,raw=a[0][0];
  const left=t.slice(0,idx),right=t.slice(idx+raw.length);
  const lf=sideFormulaCount(left),rf=sideFormulaCount(right);
  if(lf<1||rf<1)return false;
  const reactionShape=/\+/.test(left)||/\+/.test(right)||(lf===1&&rf===1);
  return reactionShape;
}

export function parseReactionArrow(text=''){
  const s=String(text);
  const explicit=[
    /-\[([^\]]{1,60})\]->/u,
    /-\(([^)]{1,60})\)->/u,
    /-\{([^}]{1,60})\}->/u,
    /\{([^}]{1,60})\}\s*(→|⟶|->|=>)/u
  ];
  for(const re of explicit){const m=s.match(re);if(m)return{raw:m[0],condition:m[1].trim(),arrow:'⟶',index:m.index};}
  const loose=s.match(/-\s*([^<>\n]{1,40}?)\s*->/u);
  if(loose&&KNOWN_CONDITION.test(loose[1].trim()))return{raw:loose[0],condition:loose[1].trim(),arrow:'⟶',index:loose.index};
  const direct=s.match(/(?:^|\s)(حرارة|تسخين|heat|Δ|ضغط|pressure|ضوء|light|حفاز|عامل\s*مساعد|catalyst)\s*(→|⟶|->|=>)/iu);
  if(direct){const whole=direct[0],lead=whole.length-whole.trimStart().length;return{raw:whole.trimStart(),condition:direct[1].trim(),arrow:'⟶',index:(direct.index||0)+lead};}
  const plain=s.match(/(<=>|⇌|↔|<->|-->|->|=>|→|⟶)/);
  if(!plain)return null;
  return{raw:plain[0],condition:'',arrow:/(<=>|⇌|↔|<->)/.test(plain[0])?'⇌':'⟶',index:plain.index};
}

function formatFormulaSegment(segment=''){
  let s=esc(segment);const stash=[];const hold=html=>`§§${stash.push(html)-1}§§`;
  s=s.replace(/\((aq|s|l|g)\)/gi,(_,st)=>hold(`<span class="chem-state">(${st})</span>`));
  s=s.replace(/((?:[A-Z][a-z]?\d*)+)\(\s*([+\-]?\d+|\d+[+\-])\s*\)/g,(_,formula,ox)=>{
    const formatted=formula.replace(/([A-Za-z\)])(\d+)/g,'$1<sub>$2</sub>');
    return hold(`<span class="chem-species">${formatted}<sup class="chem-oxidation">${ox}</sup></span>`);
  });
  s=s.replace(/\^\{?\(?([+\-]?\d+|\d+[+\-]|[+\-])\)?\}?/g,(_,v)=>hold(`<sup class="chem-charge">${v}</sup>`));
  s=s.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');
  s=s.replace(/§§(\d+)§§/g,(_,i)=>stash[Number(i)]||'');
  return s;
}

export function formatChemicalEquation(text=''){
  const source=String(text).trim(),a=parseReactionArrow(source);
  if(!a)return`<span class="chem-side">${formatFormulaSegment(source)}</span>`;
  const before=source.slice(0,a.index),after=source.slice(a.index+a.raw.length);
  return `<span class="chem-side">${formatFormulaSegment(before)}</span>`+
    `<span class="chem-arrow-wrapper" contenteditable="false" data-source="${esc(a.raw)}">`+
    `${a.condition?`<span class="chem-condition" dir="auto">${esc(a.condition)}</span>`:'<span class="chem-condition empty">&nbsp;</span>'}`+
    `<span class="chem-arrow ${a.arrow==='⇌'?'reversible':''}">${a.arrow}</span></span>`+
    `<span class="chem-side">${formatFormulaSegment(after)}</span>`;
}

export function chemistryWarnings(text=''){
  const w=[],a=parseReactionArrow(text);
  if(!a)w.push('لم يتم التعرف على سهم تفاعل واضح.');
  if(/\b(?:heat|حرارة|تسخين|ضغط|ضوء|حفاز|عامل مساعد)\b/i.test(text)&&a&&!a.condition)w.push('يوجد شرط تفاعل محتمل ويجب تثبيته أعلى السهم.');
  if(arrows(text).length>1)w.push('هذا السطر يحتوي عدة أسهم ويبدو تسلسلًا أو مخططًا أكثر من كونه معادلة تفاعل واحدة.');
  return w;
}

function renderPlainScientificArrows(raw=''){
  return esc(raw).replace(/(&lt;=&gt;|&lt;-&gt;|--&gt;|-&gt;|=&gt;|→|⟶|⇌|↔)/g,m=>{
    const reversible=/&lt;=&gt;|&lt;-&gt;|⇌|↔/.test(m),source=m.replaceAll('&lt;','<').replaceAll('&gt;','>');
    return `<span class="smart-arrow" contenteditable="false" data-source="${source}">${reversible?'⇌':'⟶'}</span>`;
  });
}

export function enhanceMixedText(text=''){
  const raw=String(text);
  if(!detectChemicalEquation(raw))return renderPlainScientificArrows(raw).replace(/\n/g,'<br>');
  const a=parseReactionArrow(raw);if(!a)return renderPlainScientificArrows(raw).replace(/\n/g,'<br>');
  const formulaMatches=[...raw.matchAll(/(?:\d+\s*)?[A-Z][A-Za-z0-9()[\]^+\-]*/g)];
  if(formulaMatches.length<2)return renderPlainScientificArrows(raw).replace(/\n/g,'<br>');
  const first=formulaMatches[0].index||0,last=formulaMatches.at(-1),end=(last.index||0)+last[0].length;
  const prefix=renderPlainScientificArrows(raw.slice(0,first)),chemistry=raw.slice(first,end),suffix=renderPlainScientificArrows(raw.slice(end));
  return `${prefix}<bdi class="chem-inline" dir="ltr">${formatChemicalEquation(chemistry)}</bdi>${suffix}`.replace(/\n/g,'<br>');
}
