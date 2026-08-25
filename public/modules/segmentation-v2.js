export const normalizeSource = (source='') => String(source).replace(/\r\n?/g, '\n');

const TITLE_RE = /^(?:الكبسولة|الفصل|الباب|الوحدة|الدرس|الموضوع|المقدمة|الخلاصة|ملخص|نشاط|تدريب|تدريبات|أسئلة|سؤال|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً)\b/u;
const QUESTION_RE = /^(?:س\s*[:：.)-]?|سؤال\b|اختر\b|علل\b|فسر\b|قارن\b|أكمل\b|صحح\b|حدد\b|اذكر\b|وضح\b|ما\s|ماذا\s|كيف\s|لماذا\s|هل\s)/u;
const LIST_RE = /^(?:[-–—•●▪◦✓✔]|\d+[.)-]|[أ-ي][.)-])\s+/u;

function lineParts(line='') {
  if (line.includes('\t')) return line.split('\t').map(s=>s.trim());
  if (line.includes('|')) {
    const p=line.split('|').map(s=>s.trim());
    while (p.length && !p[0]) p.shift();
    while (p.length && !p.at(-1)) p.pop();
    if (p.length >= 2) return p;
  }
  const spaced=line.trim().split(/\s{2,}/u).map(s=>s.trim()).filter(Boolean);
  return spaced.length>=2 ? spaced : null;
}

export function looksLikeTable(text='') {
  const lines=String(text).split('\n').map(s=>s.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const parts=lines.map(lineParts);
  if (parts.some(x=>!x)) return false;
  const counts=parts.map(x=>x.length);
  const common=counts.sort((a,b)=>a-b)[Math.floor(counts.length/2)];
  return common>=2 && counts.filter(c=>Math.abs(c-common)<=1).length/lines.length>=0.8;
}

export function parseTableText(text='') {
  let lines=String(text).split('\n').map(s=>s.trim()).filter(Boolean);
  let rows=lines.map(lineParts).filter(Boolean);
  rows=rows.filter(r=>!r.every(c=>/^:?-{2,}:?$/.test(c)));
  const cols=Math.max(2,...rows.map(r=>r.length));
  rows=rows.map(r=>[...r,...Array(cols-r.length).fill('')]);
  return { rows, cols, header: rows.length>1 };
}

function detectFormulaCount(t='') {
  return (String(t).match(/(?:^|[\s+→⟶⇌=])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()\[\]^+\-]*)/g)||[]).length;
}

export function detectChemicalEquation(text='') {
  const t=String(text).trim();
  return /(?:-{1,2}>|→|⟶|⇌|↔|=>|<=>)/.test(t) && detectFormulaCount(t)>=2;
}

export function classifyLocal(text='') {
  const t=String(text).trim();
  if (!t) return 'paragraph';
  if (looksLikeTable(t)) return 'table';
  if (detectChemicalEquation(t)) {
    const arabic=(t.match(/[\u0600-\u06FF]/g)||[]).length;
    return arabic<=14 ? 'equation' : 'paragraph';
  }
  if (QUESTION_RE.test(t)) return 'question';
  if (LIST_RE.test(t)) return 'list';
  const lines=t.split('\n');
  if (lines.length===1) {
    const len=t.length;
    if (TITLE_RE.test(t) && len<=110) return len<=62?'title':'subtitle';
    if (len<=52 && !/[.!؟؛،:]\s*$/u.test(t)) return 'title';
    if (len<=95 && !/[.!؟؛]\s*$/u.test(t) && /[:：]$/.test(t)) return 'subtitle';
  }
  if (/^(?:ملاحظة|تنبيه|ملحوظة|هام)\s*[:：]/u.test(t)) return 'note';
  return 'paragraph';
}

function tokenizeLines(text) {
  const out=[]; let pos=0;
  while (pos<text.length) {
    const n=text.indexOf('\n',pos);
    if (n<0) { out.push(text.slice(pos)); break; }
    out.push(text.slice(pos,n+1)); pos=n+1;
  }
  if (!out.length && text==='') return [];
  return out;
}

function isBlankRaw(raw=''){ return raw.replace(/\n/g,'').trim()===''; }
function bare(raw=''){ return raw.replace(/\n$/,''); }
function structuralType(line=''){ return classifyLocal(line); }

export function segmentSource(source='') {
  const text=normalizeSource(source);
  const lines=tokenizeLines(text);
  const segments=[];
  let i=0, offset=0;
  const pushRaw=(raw,typeOverride=null)=>{
    if(!raw) return;
    const display=raw.replace(/\n+$/,'');
    if(!display.trim()) { if(segments.length) segments.at(-1).raw+=raw; return; }
    const seg={id:`s${segments.length+1}`,sourceStart:offset,sourceEnd:offset+raw.length,raw,text:display,type:typeOverride||classifyLocal(display)};
    segments.push(seg); offset+=raw.length;
  };

  while(i<lines.length){
    if(isBlankRaw(lines[i])) { if(segments.length){segments.at(-1).raw+=lines[i];segments.at(-1).sourceEnd+=lines[i].length;offset+=lines[i].length;} i++; continue; }
    const start=i;
    const first=bare(lines[i]);

    const p1=lineParts(first);
    if(p1){
      let j=i+1, candidates=1;
      while(j<lines.length&&!isBlankRaw(lines[j])){ const p=lineParts(bare(lines[j])); if(!p)break; candidates++; j++; }
      if(candidates>=2){ i=j; while(i<lines.length&&isBlankRaw(lines[i]))i++; pushRaw(lines.slice(start,i).join(''),'table'); continue; }
    }

    const ft=structuralType(first);
    if(['equation','title','subtitle','question','note'].includes(ft)){
      i++;
      if(ft==='question'){
        while(i<lines.length&&!isBlankRaw(lines[i])){
          const nt=structuralType(bare(lines[i]));
          if(['title','subtitle','question','table','equation'].includes(nt))break;
          i++;
        }
      }
      while(i<lines.length&&isBlankRaw(lines[i]))i++;
      pushRaw(lines.slice(start,i).join(''),ft); continue;
    }

    if(ft==='list'){
      i++;
      while(i<lines.length&&!isBlankRaw(lines[i])){
        const nt=structuralType(bare(lines[i]));
        if(nt!=='list')break; i++;
      }
      while(i<lines.length&&isBlankRaw(lines[i]))i++;
      pushRaw(lines.slice(start,i).join(''),'list'); continue;
    }

    i++;
    while(i<lines.length&&!isBlankRaw(lines[i])){
      const nt=structuralType(bare(lines[i]));
      if(nt!=='paragraph') break;
      i++;
    }
    while(i<lines.length&&isBlankRaw(lines[i]))i++;
    pushRaw(lines.slice(start,i).join(''),'paragraph');
  }

  let running=0;
  for(const s of segments){s.sourceStart=running;running+=s.raw.length;s.sourceEnd=running;}
  return segments;
}

export function verifyLossless(source,segments){
  return segments.map(s=>s.raw).join('')===normalizeSource(source);
}
