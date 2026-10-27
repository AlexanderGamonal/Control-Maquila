// Captura la interfaz en muchos estados + estilos calculados de TODOS los elementos.
// uso: node tests/visual/capture.cjs <url-de-index.html> <carpeta-salida>
const { launch } = require('../helpers/browser.cjs'); const fs=require('fs'),path=require('path');
const URL=process.argv[2], OUT=process.argv[3]; fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const d=o=>{const x=new Date();x.setDate(x.getDate()+o);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
const names=['Panetón Don Guido','Supermercados La Canasta del Norte S.A.C.','Dulce Navidad','Cliente Entregado','Cliente Anulado','Bodega San Martín','Distribuidora Andina'];
const seed=names.map((m,i)=>({id:'x'+i,marca:m,cantidad:[2500,12000,800,100,300,1500,4200][i],peso:[900,500,1000,900,500,750,900][i],formula:['Barletta','Amore','Fastpan','Amore','Barletta','Fastpan','Amore'][i],fechaPedido:d(-10+i),fechaEntrega:d([-2,0,2,-5,9,15,40][i]),ampliacionDigesa:i%2?d(-3):'',arteAprobado:i%3?d(-1):'',pedidoSistema:i%4==0?d(0):'',estadoManual:['','','En pausa','Entregado','Anulado','',''][i],observaciones:i<3?'Caja especial con bolsa y pasas rubias\nAnticipo -30% pagado':'',updatedAt:100+i,deleted:false}));
const dumpStyles=()=>{ // por elemento: clave estable + todas las propiedades calculadas
  const out={}; const cnt={};
  const key=el=>{const k=el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.trim().split(/\s+/).join('.'):'');cnt[k]=(cnt[k]||0)+1;return k+'~'+cnt[k];};
  document.querySelectorAll('body *').forEach(el=>{ if(['SCRIPT','STYLE'].includes(el.tagName)) return; const cs=getComputedStyle(el); let s=''; for(const p of cs) s+=p+':'+cs.getPropertyValue(p)+';'; const r=el.getBoundingClientRect(); s+=`rect:${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`; out[key(el)]=s; });
  return out; };
(async()=>{
 const b=await launch();
 const meta={files:0};
 for(const [vpName,vp,mobile] of [['mobile',{width:375,height:740},true],['desktop',{width:1280,height:800},false]]) for(const theme of ['dark','light']){
  const ctx=await b.newContext({viewport:vp,isMobile:mobile,hasTouch:mobile,colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block',locale:'es-PE',timezoneId:'America/Lima'});
  const p=await ctx.newPage(); p.errs=[]; p.on('pageerror',e=>p.errs.push(e.message));
  await p.addInitScript(s=>{try{if(!localStorage.getItem('maquila_pedidos_v2'))localStorage.setItem('maquila_pedidos_v2',JSON.stringify(s));}catch{}},seed);
  await p.goto(URL); await wait(700);
  const shot=async(name,full=false)=>{await wait(250);await p.screenshot({path:path.join(OUT,`${vpName}-${theme}-${name}.png`),fullPage:full,animations:'disabled',caret:'hide'});meta.files++;};
  const styles=async(name)=>{const s=await p.evaluate(dumpStyles);fs.writeFileSync(path.join(OUT,`styles-${vpName}-${theme}-${name}.json`),JSON.stringify(s));};
  const closeForm=async()=>{await p.keyboard.press('Escape');await wait(150);if(await p.$eval('#dlgBar',e=>!e.hidden).catch(()=>false)){await p.click('#barConfirm');}await wait(200);};

  await shot('01-cards-activos'); await styles('cards');
  await p.click('.pill[data-filter=todos]'); await wait(150); await shot('02-cards-todos',true);
  await p.click('#btnViewTable'); await wait(200); await shot('03-table'); await styles('table');
  await p.evaluate(()=>{const w=document.querySelector('.table-wrapper'); if(w) w.scrollLeft=260;}); await shot('04-table-scrolled');
  await p.click('#btnViewCards'); await wait(150);
  await p.fill('#q','zzzz-no-existe'); await wait(150); await shot('05-empty-search'); await p.fill('#q',''); await wait(150);
  await p.fill('#q','dulce'); await wait(150); await shot('06-search-match'); await p.fill('#q',''); await wait(150);
  await p.evaluate(()=>scrollTo(0,0));
  // formulario nuevo
  await p.click('#btnNew'); await wait(500); await shot('07-form-new'); await styles('form-new');
  await p.click('#btnPedidoSave'); await wait(450); await shot('08-form-errors');
  await p.fill('#formPedido [name=marca]','Algo'); await p.click('#btnPedidoClose'); await wait(250); await shot('09-form-discard-bar');
  await p.click('#barConfirm'); await wait(300);
  // formulario edición
  await p.click('[data-edit="x0"]'); await wait(500); await shot('10-form-edit'); await styles('form-edit');
  await p.evaluate(()=>{document.querySelector('.dlg-body').scrollTop=99999;}); await shot('11-form-edit-bottom');
  await p.click('#btnDelete'); await wait(250); await shot('12-form-delete-bar');
  await closeForm(); await closeForm(); await p.evaluate(()=>scrollTo(0,0)); await wait(350);
  // configuración
  await p.evaluate(()=>scrollTo(0,0)); await wait(300); await p.click('#btnCfg'); await wait(400); await shot('13-config'); await styles('config'); await p.click('#btnCfgCancel'); await wait(250);
  // aviso (toast)
  await p.click('[data-step=arteAprobado][data-id=x0]'); await wait(1500); await shot('14-toast'); await styles('toast');
  await p.evaluate(()=>{const b=document.querySelector('.toast-action'); b&&b.click();}); await wait(200);
  // header compacto
  await p.evaluate(()=>scrollTo(0,700)); await wait(350); await shot('15-header-compact');
  await p.evaluate(()=>scrollTo(0,0)); await wait(300);
  // cambio de tema (botón)
  await p.click('#btnThemeToggle'); await wait(300); await shot('16-theme-toggled'); await p.click('#btnThemeToggle'); await wait(200);
  if(p.errs.length) fs.writeFileSync(path.join(OUT,`errors-${vpName}-${theme}.txt`),p.errs.join('\n'));
  await ctx.close();
 }
 // vacío total (sin pedidos) en móvil/oscuro
 const c2=await b.newContext({viewport:{width:375,height:740},isMobile:true,hasTouch:true,colorScheme:'dark',reducedMotion:'reduce',serviceWorkers:'block',locale:'es-PE',timezoneId:'America/Lima'});const p2=await c2.newPage();await p2.goto(URL);await wait(700);await p2.screenshot({path:path.join(OUT,'mobile-dark-17-empty-app.png'),animations:'disabled'});meta.files++;await c2.close();
 console.log('capturas:',meta.files,'→',OUT); await b.close();
})();
