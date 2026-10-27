const { launch, APP_URL } = require('../helpers/browser.cjs');
const scan = () => {
  const parse = c => { const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const over = (f,b) => ({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
  const L = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}; return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const bgOf = el => { const chain=[]; for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor); if(c&&c.a>0) chain.push(c); if(c&&c.a===1) break;} let bg={r:12,g:10,b:9,a:1}; if(!chain.length||chain[chain.length-1].a<1){ const rb=parse(getComputedStyle(document.body).backgroundColor); bg=rb&&rb.a>0?rb:bg; } for(let i=chain.length-1;i>=0;i--) bg = chain[i].a===1?chain[i]:over(chain[i],bg); return bg; };
  const out=[]; const seen=new Set();
  document.querySelectorAll('body *').forEach(el=>{
    if(el.closest('svg,dialog:not([open]),[aria-hidden=true]')) return;
    const txt=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
    if(!txt) return; const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); if(!r.width||!r.height||cs.visibility==='hidden') return;
    let fg=parse(cs.color); const bg=bgOf(el); let op=1; for(let e=el;e;e=e.parentElement) op*=+getComputedStyle(e).opacity; fg=over({...fg,a:fg.a*op},bg);
    const [a,b]=[L(fg),L(bg)].sort((x,y)=>y-x); const ratio=(a+0.05)/(b+0.05);
    const big = parseFloat(cs.fontSize)>=24 || (parseFloat(cs.fontSize)>=18.66 && +cs.fontWeight>=700);
    if(ratio < (big?3:4.5)) { const k=el.className+'|'+ratio.toFixed(2); if(!seen.has(k)){seen.add(k); out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${txt.slice(0,22)}" ${ratio.toFixed(2)} (${cs.fontSize})`);} }
  });
  return out;
};

const assert=require('assert'); const URL=APP_URL; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0; const t=async(n,f)=>{try{await f();console.log('✓',n);ok++;}catch(e){console.log('✗',n,'\n   ',e.message.split('\n')[0]);process.exitCode=1;}};
const d=o=>{const x=new Date();x.setDate(x.getDate()+o);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const mkSeed=()=>[{id:'e1',marca:'Cliente Uno',cantidad:500,peso:900,formula:'Amore',fechaPedido:d(-3),fechaEntrega:d(10),ampliacionDigesa:d(-1),arteAprobado:'',pedidoSistema:'',estadoManual:'',observaciones:'',updatedAt:1,deleted:false},
 {id:'e2',marca:'Cliente Dos "Quoted"',cantidad:100,peso:500,formula:'Fastpan',fechaPedido:d(-2),fechaEntrega:d(12),ampliacionDigesa:'',arteAprobado:'',pedidoSistema:'',estadoManual:'',observaciones:'',updatedAt:2,deleted:false}];
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('maquila_pedidos_v2')||'[]'));
const get=async(p,id)=>(await stored(p)).find(x=>x.id===id);
const toast=p=>p.$eval('.toast .toast-msg',e=>e.textContent).catch(()=>null);
const hasToast=async p=>!!(await p.$('.toast'));
(async()=>{
 const b=await launch();
 const mk=async(vp,mobile,theme='dark',withSheets=false)=>{const c=await b.newContext({viewport:vp,isMobile:mobile,hasTouch:mobile,colorScheme:theme,serviceWorkers:'block'});const p=await c.newPage();p.errs=[];p.native=0;p.posts=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',x=>{p.native++;x.dismiss();});
  await p.addInitScript(([s,cfg])=>{try{if(!localStorage.getItem('maquila_pedidos_v2')){localStorage.setItem('maquila_pedidos_v2',JSON.stringify(s));if(cfg){localStorage.setItem('maquila_cfg_v2',JSON.stringify(cfg));localStorage.setItem('maquila_dirty_v2',JSON.stringify(s.map(x=>x.id)));}}}catch{}},[mkSeed(),withSheets?{url:'https://script.google.com/macros/s/x/exec',token:'t'}:null]);
  if(withSheets){p.server=new Map();await p.route('https://script.google.com/**',async r=>{const body=JSON.parse(r.request().postData()||'{}');p.posts.push(body.records);for(const rec of body.records||[]){const old=p.server.get(rec.id);if(!old||Number(rec.updatedAt)>=Number(old.updatedAt))p.server.set(rec.id,rec);}await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:true,records:[...p.server.values()]})});});}
  await p.goto(URL);await wait(400);return p;};

 const p=await mk({width:375,height:740},true);
 await t('MARCAR etapa: aplica al instante, sin confirm(), con aviso "marcada" y botón Deshacer',async()=>{await p.click('[data-step=arteAprobado][data-id=e1]');await wait(150);assert.equal((await get(p,'e1')).arteAprobado,d(0));assert.equal(await toast(p),'Aprobación del arte marcada');assert.equal(await p.$eval('.toast-action',e=>e.textContent),'Deshacer');assert.equal(p.native,0);});
 await t('DESHACER restaura el valor anterior (vacío), marca el pedido como modificado y cierra el aviso',async()=>{const t0=(await get(p,'e1')).updatedAt;await wait(5);await p.click('.toast-action');await wait(150);const e=await get(p,'e1');assert.equal(e.arteAprobado,'');assert(e.updatedAt>t0);assert(!await hasToast(p));assert.equal(await p.$eval('[data-step=arteAprobado][data-id=e1]',e=>e.getAttribute('aria-pressed')),'false');assert((await p.evaluate(()=>JSON.parse(localStorage.getItem('maquila_dirty_v2')))).includes('e1'));});
 await t('DESMARCAR etapa con fecha: sin confirm(); Deshacer devuelve LA FECHA ORIGINAL (no la de hoy)',async()=>{const orig=(await get(p,'e1')).ampliacionDigesa;assert.equal(orig,d(-1));await p.click('[data-step=ampliacionDigesa][data-id=e1]');await wait(150);assert.equal((await get(p,'e1')).ampliacionDigesa,'');assert.equal(await toast(p),'Ampliación DIGESA desmarcada');assert.equal(p.native,0);await p.click('.toast-action');await wait(150);assert.equal((await get(p,'e1')).ampliacionDigesa,orig);});
 await t('un aviso nuevo reemplaza al anterior (solo uno visible)',async()=>{await p.click('[data-step=pedidoSistema][data-id=e1]');await wait(100);await p.click('[data-step=arteAprobado][data-id=e2]');await wait(100);assert.equal(await p.$$eval('.toast',e=>e.length),1);assert.equal(await toast(p),'Aprobación del arte marcada');await p.click('.toast-action');await wait(100);assert.equal((await get(p,'e2')).arteAprobado,'');assert.equal((await get(p,'e1')).pedidoSistema,d(0),'el cambio anterior se conserva');});
 await t('el aviso desaparece solo a los ~7 s',async()=>{await p.click('[data-step=arteAprobado][data-id=e2]');await p.mouse.move(370,120);await wait(6000);assert(await hasToast(p),'sigue a los 6s');await wait(1600);assert(!await hasToast(p),'debía irse a los 7s');});
 await t('el aviso se pausa con el cursor encima y reanuda al salir',async()=>{await p.click('[data-step=arteAprobado][data-id=e2]');await wait(500);const r=await p.$eval('.toast',e=>{const x=e.getBoundingClientRect();return [x.x+x.width/2,x.y+x.height/2]});await p.mouse.move(r[0],r[1]);await wait(8000);assert(await hasToast(p),'pausado');await p.mouse.move(5,300);await wait(3600);assert(!await hasToast(p),'reanudó y se fue');});
 await t('TECLADO: Enter en una etapa la cambia y el foco vuelve al mismo botón (render lo recrea)',async()=>{await p.focus('[data-step=pedidoSistema][data-id=e2]');await p.keyboard.press('Enter');await wait(200);const a=await p.evaluate(()=>({s:document.activeElement.dataset.step,id:document.activeElement.dataset.id}));assert.deepEqual(a,{s:'pedidoSistema',id:'e2'});assert.equal((await get(p,'e2')).pedidoSistema,d(0));});
 await t('TECLADO: Esc dentro del aviso lo descarta',async()=>{await p.focus('.toast-action');await p.keyboard.press('Escape');await wait(100);assert(!await hasToast(p));});
 await t('NOMBRE con comillas/HTML se muestra como texto (sin inyección) en el aviso de eliminar',async()=>{await p.click('[data-edit=e2]');await wait(300);await p.click('#btnDelete');await p.click('#barConfirm');await wait(300);assert.equal(await toast(p),'Pedido de "Cliente Dos "Quoted"" eliminado');assert.equal(await p.$$eval('.toast *',e=>e.length),2);});
 await t('ELIMINAR → Deshacer: el pedido vuelve a la lista y deleted=false',async()=>{assert.equal((await get(p,'e2')).deleted,true);assert.equal(await p.$$eval('[data-edit=e2]',e=>e.length),0);await p.click('.toast-action');await wait(200);assert.equal((await get(p,'e2')).deleted,false);assert.equal(await p.$$eval('[data-edit=e2]',e=>e.length),1);});
 await p.close();

 const pt=await mk({width:1100,height:800},false);
 await t('VISTA TABLA: el mismo flujo (marcar → Deshacer) funciona',async()=>{await pt.click('#btnViewTable');await wait(200);await pt.click('.table-toggle-btn[data-step=arteAprobado][data-id=e1]');await wait(150);assert.equal(await toast(pt),'Aprobación del arte marcada');await pt.click('.toast-action');await wait(150);assert.equal((await get(pt,'e1')).arteAprobado,'');});
 await pt.close();

 // ---- con Google Sheets simulado: el objeto en memoria se reemplaza al sincronizar ----
 const ps=await mk({width:375,height:740},true,'dark',true);
 await t('SYNC: Deshacer funciona aunque la sincronización haya reemplazado los objetos y se vuelve a sincronizar',async()=>{await wait(1500);await ps.click('[data-step=arteAprobado][data-id=e1]');await wait(1700);assert(ps.posts.some(r=>r&&r.some(x=>x.id==='e1'&&x.arteAprobado===d(0))),'el cambio se envió');assert(await hasToast(ps),'aviso aún visible tras sincronizar');const n=ps.posts.length;await ps.click('.toast-action');await wait(1800);assert.equal((await get(ps,'e1')).arteAprobado,'');assert(ps.posts.length>n,'el deshacer también se sincroniza');assert.equal(ps.server.get('e1').arteAprobado,'');});
 await ps.close();

 // ---- móvil: diseño ----
 const pm=await mk({width:375,height:740},true);
 await t('MÓVIL: el aviso no tapa el botón + , cabe en pantalla y Deshacer mide ≥ 44px',async()=>{await pm.click('[data-step=arteAprobado][data-id=e1]');await wait(300);const g=await pm.evaluate(()=>{const a=document.querySelector('.toast').getBoundingClientRect(),f=document.querySelector('#btnNew').getBoundingClientRect(),u=document.querySelector('.toast-action').getBoundingClientRect();return {overlap:!(a.right<=f.left||a.left>=f.right||a.bottom<=f.top||a.top>=f.bottom),inView:a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight,uh:Math.round(u.height),uw:Math.round(u.width)}});assert.equal(g.overlap,false);assert(g.inView);assert(g.uh>=44&&g.uw>=44,JSON.stringify(g));});
 await pm.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-toast-mobile-dark.png')});
 await t('MÓVIL: un nombre muy largo se ajusta en 2+ líneas sin desbordar',async()=>{await pm.evaluate(async()=>{const m=await import('./js/toast.js');m.showToast('Pedido de "Supermercados La Canasta del Norte Sociedad Anónima Cerrada de Lima Metropolitana" eliminado',()=>{});});await wait(250);const g=await pm.evaluate(()=>{const a=document.querySelector('.toast').getBoundingClientRect();return {w:Math.round(a.width),h:Math.round(a.height),inView:a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight}});assert(g.inView&&g.h>60,JSON.stringify(g));});
 await pm.close();
 for(const theme of ['dark','light']){
  const pc=await mk({width:375,height:740},true,theme);
  await t(`CONTRASTE ${theme}: aviso (texto y botón Deshacer) ≥ 4.5:1`,async()=>{await pc.click('[data-step=arteAprobado][data-id=e1]');await wait(300);const f=await pc.evaluate(scan);assert.equal(f.length,0,f.join(' | '));});
  if(theme==='light') await pc.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-toast-mobile-light.png')});
  await pc.close();
 }
 await t('sin errores JS',()=>assert.deepEqual(p.errs.concat(pt.errs,ps.errs),[]));
 console.log(`\n${ok} comprobaciones OK`);await b.close();
})();
