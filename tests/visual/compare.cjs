// uso: node tests/visual/compare.cjs <carpetaA> <carpetaB>
// PNG: hash; si difiere, se decodifica y se mide (píxeles distintos, delta máximo, bounding box).
// Estilos calculados: comparación por propiedad (independiente del orden de enumeración).
const { launch } = require('../helpers/browser.cjs'); const fs=require('fs'),path=require('path'),crypto=require('crypto');
// ruido de rasterizado medido en la línea base: <= 4 px con algún canal > 8/255
const SIG_MAX=8;
const [A,B]=process.argv.slice(2); const lsA=fs.readdirSync(A).sort(), lsB=fs.readdirSync(B).sort();
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const parse=s=>{const o={};s.split(';').forEach(x=>{if(!x)return;const i=x.indexOf(':');o[x.slice(0,i)]=x.slice(i+1);});return o;};
(async()=>{
 const b=await launch(); const pg=await b.newPage();
 const measure=async(fa,fb)=>pg.evaluate(async([x,y])=>{const load=async u=>{const i=new Image();i.src=u;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);return {w:i.width,h:i.height,d:g.getImageData(0,0,i.width,i.height).data};};const a=await load(x),b2=await load(y);if(a.w!==b2.w||a.h!==b2.h)return {size:`${a.w}x${a.h} vs ${b2.w}x${b2.h}`};let n=0,sig=0,max=0,x0=1e9,y0=1e9,x1=-1,y1=-1;for(let i=0;i<a.d.length;i+=4){let m=0;for(let k=0;k<3;k++)m=Math.max(m,Math.abs(a.d[i+k]-b2.d[i+k]));if(m>0){n++;if(m>max)max=m;if(m>8)sig++;const p=i/4,px=p%a.w,py=(p/a.w)|0;if(px<x0)x0=px;if(py<y0)y0=py;if(px>x1)x1=px;if(py>y1)y1=py;}}return {w:a.w,h:a.h,diffPx:n,sigPx:sig,maxDelta:max,box:n?[x0,y0,x1,y1]:null};},
   ['data:image/png;base64,'+fs.readFileSync(fa).toString('base64'),'data:image/png;base64,'+fs.readFileSync(fb).toString('base64')]);
 let pngSame=0,pngNoise=[],pngReal=[],stOk=0,stBad=[];
 const onlyA=lsA.filter(x=>!lsB.includes(x)),onlyB=lsB.filter(x=>!lsA.includes(x));
 for(const f of lsA.filter(x=>lsB.includes(x))){
  if(f.endsWith('.png')){ if(sha(path.join(A,f))===sha(path.join(B,f))){pngSame++;continue;} const m=await measure(path.join(A,f),path.join(B,f)); (m.size||m.sigPx>SIG_MAX)?pngReal.push({f,...m}):pngNoise.push({f,...m}); }
  else if(f.startsWith('styles-')){ const a=JSON.parse(fs.readFileSync(path.join(A,f))),bb=JSON.parse(fs.readFileSync(path.join(B,f)));const ka=Object.keys(a),kb=Object.keys(bb);const missing=ka.filter(k=>!(k in bb)),extra=kb.filter(k=>!(k in a));const diffs=[];
    ka.filter(k=>k in bb).forEach(k=>{const pa=parse(a[k]),pb=parse(bb[k]);const props=Object.keys({...pa,...pb}).filter(p=>pa[p]!==pb[p]);if(props.length)diffs.push(k+' → '+props.slice(0,4).map(p=>`${p}: ${pa[p]} ≠ ${pb[p]}`).join(' | '));});
    (missing.length||extra.length||diffs.length)?stBad.push({f,elementosA:ka.length,elementosB:kb.length,faltan:missing.slice(0,3),sobran:extra.slice(0,3),difieren:diffs.length,ejemplo:diffs.slice(0,3)}):stOk++; }
 }
 console.log(`PNG idénticos byte a byte: ${pngSame}`);
 console.log(`PNG con ruido de rasterizado (<= 8 px con algún canal > 8/255): ${pngNoise.length}`); pngNoise.forEach(x=>console.log(`   ${x.f}: ${x.diffPx} px de ${x.w*x.h}, delta máx ${x.maxDelta}`));
 console.log(`PNG con DIFERENCIA REAL: ${pngReal.length}`); pngReal.forEach(x=>console.log('   ',JSON.stringify(x)));
 console.log(`Estilos calculados idénticos (TODOS los elementos, TODAS las propiedades + geometría): ${stOk}/${stOk+stBad.length}`); stBad.forEach(x=>console.log('  DIFIERE',JSON.stringify(x,null,1)));
 if(onlyA.length||onlyB.length) console.log('archivos solo en A:',onlyA,'solo en B:',onlyB);
 const bad=pngReal.length+stBad.length+onlyA.length+onlyB.length; console.log(bad===0?'RESULTADO: IDÉNTICO':'RESULTADO: HAY DIFERENCIAS'); process.exitCode=bad?1:0; await b.close();
})();
