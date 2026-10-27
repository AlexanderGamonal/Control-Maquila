const { launch, APP_URL } = require('../helpers/browser.cjs');
const { startServer } = require('../helpers/server.cjs');
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),assert=require('assert');
const SRC=path.resolve(__dirname,'../..'); const DEP=fs.mkdtempSync(path.join(os.tmpdir(),'maquila-deploy-'));
const sh=c=>cp.execSync(c,{stdio:'pipe'}).toString();
['index.html','sw.js','manifest.json'].forEach(f=>fs.copyFileSync(path.join(SRC,f),path.join(DEP,f)));
['fonts','icons','css','js'].forEach(d=>fs.cpSync(path.join(SRC,d),path.join(DEP,d),{recursive:true}));
let srv, URL; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0; const t=async(n,f)=>{try{await f();console.log('✓',n);ok++;}catch(e){console.log('✗',n,'\n   ',e.message);process.exitCode=1;}};
const mark=async p=>p.evaluate(()=>document.querySelector('meta[name=description]').content);
const setMarker=m=>{let h=fs.readFileSync(DEP+'/index.html','utf8');h=h.replace(/<meta name="description" content="[^"]*">/,`<meta name="description" content="${m}">`);fs.writeFileSync(DEP+'/index.html',h);};
(async()=>{
  srv=await startServer(DEP); URL=srv.url+'/index.html';
  const b=await launch();
  const ctx=await b.newContext({viewport:{width:375,height:740},serviceWorkers:'allow',colorScheme:'dark'});
  const reqs=[]; ctx.on('request',r=>reqs.push(r.url()));
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  setMarker('VERSION-A');
  await page.goto(URL); await page.evaluate(()=>navigator.serviceWorker.ready); await wait(800);

  await t('SW activo y controla la página tras instalarse',async()=>{await page.reload();await wait(300);assert(await page.evaluate(()=>!!navigator.serviceWorker.controller));});
  await t('precaché completo (27+ recursos: HTML, manifest, 12 CSS, 15 módulos JS, fuente e íconos) en maquila-v4',async()=>{const swSrc=fs.readFileSync(DEP+'/sw.js','utf8');const list=[...swSrc.slice(swSrc.indexOf('const PRECACHE'),swSrc.indexOf('];',swSrc.indexOf('const PRECACHE'))).matchAll(/'\.\/([^']*)'/g)].map(m=>'/'+m[1]);assert(list.length>=30,'lista corta: '+list.length);const keys=await page.evaluate(async()=>{const ks=await caches.keys();const c=await caches.open('maquila-v4');return {ks,urls:(await c.keys()).map(r=>new URL(r.url).pathname)};});assert.deepEqual(keys.ks,['maquila-v4']);const faltan=list.filter(u=>!keys.urls.includes(u));assert.deepEqual(faltan,[],'faltan en caché: '+faltan);console.log('     ('+list.length+' recursos precacheados)');});
  await t('ya no se pide nada a Google Fonts',()=>{const g=reqs.filter(u=>/googleapis|gstatic/.test(u));assert.equal(g.length,0,g.join(','));});
  await t('la fuente Inter carga desde el propio sitio',async()=>{const f=await page.evaluate(async()=>{await document.fonts.ready;return [...document.fonts].filter(x=>x.family.includes('Inter')).map(x=>x.status);});assert(f.includes('loaded'),JSON.stringify(f));});

  await t('OFFLINE: recarga y la app funciona con sus datos',async()=>{await page.evaluate(()=>localStorage.setItem('maquila_pedidos_v2',JSON.stringify([{id:'z1',marca:'Cliente Offline',cantidad:10,peso:900,formula:'Amore',fechaEntrega:'2030-01-01',updatedAt:1}])));await ctx.setOffline(true);await page.reload();await wait(500);assert.equal(await page.$$eval('.order-card',e=>e.length),1);assert.equal(await mark(page),'VERSION-A');const f=await page.evaluate(async()=>{await document.fonts.ready;return [...document.fonts].filter(x=>x.family.includes('Inter')).map(x=>x.status);});assert(f.includes('loaded'),'fuente offline '+f);});
  await t('OFFLINE: el icono y manifest salen de caché',async()=>{const r=await page.evaluate(async()=>{const a=await fetch('icons/icon-192.png');const m=await fetch('manifest.json');return [a.status,m.status,(await m.json()).short_name];});assert.deepEqual(r,[200,200,'Maquila']);});
  await ctx.setOffline(false);

  await t('DEPLOY: con max-age=600 la 1ª recarga online ya muestra la versión nueva (antes: la vieja)',async()=>{setMarker('VERSION-B');await page.reload();await wait(500);assert.equal(await mark(page),'VERSION-B');});
  await t('OFFLINE tras el deploy muestra la última versión vista (B), no la A',async()=>{await ctx.setOffline(true);await page.reload();await wait(400);assert.equal(await mark(page),'VERSION-B');await ctx.setOffline(false);});
  await t('red lenta (>4s): sirve la caché en ~4s en vez de colgarse',async()=>{srv.setDelay(9000);setMarker('VERSION-C');const t0=Date.now();await page.reload();const dt=Date.now()-t0;assert(dt<7000,'tardó '+dt);assert.equal(await mark(page),'VERSION-B');srv.setDelay(0);console.log('     (tardó',dt,'ms)');});
  await t('la descarga tardía termina en segundo plano y actualiza la caché (offline ya muestra C)',async()=>{await wait(7000);await ctx.setOffline(true);await page.reload();await wait(400);assert.equal(await mark(page),'VERSION-C');await ctx.setOffline(false);});
  await t('con red normal sigue trayendo la última versión',async()=>{setMarker('VERSION-D');await page.reload();await wait(400);assert.equal(await mark(page),'VERSION-D');});

  await t('DEPLOY de un MÓDULO JS (max-age=600): la 1ª recarga online ya ejecuta el código nuevo, no el de la caché',async()=>{const f=DEP+'/js/config.js';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace("short: 'DIGESA',","short: 'DIGESAX',"));await page.reload();await wait(600);const names=await page.$$eval('.step-name',e=>e.map(x=>x.textContent));assert(names.includes('DIGESAX'),'nombres: '+names.slice(0,3));});
  await t('DEPLOY de una hoja CSS + sellado (tools/stamp.js): la 1ª recarga en la MISMA pestaña ya aplica los estilos nuevos',async()=>{const f=DEP+'/css/a11y.css';fs.writeFileSync(f,fs.readFileSync(f,'utf8')+'\nbody{outline:3px solid rgb(1,2,3);}\n');sh('node '+SRC+'/tools/stamp.js '+DEP);await page.reload();await wait(600);assert.equal(await page.evaluate(()=>getComputedStyle(document.body).outlineColor),'rgb(1, 2, 3)');});
  await t('sellado: el --check falla si se edita un CSS y no se sella, y pasa al sellar',async()=>{const f=DEP+'/css/base.css';fs.writeFileSync(f,fs.readFileSync(f,'utf8')+'\n/* x */\n');let fallo=false;try{sh('node '+SRC+'/tools/stamp.js --check '+DEP);}catch(e){fallo=true;}assert(fallo,'--check debía fallar');sh('node '+SRC+'/tools/stamp.js '+DEP);sh('node '+SRC+'/tools/stamp.js --check '+DEP);});
  await t('OFFLINE tras el deploy: HTML, módulos y CSS nuevos salen de caché de forma consistente',async()=>{await ctx.setOffline(true);await page.reload();await wait(600);const r=await page.evaluate(()=>({names:[...document.querySelectorAll('.step-name')].map(x=>x.textContent),outline:getComputedStyle(document.body).outlineColor,cards:document.querySelectorAll('.order-card').length}));assert(r.names.includes('DIGESAX'),JSON.stringify(r));assert.equal(r.outline,'rgb(1, 2, 3)');assert(r.cards>=1);await ctx.setOffline(false);});
  await t('MIGRACIÓN: subir VERSION borra la caché vieja y crea la nueva',async()=>{let sw=fs.readFileSync(DEP+'/sw.js','utf8').replace("const VERSION = 'v4'","const VERSION = 'v5'");fs.writeFileSync(DEP+'/sw.js',sw);await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});await wait(1500);const ks=await page.evaluate(()=>caches.keys());assert.deepEqual(ks,['maquila-v5']);});
  await t('sin errores JS en toda la sesión',()=>assert.deepEqual(errs,[]));

  await t('POST a Sheets no se intercepta ni se cachea',async()=>{await page.route('https://script.google.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,records:[]})}));const r=await page.evaluate(async()=>{const x=await fetch('https://script.google.com/macros/s/x/exec',{method:'POST',body:'{}'});return x.json();});assert.equal(r.ok,true);const urls=await page.evaluate(async()=>{const c=await caches.open((await caches.keys())[0]);return (await c.keys()).map(r=>r.url);});assert(!urls.some(u=>u.includes('script.google.com')));});

  await t('instalable: sin errores de instalabilidad (CDP)',async()=>{const cdp=await ctx.newCDPSession(page);const r=await cdp.send('Page.getInstallabilityErrors');const e=r.installabilityErrors.filter(x=>x.errorId!=='in-incognito');assert.deepEqual(e,[],JSON.stringify(e));});
  await t('manifest: íconos existen con el tamaño declarado',async()=>{const m=await page.evaluate(()=>fetch('manifest.json').then(r=>r.json()));const sizes=[];for(const i of m.icons){const d=await page.evaluate(async src=>{const r=await fetch(src);const b=await createImageBitmap(await r.blob());return [b.width,b.height];},i.src);assert.equal(d.join('x'),i.sizes,i.src);sizes.push(i.sizes+':'+i.purpose);}console.log('    ',sizes.join(' '));assert(m.icons.some(i=>i.purpose==='maskable'));});
  await t('acceso directo ?nuevo=1 abre el wizard y limpia la URL',async()=>{await page.goto(URL+'?nuevo=1');await wait(400);assert(await page.$eval('#dlgPedido',e=>e.open));assert(!page.url().includes('nuevo'));});
  await t('cabecera: apple-touch-icon, favicon y theme-color coherentes',async()=>{await page.goto(URL);const h=await page.evaluate(()=>({apple:document.querySelector('link[rel=apple-touch-icon]')?.href,icon:document.querySelector('link[rel=icon]')?.href,tc:document.querySelector('meta[name=theme-color]').content}));assert(h.apple.endsWith('apple-touch-icon.png')&&h.icon.endsWith('icon-192.png'));assert.equal(h.tc,'#0c0a09');});
  console.log(`\n${ok} comprobaciones OK`); await b.close(); await srv.close(); fs.rmSync(DEP,{recursive:true,force:true});
})().catch(e=>{console.error(e);(srv&&srv.close());process.exit(1);});
