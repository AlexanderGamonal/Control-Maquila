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

const assert=require('assert');
const URL=APP_URL; const wait=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0; const t=async(n,f)=>{try{await f();console.log('✓',n);ok++;}catch(e){console.log('✗',n,'\n   ',e.message.split('\n')[0]);process.exitCode=1;}};
const d=o=>{const x=new Date();x.setDate(x.getDate()+o);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const seed=[{id:'e1',marca:'Cliente Edit',cantidad:500,peso:900,formula:'Amore',fechaPedido:d(-3),fechaEntrega:d(10),ampliacionDigesa:d(-1),arteAprobado:'',pedidoSistema:'',estadoManual:'',observaciones:'-5% desc',updatedAt:1,deleted:false}];
const stored=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('maquila_pedidos_v2')||'[]'));
const open=p=>p.evaluate(()=>document.querySelector('#dlgPedido').open);
const vis=(p,s)=>p.$eval(s,e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'});
(async()=>{
 const b=await launch();
 const mk=async(vp,mobile,theme='dark',data=seed)=>{const c=await b.newContext({viewport:vp,isMobile:mobile,hasTouch:mobile,colorScheme:theme,serviceWorkers:'block'});const p=await c.newPage();p.errs=[];p.nativeDialogs=0;p.on('pageerror',e=>p.errs.push(e.message));p.on('dialog',x=>{p.nativeDialogs++;x.dismiss();});await p.addInitScript(s=>{try{if(!localStorage.getItem('maquila_pedidos_v2'))localStorage.setItem('maquila_pedidos_v2',JSON.stringify(s))}catch{}},data);await p.goto(URL);await wait(350);return p;};

 const p=await mk({width:375,height:740},true);
 await t('NUEVO: título, 4 secciones visibles, sin Eliminar, marca enfocada, fecha de pedido = hoy',async()=>{await p.click('#btnNew');await wait(350);assert.equal(await p.textContent('#dlgTitle'),'Nuevo pedido');assert.equal(await p.$$eval('.form-section',e=>e.length),4);assert(!await vis(p,'#btnDelete'));assert.equal(await p.evaluate(()=>document.activeElement.name),'marca');assert.equal(await p.inputValue('input[name=fechaPedido]'),d(0));assert.equal(await p.$$('.wz-step-btn').then(a=>a.length),0);});
 await t('VALIDACIÓN: guardar vacío muestra 4 errores, enfoca marca y no cierra ni crea pedido',async()=>{await p.click('#btnPedidoSave');await wait(250);const errs=await p.$$eval('.field-error.visible',e=>e.map(x=>x.id));assert.deepEqual(errs.sort(),['err-cantidad','err-formula','err-marca','err-peso']);assert.equal(await p.$eval('input[name=marca]',e=>e.getAttribute('aria-invalid')),'true');assert.equal(await p.evaluate(()=>document.activeElement.name),'marca');assert(await open(p));assert.equal((await stored(p)).length,1);});
 await t('VALIDACIÓN: al escribir se limpia el error de ese campo (y solo ese)',async()=>{await p.fill('input[name=marca]','Don Guido');assert(!(await p.$$eval('.field-error.visible',e=>e.map(x=>x.id))).includes('err-marca'));assert.equal(await p.$$eval('.field-error.visible',e=>e.length),3);assert.equal(await p.$eval('input[name=marca]',e=>e.hasAttribute('aria-invalid')),false);});
 await t('VALIDACIÓN: cantidad decimal y entrega anterior al pedido',async()=>{await p.fill('input[name=cantidad]','2.5');await p.fill('input[name=peso]','900');await p.selectOption('select[name=formula]','Barletta');await p.fill('input[name=fechaEntrega]',d(-9));await p.click('#btnPedidoSave');await wait(200);assert.match(await p.textContent('#err-cantidad'),/entero/);assert.match(await p.textContent('#err-fechaEntrega'),/anterior/);assert(await open(p));});
 await t('GUARDAR con Enter desde un campo: crea el pedido y cierra',async()=>{await p.fill('input[name=cantidad]','2500');await p.fill('input[name=fechaEntrega]',d(12));await p.press('input[name=marca]','Enter');await wait(400);assert(!await open(p));const s=await stored(p);assert.equal(s.length,2);const n=s.find(x=>x.marca==='Don Guido');assert.equal(n.cantidad,2500);assert.equal(n.formula,'Barletta');assert.equal(n.fechaEntrega,d(12));assert.equal(await p.$$eval('.order-card',e=>e.length),2);});
 await t('Hoy / Quitar fecha y "estado resultante" en vivo',async()=>{await p.click('[data-edit="e1"]');await wait(300);assert.match(await p.textContent('#estadoPreview'),/Pendiente.*automático/);await p.click('[data-hoy=pedidoSistema]');assert.equal(await p.inputValue('input[name=pedidoSistema]'),d(0));assert.match(await p.textContent('#estadoPreview'),/En producción.*automático/);await p.click('[data-limpiar=pedidoSistema]');assert.equal(await p.inputValue('input[name=pedidoSistema]'),'');await p.selectOption('select[name=estadoManual]','En pausa');assert.match(await p.textContent('#estadoPreview'),/En pausa.*manual/);});
 await t('EDITAR: carga valores, título y zona de eliminar visibles',async()=>{assert.equal(await p.textContent('#dlgTitle'),'Editar pedido');assert.equal(await p.inputValue('input[name=marca]'),'Cliente Edit');assert.equal(await p.inputValue('textarea[name=observaciones]'),'-5% desc');assert(await vis(p,'#btnDelete'));});
 await t('CERRAR con cambios (✕): aviso inline, formulario sigue abierto y conserva lo escrito',async()=>{await p.click('#btnPedidoClose');await wait(150);assert(await vis(p,'#dlgBar'));assert.match(await p.textContent('#dlgBarMsg'),/sin guardar/);assert(await open(p));assert.equal(await p.inputValue('select[name=estadoManual]'),'En pausa');assert.equal(await p.evaluate(()=>document.activeElement.id),'barCancel');});
 await t('Esc con aviso abierto lo cierra; Esc otra vez vuelve a avisar (no cierra el formulario)',async()=>{await p.keyboard.press('Escape');await wait(100);assert(!await vis(p,'#dlgBar'));assert(await open(p));await p.keyboard.press('Escape');await wait(100);assert(await vis(p,'#dlgBar'));assert(await open(p));});
 await t('"Seguir editando" mantiene todo; "Descartar" cierra SIN guardar',async()=>{await p.click('#barCancel');assert(await open(p));assert(!await vis(p,'#dlgBar'));await p.click('#btnPedidoCancel');await p.click('#barConfirm');await wait(300);assert(!await open(p));const e=(await stored(p)).find(x=>x.id==='e1');assert.equal(e.estadoManual,'');});
 await t('CERRAR sin cambios: cierra directo, sin aviso',async()=>{await p.click('[data-edit="e1"]');await wait(300);await p.click('#btnPedidoClose');await wait(300);assert(!await open(p));});
 await t('FONDO: tocar fuera sin cambios cierra; con cambios avisa; arrastrar desde un campo hasta fuera no cierra',async()=>{await p.click('#btnNew');await wait(300);await p.mouse.click(180,30);await wait(250);assert(!await open(p),'sin cambios debía cerrar');await p.click('#btnNew');await wait(300);await p.fill('input[name=marca]','x');await p.mouse.click(180,30);await wait(250);assert(await open(p));assert(await vis(p,'#dlgBar'));await p.click('#barCancel');const bb=await p.$eval('input[name=marca]',e=>{const r=e.getBoundingClientRect();return [r.x+10,r.y+10]});await p.mouse.move(bb[0],bb[1]);await p.mouse.down();await p.mouse.move(180,30);await p.mouse.up();await wait(250);assert(!await vis(p,'#dlgBar'),'un arrastre no debe disparar el cierre');assert(await open(p));await p.click('#btnPedidoCancel');await p.click('#barConfirm');});
 await t('ELIMINAR: aviso inline con el nombre (sin confirm() nativo); Cancelar conserva; Eliminar borra',async()=>{await p.click('[data-edit="e1"]');await wait(300);await p.click('#btnDelete');await wait(150);assert.match(await p.textContent('#dlgBarMsg'),/Cliente Edit.*Anulado/);await p.click('#barCancel');assert(await open(p));assert.equal((await stored(p)).find(x=>x.id==='e1').deleted,false);await p.click('#btnDelete');await p.click('#barConfirm');await wait(300);assert(!await open(p));assert.equal((await stored(p)).find(x=>x.id==='e1').deleted,true);assert.equal(await p.$$eval('[data-edit="e1"]',e=>e.length),0);assert.equal(p.nativeDialogs,0,'no debe usarse confirm()');});
 await t('observaciones con "=" inicial se neutralizan; "-" inicial se conserva',async()=>{await p.click('#btnNew');await wait(300);await p.fill('input[name=marca]','=HYPERLINK("x")');await p.fill('input[name=cantidad]','1');await p.fill('input[name=peso]','1');await p.selectOption('select[name=formula]','Amore');await p.fill('textarea[name=observaciones]','-10% anticipo');await p.click('#btnPedidoSave');await wait(300);const n=(await stored(p)).find(x=>x.marca.includes('HYPERLINK'));assert.equal(n.marca,' =HYPERLINK("x")');assert.equal(n.observaciones,'-10% anticipo');});

 // ---------- MÓVIL: bottom sheet ----------
 const pm=await mk({width:375,height:740},true);
 await t('MÓVIL: sheet anclado abajo, ancho completo, esquinas superiores, footer siempre visible',async()=>{await pm.click('#btnNew');await wait(450);const g=await pm.evaluate(()=>{const r=document.querySelector('#dlgPedido').getBoundingClientRect(),f=document.querySelector('.dlg-footer').getBoundingClientRect(),cs=getComputedStyle(document.querySelector('#dlgPedido'));return {bottom:Math.round(r.bottom),w:Math.round(r.width),top:Math.round(r.top),h:Math.round(r.height),footerBottom:Math.round(f.bottom),footerH:Math.round(f.height),radius:cs.borderTopLeftRadius,radiusB:cs.borderBottomLeftRadius,vh:innerHeight}});console.log('    ',JSON.stringify(g));assert.equal(g.bottom,g.vh);assert.equal(g.w,375);assert.notEqual(g.radius,'0px');assert.equal(g.radiusB,'0px');assert(g.h<=Math.round(g.vh*0.94)+1);assert.equal(g.footerBottom,g.vh);});
 await t('MÓVIL: el cuerpo hace scroll y se alcanzan Avance, Estado y Eliminar (edición)',async()=>{await pm.click('#btnPedidoCancel');await pm.click('[data-edit="e1"]');await wait(400);const r=await pm.evaluate(async()=>{const b=document.querySelector('.dlg-body');const before=b.scrollTop;b.scrollTop=99999;await new Promise(r=>setTimeout(r,100));return {scrolled:b.scrollTop>before,canScroll:b.scrollHeight>b.clientHeight,delBottom:Math.round(document.querySelector('#btnDelete').getBoundingClientRect().bottom),bodyBottom:Math.round(b.getBoundingClientRect().bottom)}});assert(r.canScroll&&r.scrolled);assert(r.delBottom<=r.bodyBottom,JSON.stringify(r));});
 await t('MÓVIL: campos a 16px y botones de la sección Avance ≥ 44px de alto',async()=>{const r=await pm.evaluate(()=>({f:getComputedStyle(document.querySelector('input[name=marca]')).fontSize,d:getComputedStyle(document.querySelector('input[name=fechaEntrega]')).fontSize,hoy:Math.round(document.querySelector('[data-hoy=arteAprobado]').getBoundingClientRect().height),clr:Math.round(document.querySelector('[data-limpiar=arteAprobado]').getBoundingClientRect().width),save:Math.round(document.querySelector('#btnPedidoSave').getBoundingClientRect().height)}));assert.equal(r.f,'16px');assert.equal(r.d,'16px');assert(r.hoy>=44&&r.clr>=44&&r.save>=44,JSON.stringify(r));});
 await t('MÓVIL: fechas en una columna (cabe "dd/mm/aaaa" sin recortes)',async()=>{const w=await pm.$$eval('.fg-dates input',e=>e.map(x=>Math.round(x.getBoundingClientRect().width)));assert(w.every(x=>x>250),w.join(','));});
 await pm.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-form-mobile-edit.png')});
 await pm.click('#btnPedidoCancel');await wait(250);
 await pm.click('#btnNew');await wait(400);await pm.click('#btnPedidoSave');await wait(500);await pm.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-form-mobile-errors.png')});
 await pm.fill('input[name=marca]','Algo');await pm.click('#btnPedidoClose');await wait(300);await pm.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-form-mobile-bar.png')});
 await pm.close();

 // ---------- ESCRITORIO ----------
 const pd=await mk({width:1100,height:850},false);
 await t('ESCRITORIO: modal centrado de 560px, no sheet',async()=>{await pd.click('#btnNew');await wait(350);const g=await pd.evaluate(()=>{const r=document.querySelector('#dlgPedido').getBoundingClientRect();return {w:Math.round(r.width),cx:Math.round(r.x+r.width/2),vw:innerWidth,bottom:Math.round(r.bottom),vh:innerHeight}});assert.equal(g.w,560);assert(Math.abs(g.cx-g.vw/2)<=1);assert(g.bottom<g.vh);});
 await t('ESCRITORIO: cantidad y peso en 2 columnas; fechas en 2 columnas',async()=>{const g=await pd.evaluate(()=>{const y=n=>Math.round(document.querySelector(`[name=${n}]`).getBoundingClientRect().y);return [y('cantidad')===y('peso'),y('fechaPedido')===y('fechaEntrega')]});assert.deepEqual(g,[true,true]);});
 await pd.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-form-desktop.png')});
 await pd.close();

 // ---------- CONTRASTE con el formulario abierto (errores y aviso visibles) ----------
 for(const theme of ['dark','light']){
  const pc=await mk({width:420,height:760},true,theme);
  await t(`CONTRASTE ${theme}: formulario con errores + aviso visibles → 0 fallos`,async()=>{await pc.click('[data-edit="e1"]');await wait(350);await pc.fill('input[name=marca]','');await pc.click('#btnPedidoSave');await wait(300);let f=await pc.evaluate(scan);await pc.fill('input[name=marca]','z');await pc.click('#btnPedidoClose');await wait(200);f=f.concat(await pc.evaluate(scan));await pc.click('#barCancel');await pc.click('#btnDelete');await wait(200);f=f.concat(await pc.evaluate(scan));assert.equal(f.length,0,f.slice(0,5).join(' | '));});
  if(theme==='light') await pc.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'maquila-form-light-bar.png')});
  await pc.close();
 }

 // ---------- ?nuevo=1 y errores JS ----------
 await t('acceso directo ?nuevo=1 abre el formulario nuevo',async()=>{const q=await mk({width:375,height:740},true);await q.goto(URL+'?nuevo=1');await wait(450);assert(await open(q));assert.equal(await q.textContent('#dlgTitle'),'Nuevo pedido');await q.close();});
 await t('sin errores JS',()=>assert.deepEqual(p.errs,[]));
 console.log(`\n${ok} comprobaciones OK`);await b.close();
})();
