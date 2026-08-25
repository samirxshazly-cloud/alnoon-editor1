import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const MEMO_DIR = path.join(__dirname, 'data', 'memos');
const ASSET_DIR = path.join(__dirname, 'data', 'assets');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'alnoon-assets';
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY = 12 * 1024 * 1024;

await fs.mkdir(MEMO_DIR, { recursive: true });
await fs.mkdir(ASSET_DIR, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon'
};
const securityHeaders = {
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-frame-options':'SAMEORIGIN',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
};
const json = (res, status, data) => {
  res.writeHead(status, { ...securityHeaders, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const readBody = async (req) => {
  let size = 0; const chunks = [];
  for await (const c of req) {
    size += c.length; if (size > MAX_BODY) throw new Error('BODY_TOO_LARGE');
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};
const safeId = (v='') => /^[a-zA-Z0-9_-]{8,80}$/.test(v) ? v : null;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = () => crypto.randomBytes(24).toString('base64url');
const memoPath = id => path.join(MEMO_DIR, `${id}.json`);
const supaHeaders = (extra={}) => ({ apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, ...extra });
const toRow = m => ({ id:m.id, owner_hash:m.ownerHash, share_hash:m.shareHash||null, title:m.title, document:m.document, source_text:m.sourceText||'', created_at:m.createdAt, updated_at:m.updatedAt, version:m.version||1 });
const fromRow = r => ({ id:r.id, ownerHash:r.owner_hash, shareHash:r.share_hash||null, title:r.title, document:r.document, sourceText:r.source_text||'', createdAt:r.created_at, updatedAt:r.updated_at, version:r.version||1 });
async function loadMemo(id){
  if(!USE_SUPABASE) return JSON.parse(await fs.readFile(memoPath(id), 'utf8'));
  const r=await fetch(`${SUPABASE_URL}/rest/v1/memos?id=eq.${encodeURIComponent(id)}&select=*`,{headers:supaHeaders()});
  if(!r.ok) throw new Error(`SUPABASE_LOAD_${r.status}`); const rows=await r.json(); if(!rows?.[0]) throw new Error('NOT_FOUND'); return fromRow(rows[0]);
}
async function saveMemo(memo){
  if(!USE_SUPABASE) return fs.writeFile(memoPath(memo.id), JSON.stringify(memo, null, 2), 'utf8');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/memos?on_conflict=id`,{method:'POST',headers:supaHeaders({'content-type':'application/json','prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(toRow(memo))});
  if(!r.ok) throw new Error(`SUPABASE_SAVE_${r.status}:${await r.text()}`);
}
async function listOwnedMemos(ownerToken){
  if(!USE_SUPABASE){
    const files=await fs.readdir(MEMO_DIR).catch(()=>[]),items=[];
    for(const f of files.slice(-300)){if(!f.endsWith('.json'))continue;try{const m=JSON.parse(await fs.readFile(path.join(MEMO_DIR,f),'utf8'));if(canOwn(m,ownerToken))items.push({id:m.id,title:m.title,updatedAt:m.updatedAt,version:m.version});}catch{}}
    return items.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,40);
  }
  const h=sha(ownerToken);const r=await fetch(`${SUPABASE_URL}/rest/v1/memos?owner_hash=eq.${h}&select=id,title,updated_at,version&order=updated_at.desc&limit=40`,{headers:supaHeaders()});
  if(!r.ok) throw new Error(`SUPABASE_LIST_${r.status}`);return (await r.json()).map(x=>({id:x.id,title:x.title,updatedAt:x.updated_at,version:x.version}));
}
async function storeAsset(dataUrl){
  const m=String(dataUrl||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('INVALID_IMAGE_DATA');
  const ext=m[1]==='image/png'?'png':m[1]==='image/jpeg'?'jpg':'webp',name=`${randomToken()}.${ext}`,buf=Buffer.from(m[2],'base64');if(buf.length>8*1024*1024)throw new Error('IMAGE_TOO_LARGE');
  if(!USE_SUPABASE){await fs.writeFile(path.join(ASSET_DIR,name),buf);return name;}
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(name)}`,{method:'POST',headers:supaHeaders({'content-type':m[1],'x-upsert':'false'}),body:buf});if(!r.ok)throw new Error(`SUPABASE_ASSET_${r.status}:${await r.text()}`);return name;
}
async function readAsset(name){
  if(!USE_SUPABASE){const data=await fs.readFile(path.join(ASSET_DIR,name));return{data,type:name.endsWith('.png')?'image/png':name.endsWith('.jpg')?'image/jpeg':'image/webp'};}
  const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeURIComponent(name)}`,{headers:supaHeaders()});if(!r.ok)throw new Error('ASSET_NOT_FOUND');return{data:Buffer.from(await r.arrayBuffer()),type:r.headers.get('content-type')||'application/octet-stream'};
}
const safeHashEqual = (stored, token) => {
  if (!stored || !token) return false;
  const a = Buffer.from(String(stored), 'utf8');
  const b = Buffer.from(sha(token), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const canOwn = (memo, token) => safeHashEqual(memo?.ownerHash, token);
const canShare = (memo, token) => safeHashEqual(memo?.shareHash, token);

async function geminiGenerate({ apiKey, model='gemini-3.7-flash', system, prompt, jsonMode=true, thinkingLevel='low', schema=null }) {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20) throw new Error('INVALID_API_KEY');
  const allowed = new Set(['gemini-3.7-flash','gemini-3.6-flash','gemini-2.5-flash','gemini-2.5-flash-lite']);
  if (!allowed.has(model)) model = 'gemini-3.7-flash';
  let endpoint, body;
  if (model.startsWith('gemini-3.')) {
    // Interactions API is Google's recommended API for new Gemini projects (GA since June 2026).
    endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    body = {
      model,
      input: prompt,
      ...(system ? { system_instruction: system } : {}),
      store: false,
      generation_config: { thinking_level: thinkingLevel },
      ...(jsonMode ? { response_format: [{ type:'text', mime_type:'application/json', ...(schema ? { schema } : {}) }] } : {})
    };
  } else {
    // 2.5 compatibility path. generateContent remains fully supported.
    endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    body = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { ...(jsonMode ? { responseMimeType: 'application/json' } : {}), thinkingConfig: { thinkingBudget: 1024 } }
    };
  }
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error?.message || `Gemini HTTP ${r.status}`);
    err.code = data?.error?.status || String(r.status); throw err;
  }
  let text='';
  if(model.startsWith('gemini-3.')){
    text=(data.steps||[]).filter(s=>s.type==='model_output').flatMap(s=>s.content||[]).filter(c=>c.type==='text').map(c=>c.text||'').join('');
  }else{
    text=data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  }
  return { text, usage: data.usageMetadata || data.usage || null, modelVersion: data.modelVersion || data.model || model };
}

const ANALYSIS_SYSTEM = `أنت مساعد تخطيط لمحرر مذكرات تعليمية عربي. قاعدة مطلقة: لا تعِد كتابة أي نص ولا تصححه ولا تختصره. سيصلك مقاطع لها ids ثابتة. أعد JSON فقط يصف كل id: type من [title,subtitle,paragraph,list,question,equation,table,note], keepWithNext boolean, pageBreakBefore boolean, imageSlots 0..3, confidence 0..1. للمعادلة أضف chemistry: {direction:"ltr",condition?:string,arrow?:string,warning?:string}. لا تُرجع حقل text مطلقًا. إذا شككت في التصنيف اختر paragraph. لا تغيّر ترتيب ids.`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = decodeURIComponent(url.pathname);
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'النون لفهم العلوم', time: new Date().toISOString() });

    if (p === '/api/assets' && req.method === 'POST') {
      const ownerToken=req.headers['x-owner-token'];if(!ownerToken||String(ownerToken).length<24)return json(res,401,{error:'OWNER_TOKEN_REQUIRED'});
      const b=await readBody(req); const name=await storeAsset(b.dataUrl); return json(res,200,{ok:true,url:`/api/assets/${name}`});
    }
    const assetMatch=p.match(/^\/api\/assets\/([a-zA-Z0-9_-]+\.(?:webp|png|jpg))$/);
    if(assetMatch && req.method==='GET'){
      try{const a=await readAsset(assetMatch[1]);res.writeHead(200,{...securityHeaders,'content-type':a.type,'cache-control':'public, max-age=31536000, immutable'});return res.end(a.data);}catch{return json(res,404,{error:'ASSET_NOT_FOUND'});}
    }

    if (p === '/api/gemini/test' && req.method === 'POST') {
      const b = await readBody(req);
      const out = await geminiGenerate({ apiKey: b.apiKey, model: b.model, jsonMode: true, thinkingLevel: 'low', prompt: 'أعد JSON فقط بالشكل {"ok":true,"message":"connected"}.' });
      return json(res, 200, { ok: true, result: out });
    }
    if (p === '/api/gemini/analyze' && req.method === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.segments) || b.segments.length > 700) return json(res, 400, { error: 'INVALID_SEGMENTS' });
      const compact = b.segments.map(s => ({ id: s.id, text: String(s.text || '').slice(0, 12000) }));
      const prompt = `حلل المقاطع التالية للتنسيق فقط. لا تعد النص.\n${JSON.stringify(compact)}`;
      const out = await geminiGenerate({ apiKey: b.apiKey, model: b.model, system: ANALYSIS_SYSTEM, prompt, jsonMode: true, thinkingLevel: b.thinkingLevel || 'low' });
      let parsed; try { parsed = JSON.parse(out.text); } catch { parsed = null; }
      return json(res, 200, { ok: true, plan: parsed, raw: parsed ? undefined : out.text, usage: out.usage });
    }
    if (p === '/api/gemini/audit-chemistry' && req.method === 'POST') {
      const b = await readBody(req);
      const system = `أنت مدقق معادلات كيميائية. لا تعدل النص الأصلي. أعد JSON فقط: {items:[{id,valid:boolean,issues:[string],suggestedDisplay?:{conditionAboveArrow?:string,arrow?:string,direction:"ltr"}}]}. لا تقترح تغيير الصيغة الكيميائية نفسها إلا كتحذير نصي داخل issues.`;
      const prompt = JSON.stringify((b.items || []).slice(0, 200));
      const out = await geminiGenerate({ apiKey: b.apiKey, model: b.model, system, prompt, jsonMode: true, thinkingLevel: 'low' });
      let parsed; try { parsed = JSON.parse(out.text); } catch { parsed = { items: [] }; }
      return json(res, 200, { ok: true, audit: parsed, usage: out.usage });
    }

    if (p === '/api/memos' && req.method === 'POST') {
      const b = await readBody(req); const ownerToken = req.headers['x-owner-token'];
      if (!ownerToken || String(ownerToken).length < 24) return json(res, 401, { error: 'OWNER_TOKEN_REQUIRED' });
      const id = safeId(b.id) || crypto.randomUUID().replaceAll('-', '');
      let existing = null; try { existing = await loadMemo(id); } catch {}
      if (existing && !canOwn(existing, ownerToken) && !canShare(existing, b.shareToken)) return json(res, 403, { error: 'FORBIDDEN' });
      const memo = {
        ...(existing || {}), id, ownerHash: existing?.ownerHash || sha(ownerToken),
        title: String(b.title || existing?.title || 'مذكرة جديدة').slice(0, 180),
        document: b.document || existing?.document || null,
        sourceText: typeof b.sourceText === 'string' ? b.sourceText : (existing?.sourceText || ''),
        createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
        version: Number(existing?.version || 0) + 1
      };
      await saveMemo(memo); return json(res, 200, { ok: true, id, updatedAt: memo.updatedAt, version: memo.version });
    }
    if (p === '/api/memos' && req.method === 'GET') {
      const ownerToken = req.headers['x-owner-token']; if (!ownerToken) return json(res, 200, { items: [] });
      const items = await listOwnedMemos(ownerToken);
      return json(res, 200, { items });
    }
    const memoMatch = p.match(/^\/api\/memos\/([a-zA-Z0-9_-]{8,80})$/);
    if (memoMatch && req.method === 'GET') {
      const m = await loadMemo(memoMatch[1]); const ownerToken = req.headers['x-owner-token']; const shareToken = url.searchParams.get('share');
      if (!canOwn(m, ownerToken) && !canShare(m, shareToken)) return json(res, 403, { error:'FORBIDDEN' });
      const { ownerHash, shareHash, ...safe } = m; return json(res, 200, safe);
    }
    const shareMatch = p.match(/^\/api\/memos\/([a-zA-Z0-9_-]{8,80})\/share$/);
    if (shareMatch && req.method === 'POST') {
      const m = await loadMemo(shareMatch[1]); const ownerToken = req.headers['x-owner-token'];
      if (!canOwn(m, ownerToken)) return json(res, 403, { error:'FORBIDDEN' });
      const token = randomToken(); m.shareHash = sha(token); m.updatedAt = new Date().toISOString(); await saveMemo(m);
      return json(res, 200, { ok:true, token });
    }

    // Static files
    let filePath = p === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.resolve(PUBLIC_DIR, p.replace(/^\//,''));
    const rel = path.relative(PUBLIC_DIR, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return json(res, 403, { error:'FORBIDDEN' });
    try {
      const data = await fs.readFile(filePath); const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { ...securityHeaders, 'content-type': mime[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' }); res.end(data);
    } catch {
      if (!path.extname(p)) { const data = await fs.readFile(path.join(PUBLIC_DIR,'index.html')); res.writeHead(200, {...securityHeaders,'content-type':'text/html; charset=utf-8'}); return res.end(data); }
      json(res,404,{error:'NOT_FOUND'});
    }
  } catch (e) {
    console.error('[server]', e?.message || e);
    json(res, e?.message === 'BODY_TOO_LARGE' ? 413 : 500, { error: e?.code || 'SERVER_ERROR', message: e?.message || 'Unexpected error' });
  }
});
server.listen(PORT, '0.0.0.0', () => console.log(`AlNoon Editor: http://localhost:${PORT}`));
