import {detectChemicalEquation} from './chemistry-v7.js';
const LIST=/^(?:[-•●▪◦✓✔]|(?:\d+|[٠-٩]+)[.)\-–—]|[أ-ي][.)\-–—])\s+/u;
const QUESTION=/^(?:س\s*[:：.)-]?|سؤال|اختر|علل|فسر|قارن|أكمل|صحح|اذكر|وضح|حدد|استنتج|ما\s|ماذا\s|كيف\s|لماذا\s|هل\s)/u;
const IMPORTANT=/^(?:مهم|ملحوظة|ملاحظة|تنبيه|انتبه|تذكر|قاعدة|خلاصة|استنتاج|تعريف)\s*[:：\-–—]?/u;
const TITLE=/^(?:الوحدة|الباب|الفصل|الدرس|الكبسولة|الموضوع|القسم|القانون|قانون|تعريف|مفهوم|مقارنة|ملاحظات|ملخص|خلاصة|نشاط|تجربة|مثال|تدريب|أسئلة)\b/u;
const TABLE_HEADER=/(?:وجه المقارنة|نوع العامل|نوع المقاومة|المصطلح|الخاصية|التطبيق|العنصر|الصفة|المقارنة)/u;
export function atomizeSource(source=''){
  const s=String(source).replace(/\r\n?/g,'\n'),out=[];let start=0,n=0;
  for(let i=0;i<s.length;i++)if(s[i]==='\n'){const raw=s.slice(start,i+1),text=raw.slice(0,-1);out.push({id:`a${++n}`,raw,text,blank:!text.trim()});start=i+1}
  if(start<s.length){const raw=s.slice(start);out.push({id:`a${++n}`,raw,text:raw,blank:!raw.trim()})}
  return out;
}
export const sourceIsLossless=(source,atoms)=>atoms.map(a=>a.raw).join('')===String(source).replace(/\r\n?/g,'\n');
function cells(line){const t=String(line).trim();if(!t)return[];if(t.includes('\t'))return t.split('\t').map(x=>x.trim());if(t.includes('|'))return t.split('|').map(x=>x.trim()).filter(Boolean);return t.split(/\s{2,}/).map(x=>x.trim()).filter(Boolean)}
function numberingCell(v=''){return /^(?:\d+|[٠-٩]+)[.)]?$/.test(v.trim())}
export function looksLikeRealTable(lines){
  const non=lines.map(x=>String(x).trim()).filter(Boolean);if(non.length<2)return false;
  const rows=non.map(cells),usable=rows.filter(r=>r.length>=2);if(usable.length/non.length<.8)return false;
  const max=Math.max(...usable.map(r=>r.length)),min=Math.min(...usable.map(r=>r.length));if(max-min>1)return false;
  if(max===2&&usable.every(r=>numberingCell(r[0])))return false;
  const joined=non.join(' '),hasHeader=TABLE_HEADER.test(joined);
  return hasHeader||max>=3||usable.length>=3;
}
function arabicCount(s){return (String(s).match(/[\u0600-\u06ff]/g)||[]).length}
function equationOnly(s){return detectChemicalEquation(s)&&arabicCount(s)<Math.max(10,s.length*.2)}
function classify(line,prevBlank=false,nextBlank=false){const s=line.trim();if(!s)return'blank';if(LIST.test(s))return'list';if(QUESTION.test(s))return'question';if(IMPORTANT.test(s))return'important';if(equationOnly(s))return'equation';let score=0;if(s.length<70)score+=2;if(s.length<38)score++;if(prevBlank)score++;if(nextBlank)score+=.5;if(TITLE.test(s))score+=3;if(/[.!؟؛]$/.test(s))score-=2;if(s.split(/\s+/).length>12)score-=2;return score>=5?'title':score>=3?'subtitle':'paragraph'}
export function analyzeLocal(atoms){
  const plans=new Map();atoms.forEach((a,i)=>{if(a.blank)return;plans.set(a.id,{id:a.id,type:classify(a.text,!atoms[i-1]||atoms[i-1].blank,!atoms[i+1]||atoms[i+1].blank),group:null,keepWithNext:false,pageBreakBefore:false})});
  let i=0;while(i<atoms.length){if(atoms[i].blank){i++;continue}let j=i;while(j<atoms.length&&!atoms[j].blank)j++;const block=atoms.slice(i,j);if(looksLikeRealTable(block.map(a=>a.text)))block.forEach(a=>{const p=plans.get(a.id);if(p)p.type='table'});i=j}
  let gid=0,current=null,currentType=null;
  for(const a of atoms){if(a.blank){current=null;currentType=null;continue}const p=plans.get(a.id);const t=p.type;let fresh=!current||['title','subtitle','question','important','equation','table'].includes(t)||t!==currentType;if(t==='list'&&currentType==='list')fresh=false;if(t==='paragraph'&&currentType==='paragraph')fresh=false;if(fresh){current=`g${++gid}`;currentType=t}p.group=current;if(['title','subtitle'].includes(t))p.keepWithNext=true;if(t==='title'&&/^(?:الوحدة|الباب|الفصل|الكبسولة)\b/u.test(a.text.trim()))p.pageBreakBefore=true}
  return plans;
}
export function buildLocalGroups(atoms,plans){const groups=[];let cur=null;const flush=()=>{if(cur){cur.text=cur.lines.join('\n');groups.push(cur);cur=null}};for(const a of atoms){if(a.blank){flush();continue}const p=plans.get(a.id);if(!cur||cur.group!==p.group||cur.type!==p.type){flush();cur={group:p.group,type:p.type,lines:[],atomIds:[],keepWithNext:p.keepWithNext,pageBreakBefore:p.pageBreakBefore}}cur.lines.push(a.text);cur.atomIds.push(a.id);cur.keepWithNext||=p.keepWithNext;cur.pageBreakBefore||=p.pageBreakBefore}flush();return groups}
