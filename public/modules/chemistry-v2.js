const esc=(s='')=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function detectChemicalEquation(text=''){
  const t=String(text).trim();
  const hasArrow=/(?:-{1,2}>|→|⟶|⇌|↔|=>|<=>)/.test(t);
  const formulas=t.match(/(?:^|[\s+→⟶⇌=])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()\[\]^+\-]*)/g)||[];
  return hasArrow&&formulas.length>=2;
}

export function parseReactionArrow(text=''){
  const s=String(text);
  const patterns=[
    /--\s*([^-\n<>]{1,60}?)\s*-->/u,
    /-\[([^\]]{1,60})\]->/u,
    /-\(([^)]{1,60})\)->/u,
    /-\{([^}]{1,60})\}->/u,
    /-\s*([^\s\-<>][^\n<>]{0,59}?)\s*->/u,
    /\{([^}]{1,60})\}\s*(→|⟶|->|=>)/u
  ];
  for(const re of patterns){const m=s.match(re);if(m)return{raw:m[0],condition:m[1].trim(),arrow:'⟶',index:m.index};}
  const plain=s.match(/(<=>|⇌|↔|<->|-->|->|=>|→|⟶)/);
  if(!plain)return null;
  return{raw:plain[0],condition:'',arrow:/(<=>|⇌|↔|<->)/.test(plain[0])?'⇌':'⟶',index:plain.index};
}

function formatFormulaSegment(segment=''){
  let s=esc(segment);
  s=s.replace(/\^\{?\(?([+\-]?\d+|\d+[+\-]|[+\-])\)?\}?/g,'<sup>$1</sup>');
  s=s.replace(/([A-Za-z\)\]])(\d+)/g,'$1<sub>$2</sub>');
  s=s.replace(/\((aq|s|l|g)\)/gi,'<span class="chem-state">($1)</span>');
  return s;
}

export function formatChemicalEquation(text=''){
  const source=String(text).trim();
  const a=parseReactionArrow(source);
  if(!a)return`<span class="chem-side">${formatFormulaSegment(source)}</span>`;
  const before=source.slice(0,a.index),after=source.slice(a.index+a.raw.length);
  return `<span class="chem-side">${formatFormulaSegment(before)}</span>`+
    `<span class="chem-arrow-wrapper" contenteditable="false" data-source="${esc(a.raw)}">`+
    `${a.condition?`<span class="chem-condition" dir="auto">${esc(a.condition)}</span>`:'<span class="chem-condition empty">&nbsp;</span>'}`+
    `<span class="chem-arrow">${a.arrow}</span></span>`+
    `<span class="chem-side">${formatFormulaSegment(after)}</span>`;
}

export function chemistryWarnings(text=''){
  const w=[]; const a=parseReactionArrow(text);
  if(!a)w.push('لم يتم التعرف على سهم تفاعل واضح.');
  if(/\b(?:heat|حرارة|ضغط|ضوء|حفاز|عامل مساعد)\b/i.test(text)&&a&&!a.condition)w.push('يوجد شرط تفاعل محتمل ويجب تثبيته أعلى السهم.');
  if(/\b[A-Z][a-z]?\d+\s*[+\-]\b/.test(text)&&!/[\^]/.test(text))w.push('تحقق هل الرقم يمثل عدد ذرات أم شحنة/عدد تأكسد.');
  return w;
}

export function enhanceMixedText(text=''){
  const raw=String(text);
  if(!detectChemicalEquation(raw))return esc(raw).replace(/\n/g,'<br>');
  const lines=raw.split('\n');
  return lines.map(line=>{
    if(!detectChemicalEquation(line))return esc(line);
    const formulas=[...line.matchAll(/(?:\d+\s*)?[A-Z][A-Za-z0-9()\[\]^+\-]*/g)];
    if(formulas.length<2)return esc(line);
    const first=formulas[0].index||0;
    const last=formulas.at(-1); let end=(last.index||0)+last[0].length;
    const prefix=esc(line.slice(0,first));
    const chemistry=line.slice(first,end);
    const suffix=esc(line.slice(end));
    return `${prefix}<bdi class="chem-inline" dir="ltr">${formatChemicalEquation(chemistry)}</bdi>${suffix}`;
  }).join('<br>');
}
