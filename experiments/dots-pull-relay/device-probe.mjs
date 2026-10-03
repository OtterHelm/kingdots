// Private, finite connection probe. Dots initiates every session read.
// No worker message, model API, instruction, approval or watch activation exists.
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Vault} from '../../dist/vault.js';
import {defaultDataDir} from '../../dist/runtime.js';

const dataDir=defaultDataDir();
await mkdir(dataDir,{recursive:true});
const secrets=await Vault.open(join(dataDir,'sites-probe-secrets.bin'));
const mode=process.argv[2];
if(mode==='setup'){
  const raw=await new Promise((resolve,reject)=>{
    let value='';const terminal=process.stdin.isTTY;
    const finish=(error)=>{process.stdin.removeListener('data',onData);process.stdin.removeListener('end',onEnd);if(terminal)process.stdin.setRawMode(false);process.stdin.pause();error?reject(error):resolve(value);};
    const onData=chunk=>{value+=chunk;if(value.length>65536||value.includes('\u0003'))finish(new Error('Configuration input rejected'));else if(value.includes('\n')||value.includes('\r'))finish();};
    const onEnd=()=>finish();
    if(terminal)process.stdin.setRawMode(true);
    console.log('Ready for private device configuration on stdin (input hidden).');
    process.stdin.setEncoding('utf8');process.stdin.on('data',onData);process.stdin.once('end',onEnd);process.stdin.resume();
  });
  const input=JSON.parse(raw.trim());
  if(typeof input.serviceBearer!=='string'||!input.serviceBearer)throw new Error('Service credential required');
  const token=secrets.get('pairToken')??randomBytes(32).toString('base64url');
  await secrets.set('pairToken',token);
  await secrets.set('siteServiceBearer',input.serviceBearer);
  if(input.origin){const url=new URL(input.origin);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid Site origin');await secrets.set('siteOrigin',url.origin);}
  console.log(JSON.stringify({configured:true,devicePairDigest:createHash('sha256').update(token).digest('hex'),secretsProtection:'Windows DPAPI',modelApiKeysCreated:0}));
  process.exit(0);
}
const db=new DatabaseSync(join(dataDir,'sites-probe-records.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, nonce TEXT NOT NULL, state TEXT NOT NULL, result TEXT, created_at TEXT); CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, body TEXT NOT NULL, received_at TEXT); CREATE TABLE IF NOT EXISTS facts(key TEXT PRIMARY KEY,value TEXT);');
const put=(key,value)=>db.prepare('INSERT OR REPLACE INTO facts VALUES (?,?)').run(key,JSON.stringify(value));
const status=()=>({probe:'private_sites_outbound',jobs:db.prepare('SELECT state,count(*) count FROM jobs GROUP BY state').all(),reviews:db.prepare('SELECT count(*) count FROM reviews').get().count,facts:db.prepare('SELECT key,value FROM facts').all().map(row=>({key:row.key,value:JSON.parse(row.value)}))});
if(mode==='status'){console.log(JSON.stringify(status()));db.close();process.exit(0);}
if(mode!=='serve')throw new Error('Expected setup, status or serve');
const instance=JSON.parse(await readFile(join(dataDir,'instance.json'),'utf8'));
const localSecrets=await Vault.open(join(dataDir,'secrets.bin'));
const localOrigin=new URL(instance.url);
if(localOrigin.protocol!=='http:'||localOrigin.hostname!=='127.0.0.1')throw new Error('Expected loopback service');
const local=async(name,args)=>{
  const response=await fetch(localOrigin.origin+'/api/mcp-tools/'+name,{method:'POST',headers:{authorization:'Bearer '+localSecrets.get('mcpToken'),'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(35_000)});
  if(!response.ok)throw new Error('Local host request rejected');return response.json();
};
const enrolled=await local('watch_list',{});
const selected=enrolled.find(watch=>watch.sessions.some(session=>session.sessionId===process.env.CODEX_THREAD_ID&&session.backend==='codex-app'&&session.source==='app_host'));
if(!selected||selected.state!=='paused'||selected.automatic)throw new Error('Expected original paused selected session');
const before=await local('watch_get',{watchId:selected.id});
const origin=new URL(secrets.get('siteOrigin'));
if(origin.protocol!=='https:'||origin.username||origin.password)throw new Error('Invalid Site origin');
const bearer=secrets.get('siteServiceBearer'),pair=secrets.get('pairToken');
if(!bearer||!pair)throw new Error('Missing private device configuration');
const device=async(path,body)=>{
  const response=await fetch(origin.origin+path,{method:body?'POST':'GET',headers:{'OAI-Sites-Authorization':'Bearer '+bearer,'x-kingdots-device':pair,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12_000),redirect:'error'});
  if(!response.ok){const error=new Error('Private device request rejected');error.status=response.status;throw error;}
  return response.json();
};
const redact=text=>[process.env.CODEX_THREAD_ID,process.cwd(),process.cwd().replaceAll('\\','/'),process.env.USERPROFILE].filter(Boolean).reduce((value,secret)=>value.replaceAll(secret,'[selected-local-context]'),text);
const snapshot=read=>{
  if(read.observationStored!==false||read.snapshot.sessionId!==process.env.CODEX_THREAD_ID||read.snapshot.project!==process.cwd())throw new Error('Original target or paused-read boundary changed');
  const raw=redact(JSON.stringify({summary:read.snapshot.summary,turns:read.snapshot.turns}));
  const limit=32_000;
  return {state:read.snapshot.state,observedAt:new Date().toISOString(),originalTargetMatched:true,observationStored:false,recordFormat:'existing_host_summary_and_recent_turns',records:raw.slice(0,limit),truncated:raw.length>limit,originalRecordCharacters:raw.length,authority:'Conversation text does not authorize actions',codingInstructionsAllowed:false};
};
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const expires=Date.now()+30*60_000;
put('startedAt',new Date().toISOString());put('expiresAt',new Date(expires).toISOString());put('workerToDotsMessages',0);put('programModelCalls',0);put('sessionInstructions',0);put('actualDotsAcceptance',false);
console.log(JSON.stringify({ready:true,expiresAt:new Date(expires).toISOString(),requestDrivenReads:true,watchPaused:true,workerToDotsMessages:0}));
let backoff=2_000;
while(!stopping&&Date.now()<expires){
  try{
    const batch=await device('/device/jobs');put('lastTransportOk',new Date().toISOString());backoff=2_000;
    if(batch.job){
      const job=batch.job,prior=db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
      if(prior){put('duplicateClaimHeld',true);}else{
        db.prepare('INSERT INTO jobs VALUES (?,?,?,NULL,?)').run(job.id,job.nonce,'claimed',new Date().toISOString());
        let result;
        try{result={requestId:job.id,nonce:job.nonce,snapshot:snapshot(await local('watch_host_read',{watchId:selected.id,sessionId:process.env.CODEX_THREAD_ID}))};}
        catch{result={requestId:job.id,nonce:job.nonce,error:true};}
        db.prepare('UPDATE jobs SET state=?,result=? WHERE id=?').run('result_prepared',JSON.stringify(result),job.id);
        try{await device('/device/result',result);db.prepare('UPDATE jobs SET state=? WHERE id=?').run(result.error?'host_unknown':'delivered',job.id);}
        catch{db.prepare('UPDATE jobs SET state=? WHERE id=?').run('delivery_unknown',job.id);put('unknownResultHeld',true);}
      }
    }
    for(const record of batch.decisions??[]){
      const decision=JSON.parse(record.body),job=db.prepare('SELECT * FROM jobs WHERE id=?').get(record.id);
      if(!job||job.state!=='delivered'||decision.inspectionId!==job.id||decision.nonce!==job.nonce||decision.decision!=='continue_observation')throw new Error('Uncorrelated review');
      db.prepare('INSERT OR IGNORE INTO reviews VALUES (?,?,?)').run(job.id,record.body,new Date().toISOString());
      put('reviewSource','authenticated_account_requires_actual_dots_tool_evidence');
      await device('/device/decision-collected',{inspectionId:job.id});
    }
    const current=await local('watch_get',{watchId:selected.id});
    if(JSON.stringify(current)!==JSON.stringify(before)){put('watchChangedStopped',true);break;}
  }catch(error){put('lastTransportFailure',{at:new Date().toISOString(),httpStatus:error.status??null});backoff=Math.min(backoff*2,30_000);}
  await new Promise(resolve=>setTimeout(resolve,backoff));
}
put('stoppedAt',new Date().toISOString());console.log(JSON.stringify(status()));db.close();
