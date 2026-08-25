import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('server saves, lists and shares a memo', { timeout: 12000 }, async () => {
  const port = 43177;
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] });
  await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>reject(new Error('server start timeout')),4000);
    child.stdout.on('data',d=>{if(String(d).includes('http://localhost')){clearTimeout(timer);resolve();}});
    child.once('exit',c=>reject(new Error('server exited '+c)));
  });
  const base=`http://127.0.0.1:${port}`;
  const owner='owner_test_abcdefghijklmnopqrstuvwxyz_123456789';
  const id='doc_servertest1234';
  let assetFile=null;
  try {
    let r=await fetch(base+'/api/memos',{method:'POST',headers:{'content-type':'application/json','x-owner-token':owner},body:JSON.stringify({id,title:'اختبار',sourceText:'نص',document:{id,title:'اختبار',pages:[]}})});
    assert.equal(r.ok,true);
    r=await fetch(base+'/api/memos',{headers:{'x-owner-token':owner}});const list=await r.json();assert.equal(list.items.some(x=>x.id===id),true);
    r=await fetch(`${base}/api/memos/${id}/share`,{method:'POST',headers:{'x-owner-token':owner}});const share=await r.json();assert.ok(share.token);
    r=await fetch(`${base}/api/memos/${id}?share=${encodeURIComponent(share.token)}`,{headers:{'x-owner-token':'other_owner_abcdefghijklmnopqrstuvwxyz987'}});assert.equal(r.ok,true);const memo=await r.json();assert.equal(memo.sourceText,'نص');
    const tiny='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    r=await fetch(base+'/api/assets',{method:'POST',headers:{'content-type':'application/json','x-owner-token':owner},body:JSON.stringify({dataUrl:tiny})});const asset=await r.json();assert.equal(r.ok,true);assert.match(asset.url,/^\/api\/assets\//);assetFile=path.basename(asset.url);
    r=await fetch(base+asset.url);assert.equal(r.ok,true);assert.match(r.headers.get('content-type')||'',/^image\//);
  } finally {
    child.kill('SIGTERM');
    await fs.rm(path.join(root,'data','memos',`${id}.json`),{force:true});
    if(assetFile)await fs.rm(path.join(root,'data','assets',assetFile),{force:true});
  }
});
