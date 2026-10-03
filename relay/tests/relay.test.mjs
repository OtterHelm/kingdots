import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../worker/relay.js';

async function fixture(t){
  const db=new DatabaseSync(':memory:');
  const migrations=new URL('../drizzle/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(new URL(file,migrations),'utf8'));
  t.after(()=>db.close());
  const wrap=(sql,args=[])=>({sql,args,bind:(...next)=>wrap(sql,next),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture-device-secret'));
  const env={DB:{prepare:sql=>wrap(sql),batch:async statements=>{db.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}},DEVICE_PAIR_DIGEST:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
  const request=(path,{who,device=false,body,method}={})=>worker.fetch(new Request('https://fixture.invalid'+path,{method:method??(body?'POST':'GET'),headers:{...(who?{'oai-authenticated-user-id':who}:{}),...(device?{'x-kingdots-device':'fixture-device-secret'}:{}),'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),env);
  const call=(name,args={},who='fixture-owner')=>request('/mcp',{who,body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}}});
  const decoded=async response=>{const data=await response.json();return {error:data.error??(data.result?.isError?JSON.parse(data.result.content[0].text).error:null),value:data.result?.content?JSON.parse(data.result.content[0].text):data.result};};
  return {db,request,call,decoded};
}
test('static discovery has two bounded tools and does not bind an owner or expose records',async t=>{
  const f=await fixture(t), response=await f.request('/mcp',{body:{id:1,method:'tools/list'}});
  const result=(await response.json()).result;
  assert.deepEqual(result.tools.map(t=>t.name),['inspect_existing_session','record_no_action_review']);
  assert.equal(f.db.prepare('SELECT count(*) n FROM relay_meta').get().n,0);
  assert.equal((await f.request('/device/jobs')).status,401);
  assert.equal((await f.call('record_no_action_review',{},null)).status,401);
  assert.equal((await f.decoded(await f.call('record_no_action_review',{},null))).error,'authenticated_user_required');
});
test('supervisor request is claimed once; result and no-action decision are correlated and replay-safe',async t=>{
  const f=await fixture(t);
  assert.equal((await (await f.request('/device/jobs',{device:true})).json()).job,null);
  const pending=f.call('inspect_existing_session',{commandId:'fixture-read-1'});
  let batch;
  for(let i=0;i<20;i++){batch=await (await f.request('/device/jobs',{device:true})).json();if(batch.job)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(batch.job);
  assert.equal((await (await f.request('/device/jobs',{device:true})).json()).job,null);
  const bad=await f.request('/device/result',{device:true,body:{requestId:batch.job.id,nonce:'bad',snapshot:{}}});
  assert.equal(bad.status,409);
  const snapshot={state:'running',observedAt:new Date().toISOString(),records:'existing fixture conversation',inspectionId:'cannot-override',nonce:'cannot-override',sessionAlias:'cannot-override'};
  assert.equal((await f.request('/device/result',{device:true,body:{requestId:batch.job.id,nonce:batch.job.nonce,snapshot}})).status,200);
  const read=await f.decoded(await pending);
  assert.equal(read.error,null);assert.equal(read.value.inspectionId,batch.job.id);assert.equal(read.value.nonce,batch.job.nonce);assert.equal(read.value.sessionAlias,'selected-existing-session');
  const review={inspectionId:batch.job.id,nonce:batch.job.nonce,reason:'fixture only'};
  assert.equal((await f.decoded(await f.call('record_no_action_review',{...review,nonce:'bad'}))).error,'uncorrelated_review');
  assert.equal((await f.decoded(await f.call('record_no_action_review',review))).error,null);
  assert.equal((await f.decoded(await f.call('record_no_action_review',review))).error,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM relay_decisions').get().n,1);
  assert.equal((await f.decoded(await f.call('record_no_action_review',{...review,reason:'changed'}))).error,'review_idempotency_conflict');
  const decisions=await (await f.request('/device/jobs',{device:true})).json();assert.equal(decisions.decisions.length,1);
  await f.request('/device/decision-collected',{device:true,body:{inspectionId:batch.job.id}});
  assert.equal((await (await f.request('/device/jobs',{device:true})).json()).decisions.length,0);
  const repeat=await f.decoded(await f.call('inspect_existing_session',{commandId:'fixture-read-1'}));assert.equal(repeat.value.nonce,batch.job.nonce);
});
test('another owner and arbitrary target cannot access the selected-session transport',async t=>{
  const f=await fixture(t);
  assert.equal((await f.decoded(await f.call('inspect_existing_session',{commandId:'scope-test',sessionId:'another-session'}))).error,'invalid_arguments');
  assert.equal(f.db.prepare('SELECT count(*) n FROM relay_requests').get().n,0);
  assert.equal((await f.decoded(await f.call('record_no_action_review',{},'different-owner'))).error,'different_owner');
  assert.equal((await f.call('record_no_action_review',{},'different-owner')).status,403);
  assert.equal((await f.request('/device/jobs',{who:'fixture-owner'})).status,401);
});
test('expired snapshots and decisions are not returned or treated as a current review',async t=>{
  const f=await fixture(t);
  f.db.prepare('INSERT INTO relay_requests VALUES (?,?,?,?,?,?,?)').run('expired-read','fixture-owner','old-nonce','done','{}',0,1);
  f.db.prepare('INSERT INTO relay_decisions VALUES (?,?,?,?,?,?)').run('expired-read','fixture-owner','{}',0,0,1);
  const result=await f.decoded(await f.call('record_no_action_review',{inspectionId:'expired-read',nonce:'old-nonce',reason:'stale'}));
  assert.equal(result.error,'uncorrelated_review');
  assert.equal(f.db.prepare("SELECT state,snapshot FROM relay_requests WHERE id='expired-read'").get().state,'expired');
  assert.equal(f.db.prepare("SELECT snapshot FROM relay_requests WHERE id='expired-read'").get().snapshot,null);
  assert.equal(f.db.prepare('SELECT count(*) n FROM relay_decisions').get().n,0);
  const reused=await f.decoded(await f.call('inspect_existing_session',{commandId:'expired-read'}));
  assert.equal(reused.error,'inspection_expired');
  assert.equal(f.db.prepare('SELECT count(*) n FROM relay_requests').get().n,1);
});
test('concurrent different read requests reserve only one outstanding inspection',async t=>{
  const f=await fixture(t);
  const pending=[f.call('inspect_existing_session',{commandId:'parallel-read-a'}),f.call('inspect_existing_session',{commandId:'parallel-read-b'})];
  let batch;
  for(let i=0;i<20;i++){batch=await (await f.request('/device/jobs',{device:true})).json();if(batch.job)break;await new Promise(r=>setTimeout(r,10));}
  assert.ok(batch.job);assert.equal(f.db.prepare('SELECT count(*) n FROM relay_requests').get().n,1);
  await f.request('/device/result',{device:true,body:{requestId:batch.job.id,nonce:batch.job.nonce,snapshot:{state:'running'}}});
  const results=await Promise.all(pending.map(async response=>f.decoded(await response)));
  assert.equal(results.filter(r=>r.error===null).length,1);
  assert.equal(results.filter(r=>r.error==='inspection_pending_reuse_original_command_id').length,1);
});
