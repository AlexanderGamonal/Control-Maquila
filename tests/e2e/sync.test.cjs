const { launch, APP_URL } = require('../helpers/browser.cjs');
const assert=require('assert'); const URL=APP_URL; const wait=ms=>new Promise(r=>setTimeout(r,ms));
const A='https://script.google.com/macros/s/AAA/exec', B='https://script.google.com/macros/s/BBB/exec';
let ok=0,fail=0; const t=async(n,f)=>{try{await f();console.log('✓',n);ok++;}catch(e){console.log('✗',n,'\n     →',e.message.split('\n')[0]);fail++;process.exitCode=1;}};
const mkLocal=(n,ts=1000,extra={})=>Array.from({length:n},(_,i)=>({id:'r'+i,marca:'Cliente '+i,cantidad:100+i,peso:900,formula:'Amore',fechaPedido:'2026-10-01',fechaEntrega:'2026-11-01',ampliacionDigesa:'',arteAprobado:'',pedidoSistema:'',estadoManual:'',observaciones:'',updatedAt:ts+i,deleted:false,...extra}));
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('maquila_pedidos_v2')||'[]'));
const status=p=>p.$eval('#syncStatus .sync-text',e=>e.textContent);
(async()=>{
 const b=await launch();
 // opts: local[], cfgUrl, servers:{url:[records]}, mode
 const mk=async({local,cfgUrl=A,servers={},mode='normal',dirty=[]})=>{
  const c=await b.newContext({viewport:{width:420,height:800},serviceWorkers:'block'});const p=await c.newPage();p.errs=[];p.posts=[];p.servers={};
  p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',x=>x.dismiss());p.mode=mode;
  for(const [u,recs] of Object.entries(servers)) p.servers[u]=new Map(recs.map(r=>[r.id,{...r}]));
  await p.route('https://script.google.com/**',async r=>{const url=r.request().url();const body=JSON.parse(r.request().postData()||'{}');const key=Object.keys({[A]:1,[B]:1}).find(k=>url.startsWith(k))||url;const srv=(p.servers[key]??=new Map());
   p.posts.push({url:key,n:(body.records||[]).length,ids:(body.records||[]).map(x=>x.id)});
   if(p.mode==='abort') return r.abort('failed');
   const json=o=>r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(o)});
   if(p.mode==='invalid') return json({ok:true});
   if(p.mode==='badtoken') return json({ok:false,error:'token'});
   if(p.mode==='blackhole') return json({ok:true,records:[]});
   for(const rec of body.records||[]){const old=srv.get(rec.id);if(!old||Number(rec.updatedAt)>=Number(old.updatedAt))srv.set(rec.id,{...rec});}
   return json({ok:true,records:[...srv.values()]});});
  await p.addInitScript(([l,u,d])=>{try{if(!localStorage.getItem('maquila_pedidos_v2')){localStorage.setItem('maquila_pedidos_v2',JSON.stringify(l));localStorage.setItem('maquila_dirty_v2',JSON.stringify(d));if(u)localStorage.setItem('maquila_cfg_v2',JSON.stringify({url:u,token:'t'}));}}catch{}},[local,cfgUrl,dirty]);
  await p.goto(URL);return p;};
 const setSheet=async(p,url,token='t')=>{await p.click('#btnCfg');await wait(200);await p.fill('#formCfg input[name=url]',url);await p.fill('#formCfg input[name=token]',token);await p.click('#formCfg button[type=submit]');};

 console.log('=== POR QUÉ SE PUEDE PERDER INFORMACIÓN ===');
 await t('S1  Se cae la conexión (fetch falla): los pedidos locales NO se tocan',async()=>{const p=await mk({local:mkLocal(10),mode:'abort'});await wait(1500);assert.equal((await stored(p)).length,10);assert.match(await status(p),/Sin conexión/);});
 await t('S2  La hoja responde VACÍA (hoja nueva/borrada): local intacto y se reenvía todo a la hoja',async()=>{const p=await mk({local:mkLocal(10),servers:{[A]:[]}});await wait(2500);assert.equal((await stored(p)).length,10,'local se redujo a '+(await stored(p)).length);assert.equal(p.servers[A].size,10,'la hoja quedó con '+p.servers[A].size);});
 await t('S3  La hoja responde con solo 3 de 10: no se pierden 7; se reenvían los que faltan',async()=>{const l=mkLocal(10);const p=await mk({local:l,servers:{[A]:l.slice(0,3)}});await wait(2500);assert.equal((await stored(p)).length,10,'local quedó con '+(await stored(p)).length);assert.equal(p.servers[A].size,10);});
 await t('S6  La hoja se restauró a una versión ANTIGUA: no pisa lo más nuevo que hay en local',async()=>{const l=mkLocal(10,5000);const old=mkLocal(10,1).map(r=>({...r,marca:'VIEJO '+r.id}));const p=await mk({local:l,servers:{[A]:old}});await wait(2500);const s=await stored(p);assert(s.every(x=>x.marca.startsWith('Cliente')),'local quedó con '+s.map(x=>x.marca).slice(0,2));assert(p.servers[A].get('r0').marca.startsWith('Cliente'),'la hoja no se actualizó');});
 await t('S7  Otro vendedor editó más reciente en la hoja: el local adopta la versión remota (sync normal)',async()=>{const l=mkLocal(3,1000);const rem=mkLocal(3,9000).map(r=>({...r,marca:'Remoto '+r.id}));const p=await mk({local:l,servers:{[A]:rem}});await wait(1500);const s=await stored(p);assert(s.every(x=>x.marca.startsWith('Remoto')),JSON.stringify(s.map(x=>x.marca)));});
 await t('S9  Respuesta inválida (ok pero sin lista): no rompe ni borra',async()=>{const p=await mk({local:mkLocal(10),mode:'invalid'});await wait(1500);assert.equal((await stored(p)).length,10);assert.deepEqual(p.errs,[]);});
 await t('S12 Token incorrecto: local intacto y aviso claro',async()=>{const p=await mk({local:mkLocal(10),mode:'badtoken'});await wait(1500);assert.equal((await stored(p)).length,10);assert.match(await status(p),/Token/);});
 await t('S11 Pedidos eliminados (soft-delete) también se reenvían a la hoja vacía',async()=>{const l=mkLocal(10);l[3].deleted=true;l[4].deleted=true;const p=await mk({local:l,servers:{[A]:[]}});await wait(2500);assert.equal(p.servers[A].size,10);assert.equal([...p.servers[A].values()].filter(r=>r.deleted===true||r.deleted==='true').length,2);});
 await t('S10 Hoja que nunca guarda (agujero negro): sin bucle de peticiones, local intacto y aviso',async()=>{const p=await mk({local:mkLocal(6),servers:{[A]:[]},mode:'blackhole'});await wait(9000);assert.equal((await stored(p)).length,6);assert(p.posts.length<=4,'POSTs en 9s: '+p.posts.length);assert.match(await status(p),/no guard[oó]/i,await status(p));});

 await t('S16 Ediciones hechas SIN conexión + hoja reseteada: llegan todas, con las ediciones',async()=>{const l=mkLocal(10);l[2]={...l[2],marca:'EDITADO offline',updatedAt:9999};l[7]={...l[7],cantidad:777,updatedAt:9998};const p=await mk({local:l,dirty:['r2','r7'],servers:{[A]:[]}});await wait(3000);assert.equal(p.servers[A].size,10);assert.equal(p.servers[A].get('r2').marca,'EDITADO offline');assert.equal(Number(p.servers[A].get('r7').cantidad),777);assert.equal((await stored(p)).length,10);});
 await t('S17 Se recarga la página tras el reenvío: los datos siguen ahí (se persistió, no solo memoria)',async()=>{const p=await mk({local:mkLocal(10),servers:{[A]:[]}});await wait(2500);await p.reload();await wait(1500);assert.equal((await stored(p)).length,10);assert.equal(await p.$$eval('.order-card',e=>e.length),10);});
 console.log('\n=== CAMBIAR A UNA HOJA NUEVA ===');
 await t('S4  Ya sincronizado con la hoja A; conecto una hoja B vacía: TODO lo local se envía a B',async()=>{const l=mkLocal(10);const p=await mk({local:l,servers:{[A]:l,[B]:[]}});await wait(1200);await setSheet(p,B);await wait(2500);assert.equal((await stored(p)).length,10,'local '+(await stored(p)).length);assert.equal(p.servers[B].size,10,'hoja B '+p.servers[B].size);});
 await t('S5  Usaba la app sin hoja y conecto una por primera vez: lo local se sube',async()=>{const p=await mk({local:mkLocal(5),cfgUrl:'',servers:{[A]:[]}});await wait(600);await setSheet(p,A);await wait(2500);assert.equal(p.servers[A].size,5);assert.equal((await stored(p)).length,5);});
 await t('S4b La hoja B ya tenía otros pedidos: se fusionan (local + los de B), sin pérdidas',async()=>{const l=mkLocal(4);const other=mkLocal(3,2000).map((r,i)=>({...r,id:'x'+i,marca:'De B '+i}));const p=await mk({local:l,servers:{[A]:l,[B]:other}});await wait(1200);await setSheet(p,B);await wait(2500);assert.equal((await stored(p)).length,7);assert.equal(p.servers[B].size,7);});
 await t('S15 Solo cambio el token (misma hoja): no se reenvía todo de nuevo',async()=>{const l=mkLocal(10);const p=await mk({local:l,servers:{[A]:l}});await wait(1200);const n0=p.posts.length;await setSheet(p,A,'otro-token');await wait(1800);const after=p.posts.slice(n0);assert(after.length>=1&&after.every(x=>x.n===0),JSON.stringify(after.map(x=>x.n)));});
 await t('UI: el cuadro de configuración avisa que al cambiar de hoja se envían los pedidos locales',async()=>{const p=await mk({local:mkLocal(1)});await p.click('#btnCfg');await wait(200);assert.match(await p.textContent('#dlgCfg'),/nueva hoja|otra hoja/i);});
 console.log(`\n${ok} OK · ${fail} FALLAN`);await b.close();
})();
