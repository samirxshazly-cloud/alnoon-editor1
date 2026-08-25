let savedRange=null,savedRoot=null;
const FORMAT_HIGHLIGHT='format-selection';
const TOOL_SELECTOR='.selection-tools,#fontSize,#textColor,#highlightColor,#clearHighlight,#equationAdvancedTools';

function toast(msg,type='error'){
  const el=document.querySelector('#toast');
  if(!el)return;
  el.textContent=msg;
  el.className=`toast show ${type}`;
  clearTimeout(el._v52t);
  el._v52t=setTimeout(()=>el.className='toast',2800);
}
function rangeRoot(r){
  const node=r?.commonAncestorContainer?.nodeType===1?r.commonAncestorContainer:r?.commonAncestorContainer?.parentElement;
  return node?.closest?.('.frame-content')||null;
}
function paintPersistentSelection(){
  if(!savedRange||!document.contains(savedRoot))return;
  try{
    if(window.CSS?.highlights&&window.Highlight){
      CSS.highlights.set(FORMAT_HIGHLIGHT,new Highlight(savedRange.cloneRange()));
    }
  }catch{}
}
function clearPersistentSelection(){
  try{CSS.highlights?.delete(FORMAT_HIGHLIGHT)}catch{}
}
function remember(){
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount)return false;
  const r=sel.getRangeAt(0),root=rangeRoot(r);
  if(!root||r.collapsed)return false;
  savedRange=r.cloneRange();
  savedRoot=root;
  paintPersistentSelection();
  return true;
}
function restore(){
  if(!savedRange||!savedRoot||!document.contains(savedRoot))return null;
  try{
    const r=savedRange.cloneRange(),sel=window.getSelection();
    sel.removeAllRanges();sel.addRange(r);
    paintPersistentSelection();
    return r;
  }catch{return null}
}
function notify(){
  savedRoot?.dispatchEvent(new Event('input',{bubbles:true}));
  queueMicrotask(()=>paintPersistentSelection());
}
function selectInserted(span){
  const nr=document.createRange();nr.selectNodeContents(span);
  savedRange=nr.cloneRange();savedRoot=span.closest('.frame-content');
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(nr);
  paintPersistentSelection();
}
function wrap(style={},cls=''){
  const r=restore();if(!r||r.collapsed)return false;
  const span=document.createElement('span');if(cls)span.className=cls;Object.assign(span.style,style);
  try{span.append(r.extractContents());r.insertNode(span);selectInserted(span);notify();return true}catch{return false}
}
function exec(cmd,value=null){
  const r=restore();if(!r||r.collapsed)return false;
  try{document.execCommand(cmd,false,value);remember();notify();return true}catch{return false}
}

document.addEventListener('selectionchange',()=>{
  const sel=window.getSelection();
  if(sel?.rangeCount&&!sel.isCollapsed&&rangeRoot(sel.getRangeAt(0)))remember();
});
document.addEventListener('mouseup',e=>{if(e.target.closest('.frame-content'))remember()},true);
document.addEventListener('keyup',e=>{if(e.target.closest('.frame-content'))remember()},true);
document.addEventListener('pointerdown',e=>{
  if(e.target.closest(TOOL_SELECTOR)){paintPersistentSelection();return}
  if(e.target.closest('.frame-content'))clearPersistentSelection();
},true);

document.addEventListener('click',e=>{
  const b=e.target.closest('.selection-tools [data-format]');if(!b)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(!savedRange){toast('حدد جزءًا من النص أولًا.');return}
  const k=b.dataset.format;
  if(k==='bold')exec('bold');
  else if(k==='normal')wrap({fontWeight:'400'});
  else if(k==='italic')exec('italic');
  else if(k==='important')wrap({backgroundColor:'#fff0a8',fontWeight:'700'});
  else if(k==='rtl')wrap({direction:'rtl',unicodeBidi:'isolate'});
  else if(k==='ltr')wrap({direction:'ltr',unicodeBidi:'isolate'});
},true);

document.addEventListener('change',e=>{
  if(!['fontSize','textColor','highlightColor'].includes(e.target.id))return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(!savedRange){toast('حدد جزءًا من النص أولًا.');return}
  if(e.target.id==='fontSize')wrap({fontSize:`${Number(e.target.value)}px`});
  if(e.target.id==='textColor')wrap({color:e.target.value});
  if(e.target.id==='highlightColor')wrap({backgroundColor:e.target.value});
},true);

document.addEventListener('click',e=>{
  const b=e.target.closest('#clearHighlight');if(!b)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  if(!savedRange){toast('حدد الجزء المراد إزالة التظليل منه.');return}
  wrap({},'no-highlight');
},true);

function replaceTextSelection(ta,replacement,selectReplacement=false){
  const s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??s;
  ta.setRangeText(replacement,s,e,selectReplacement?'select':'end');
  ta.focus();
  ta.dispatchEvent(new Event('input',{bubbles:true}));
}
function selectedOrInsert(ta,transform){
  const s=ta.selectionStart??0,e=ta.selectionEnd??s,selected=ta.value.slice(s,e);
  replaceTextSelection(ta,transform(selected),true);
}
function firstArrowRange(v){
  const re=/-\[[^\]]{1,60}\]->|-\([^)]{1,60}\)->|-\{[^}]{1,60}\}->|<=>|<->|-->|->|=>|→|⟶|⇌|↔/;
  const m=v.match(re);return m?{start:m.index,end:m.index+m[0].length,raw:m[0]}:null;
}
function cleanEquationSpacing(v){
  return String(v).replace(/[ \t]*\+[ \t]*/g,' + ').replace(/[ \t]*(<=>|<->|-->|->|=>|→|⟶|⇌|↔)[ \t]*/g,' $1 ').replace(/[ \t]{2,}/g,' ').trim();
}
function insertCondition(ta,condition){
  if(!condition.trim()){toast('اكتب شرط التفاعل أولًا.');return}
  let v=ta.value;
  const explicit=/-\[[^\]]{1,60}\]->|-\([^)]{1,60}\)->|-\{[^}]{1,60}\}->/;
  if(explicit.test(v))v=v.replace(explicit,`-[${condition.trim()}]->`);
  else{
    const a=firstArrowRange(v);if(!a){toast('أضف سهم التفاعل أولًا.');return}
    v=v.slice(0,a.start)+`-[${condition.trim()}]->`+v.slice(a.end);
  }
  ta.value=v;ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();
}
function removeCondition(ta){
  ta.value=ta.value.replace(/-\[[^\]]{1,60}\]->/g,'->').replace(/-\([^)]{1,60}\)->/g,'->').replace(/-\{[^}]{1,60}\}->/g,'->');
  ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();
}
function replaceFirstArrow(ta,reversible=false){
  const a=firstArrowRange(ta.value),token=reversible?'<=>':'->';
  if(!a){replaceTextSelection(ta,` ${token} `);return}
  if(/^-\[|^-\(|^-\{/.test(a.raw)&&!reversible)return;
  ta.value=ta.value.slice(0,a.start)+token+ta.value.slice(a.end);
  ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();
}
function initEquationTools(){
  const ta=document.querySelector('#equationSource');if(!ta||document.querySelector('#equationAdvancedTools'))return;
  ta.dir='ltr';ta.style.textAlign='left';
  const panel=ta.closest('.panel');panel?.classList.add('open');
  const title=panel?.querySelector('.panel-title');if(title)title.childNodes[0].textContent='تنسيق المعادلات ';
  const box=document.createElement('div');box.id='equationAdvancedTools';box.className='equation-tools';
  box.innerHTML=`<div class="equation-tool-inputs"><label>القيمة الرقمية<input id="chemNumberValue" value="2" inputmode="text" placeholder="2 أو +2 أو -2"></label><label>شرط التفاعل<input id="chemConditionValue" placeholder="حرارة / ضغط / ضوء / حفاز"></label></div><div class="equation-tool-grid"><button type="button" data-chem="coefficient">معامل قبل الصيغة</button><button type="button" data-chem="subscript">عدد ذرات ↓</button><button type="button" data-chem="oxidation">عدد تأكسد ↑</button><button type="button" data-chem="charge">شحنة / أس ↑</button><button type="button" data-chem="arrow">سهم تفاعل ⟶</button><button type="button" data-chem="equilibrium">سهم اتزان ⇌</button><button type="button" data-chem="condition">شرط أعلى السهم</button><button type="button" data-chem="clear-condition">إزالة الشرط</button><button type="button" data-chem="clean">تنظيف المسافات</button><button type="button" data-chem="ltr">اتجاه LTR</button></div><small class="muted equation-help">حدد الرمز أو الصيغة داخل خانة المعادلة ثم استخدم الأداة. لا يتم حذف أي أداة تنسيق أخرى.</small>`;
  ta.insertAdjacentElement('afterend',box);
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-chem]');if(!b)return;e.preventDefault();
    const n=(document.querySelector('#chemNumberValue')?.value||'').trim()||'2',cond=document.querySelector('#chemConditionValue')?.value||'',k=b.dataset.chem;
    if(k==='coefficient')selectedOrInsert(ta,sel=>sel?`${n}${sel}`:n);
    else if(k==='subscript')selectedOrInsert(ta,sel=>sel?`${sel}${n}`:n);
    else if(k==='oxidation')selectedOrInsert(ta,sel=>sel?`${sel}(${n})`:`(${n})`);
    else if(k==='charge')selectedOrInsert(ta,sel=>sel?`${sel}^${n}`:`^${n}`);
    else if(k==='arrow')replaceFirstArrow(ta,false);
    else if(k==='equilibrium')replaceFirstArrow(ta,true);
    else if(k==='condition')insertCondition(ta,cond);
    else if(k==='clear-condition')removeCondition(ta);
    else if(k==='clean'){ta.value=cleanEquationSpacing(ta.value);ta.dispatchEvent(new Event('input',{bubbles:true}));ta.focus();}
    else if(k==='ltr'){ta.dir='ltr';ta.style.textAlign='left';ta.focus();}
  });
}

const ARROW=/(<=>|<->|-->|->|=>)/g;
function decorateArrows(root=document){
  const frames=root.matches?.('.frame-content')?[root]:[...root.querySelectorAll?.('.frame-content')||[]];
  for(const frame of frames){
    const walker=document.createTreeWalker(frame,NodeFilter.SHOW_TEXT),nodes=[];let n;
    while((n=walker.nextNode())){ARROW.lastIndex=0;if(!ARROW.test(n.nodeValue||'')){ARROW.lastIndex=0;continue}if(n.parentElement?.closest('.smart-arrow,.chem-inline,.chem-equation,[data-source]'))continue;nodes.push(n)}
    for(const node of nodes){const text=node.nodeValue||'',frag=document.createDocumentFragment();let last=0,m;ARROW.lastIndex=0;while((m=ARROW.exec(text))){if(m.index>last)frag.append(document.createTextNode(text.slice(last,m.index)));const sp=document.createElement('span');sp.className='smart-arrow';sp.contentEditable='false';sp.dataset.source=m[0];sp.textContent=/(<=>|<->)/.test(m[0])?'⇌':'⟶';frag.append(sp);last=ARROW.lastIndex}if(last<text.length)frag.append(document.createTextNode(text.slice(last)));node.replaceWith(frag)}
  }
}
const mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;if(n.matches?.('.frame-content')||n.querySelector?.('.frame-content'))decorateArrows(n)}});
mo.observe(document.documentElement,{childList:true,subtree:true});
function markVersion(){const small=document.querySelector('.brand small');if(small)small.textContent='محرر المذكرات التعليمية الذكي محليًا · V5.2';}
window.addEventListener('load',()=>{decorateArrows(document);initEquationTools();markVersion();});
queueMicrotask(()=>{initEquationTools();markVersion();});
