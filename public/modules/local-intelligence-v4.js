import {detectChemicalEquation} from './chemistry-v2.js';

const AR=/[\u0600-\u06ff]/g;
const TITLE_WORDS=/^(?:الوحدة|الباب|الفصل|الدرس|الكبسولة|الموضوع|القسم|أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|القانون|قانون|تعريف|مفهوم|مقارنة|ملاحظات|ملخص|خلاصة|نشاط|تجربة|مثال|تدريب|أسئلة|تذكر|استنتاج)\b/u;
const QUESTION=/^(?:س\s*[:：.)-]?|سؤال|اختر|علل|فسر|قارن|أكمل|صحح|اذكر|وضح|حدد|استنتج|ما\s|ماذا\s|كيف\s|لماذا\s|هل\s)/u;
const IMPORTANT=/^(?:مهم|ملحوظة|ملاحظة|تنبيه|انتبه|تذكر|قاعدة|خلاصة|استنتاج|تعريف)\s*[:：\-–—]?/u;
const LIST=/^(?:[-•●▪◦✓✔]|(?:\d+|[٠-٩]+)[.)\-–—]|[أ-ي][.)\-–—])\s+/u;
const TABLE_HEADER=/^(?:وجه المقارنة|نوع العامل|نوع المقاومة|المصطلح|الخاصية|التطبيق|العنصر|الصفة|المقارنة)\b/u;

export function atomizeSource(source=''){
  const s=String(source).replace(/\r\n?/g,'\n');
  const atoms=[]; let start=0, n=0;
  for(let i=0;i<s.length;i++){
    if(s[i]==='\n'){
      const raw=s.slice(start,i+1), text=raw.slice(0,-1);
      atoms.push({id:`a${++n}`,raw,text,blank:!text.trim(),start,end:i+1});
      start=i+1;
    }
  }
  if(start<s.length){
    const raw=s.slice(start);
    atoms.push({id:`a${++n}`,raw,text:raw,blank:!raw.trim(),start,end:s.length});
  }
  if(!atoms.length && s) atoms.push({id:'a1',raw:s,text:s,blank:!s.trim(),start:0,end:s.length});
  return atoms;
}
export function sourceIsLossless(source,atoms){
  return atoms.map(a=>a.raw).join('')===String(source).replace(/\r\n?/g,'\n');
}
function arabicCount(s){return (String(s).match(AR)||[]).length}
function latinFormulaCount(s){
  return (String(s).match(/(?:^|[\s+→⟶⇌=])(?:\d+\s*)?[A-Z][a-z]?(?:[A-Za-z0-9()[\]^+\-]*)/g)||[]).length;
}
function lineTableCols(line){
  const t=String(line).trim();
  if(!t) return {mode:null,cells:[]};
  if(t.includes('\t')) return {mode:'tab',cells:t.split('\t').map(x=>x.trim())};
  if(t.includes('|')){
    const cells=t.split('|').map(x=>x.trim()).filter((x,i,a)=>x || (i>0&&i<a.length-1));
    if(cells.length>=2) return {mode:'pipe',cells};
  }
  const spaced=t.split(/\s{2,}/).map(x=>x.trim()).filter(Boolean);
  if(spaced.length>=2) return {mode:'space',cells:spaced};
  return {mode:null,cells:[t]};
}
export function looksLikeTableLines(lines){
  const non=lines.map(x=>String(x).trim()).filter(Boolean);
  if(non.length<2) return false;
  const parsed=non.map(lineTableCols);
  const usable=parsed.filter(x=>x.cells.length>=2);
  if(usable.length<2) return false;
  const counts=usable.map(x=>x.cells.length);
  return usable.length/non.length>=0.75 && Math.max(...counts)-Math.min(...counts)<=1;
}
function equationOnly(t){
  if(!detectChemicalEquation(t)) return false;
  const ar=arabicCount(t), formulas=latinFormulaCount(t);
  return formulas>=2 && (ar<=12 || ar<Math.max(8,t.length*.18));
}
function headingScore(t, prevBlank, nextBlank, prevText='', nextText=''){
  let score=0;
  const s=t.trim();
  if(!s) return -99;
  if(s.length<=70) score+=2;
  if(s.length<=40) score+=1.5;
  if(prevBlank) score+=1.2;
  if(nextBlank) score+=.4;
  if(TITLE_WORDS.test(s)) score+=2.8;
  if(/[:：]\s*$/.test(s) && s.length<=90) score+=.7;
  if(/[.!؟؛]\s*$/.test(s)) score-=2;
  if(QUESTION.test(s)) score-=3;
  if(LIST.test(s)) score-=3;
  if(detectChemicalEquation(s)) score-=4;
  if(s.split(/\s+/).length>13) score-=2;
  if(nextText && nextText.length>90 && s.length<60) score+=.8;
  if(prevText && prevText.length<55 && !prevBlank) score-=.5;
  return score;
}
function classifyLine(t, ctx={}){
  const s=t.trim();
  if(!s) return 'blank';
  if(equationOnly(s)) return 'equation';
  if(QUESTION.test(s)) return 'question';
  if(IMPORTANT.test(s)) return 'important';
  if(LIST.test(s)) return 'list';
  if(TABLE_HEADER.test(s)) return 'tableCandidate';
  const hs=headingScore(s,ctx.prevBlank,ctx.nextBlank,ctx.prevText,ctx.nextText);
  if(hs>=4.7) return 'title';
  if(hs>=3.0) return 'subtitle';
  return 'paragraph';
}
function normalizeTableDirection(text){return arabicCount(text)>0?'rtl':'ltr'}
function extractImportantPhrases(text,type){
  const t=String(text);
  const out=[];
  if(type==='important'){
    const m=t.match(/^([^:：\-–—]{2,40})\s*[:：\-–—]/u);
    if(m) out.push(m[1].trim());
  }
  for(const m of t.matchAll(/(?:^|\n)\s*([^:\n]{2,35})\s*[:：]\s*/gu)){
    const p=m[1].trim();
    if(p.split(/\s+/).length<=6) out.push(p);
  }
  return [...new Set(out)].slice(0,5);
}
function imageSlotsFor(type,text){
  if(['title','subtitle','equation','table','important'].includes(type)) return 0;
  if(type==='note') return 1;
  if(type==='paragraph') return 1;
  if(['question','list'].includes(type)) return 1;
  return 0;
}
export function analyzeLocal(atoms){
  const plans=new Map();
  atoms.forEach((a,i)=>{
    if(a.blank) return;
    const prev=atoms[i-1], next=atoms[i+1];
    const type=classifyLine(a.text,{prevBlank:!prev || prev.blank,nextBlank:!next || next.blank,prevText:prev?.text?.trim()||'',nextText:next?.text?.trim()||''});
    plans.set(a.id,{id:a.id,type,group:null,keepWithNext:false,pageBreakBefore:false,imageSlots:0,importance:'normal',importantPhrases:[],tableDirection:'auto',confidence:.75});
  });

  let i=0;
  while(i<atoms.length){
    if(atoms[i].blank){i++;continue}
    let j=i;while(j<atoms.length && !atoms[j].blank) j++;
    const block=atoms.slice(i,j);let r=0;
    while(r<block.length){
      let k=r;while(k<block.length && lineTableCols(block[k].text).cells.length>=2) k++;
      const run=block.slice(r,k);
      if(run.length>=2 && looksLikeTableLines(run.map(x=>x.text))){
        for(const a of run){const p=plans.get(a.id);p.type='table';p.tableDirection=normalizeTableDirection(run.map(x=>x.text).join('\n'));p.confidence=.94;}
      }
      r=k===r?r+1:k;
    }
    i=j;
  }

  let groupCounter=0,currentGroup=null,currentType=null,prevNon=null;
  for(const a of atoms){
    if(a.blank){currentGroup=null;currentType=null;prevNon=null;continue}
    const p=plans.get(a.id);let newGroup=false;
    if(!currentGroup)newGroup=true;
    else if(['title','subtitle','question','important','equation'].includes(p.type))newGroup=true;
    else if(p.type==='table'&&currentType!=='table')newGroup=true;
    else if(p.type==='list'&&currentType!=='list')newGroup=true;
    else if(currentType==='paragraph'&&p.type==='paragraph'){
      const prevText=prevNon?.text?.trim()||'';
      if(/[.!؟؛:]\s*$/.test(prevText)&&a.text.trim().length<55&&headingScore(a.text,true,false,prevText,'')>=3)newGroup=true;
    }else if(currentType!==p.type)newGroup=true;
    if(newGroup){currentGroup=`g${++groupCounter}`;currentType=p.type}
    p.group=currentGroup;prevNon=a;
  }

  const non=atoms.filter(a=>!a.blank);
  for(let n=0;n<non.length;n++){
    const a=non[n],p=plans.get(a.id),next=non[n+1]&&plans.get(non[n+1].id);
    if(['title','subtitle'].includes(p.type))p.keepWithNext=true;
    if(p.type==='title'&&n>0)p.pageBreakBefore=/^(?:الوحدة|الباب|الفصل|الكبسولة)\b/u.test(a.text.trim());
    p.importance=p.type==='important'?'important':'normal';
    p.importantPhrases=extractImportantPhrases(a.text,p.type);
    p.imageSlots=imageSlotsFor(p.type,a.text);
    if(p.type==='table')p.tableDirection=normalizeTableDirection(a.text);
    if(p.type==='tableCandidate')p.type='subtitle';
    if(next&&p.type==='title'&&next.type==='subtitle')p.keepWithNext=true;
  }
  return plans;
}
export function buildLocalGroups(atoms,plans){
  const groups=[];let cur=null;
  const flush=()=>{if(cur){cur.text=cur.lines.join('\n');groups.push(cur);cur=null}};
  for(const a of atoms){
    if(a.blank){flush();continue}
    const p=plans.get(a.id);if(!p)continue;
    if(!cur||cur.group!==p.group||cur.type!==p.type){flush();cur={group:p.group,type:p.type,lines:[],atomIds:[],keepWithNext:!!p.keepWithNext,pageBreakBefore:!!p.pageBreakBefore,imageSlots:Number(p.imageSlots||0),importance:p.importance||'normal',importantPhrases:[],tableDirection:p.tableDirection||'auto'};}
    cur.lines.push(a.text);cur.atomIds.push(a.id);cur.keepWithNext||=!!p.keepWithNext;cur.pageBreakBefore||=!!p.pageBreakBefore;cur.imageSlots=Math.max(cur.imageSlots,Number(p.imageSlots||0));cur.importantPhrases.push(...(p.importantPhrases||[]).filter(x=>a.text.includes(x)));if(p.tableDirection!=='auto')cur.tableDirection=p.tableDirection;
  }
  flush();return groups;
}
