/* Escaneo de contraste de TODO el texto renderizado (WCAG AA: 4.5:1, o 3:1 en texto grande).
 * Pásalo a page.evaluate(scanContrast) → devuelve la lista de elementos que NO cumplen.
 * Compone colores con transparencia, fondos heredados y la opacidad de los ancestros. */
function scanContrast() {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = el => {
    const chain = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) chain.push(c); if (c && c.a === 1) break; }
    let bg = { r: 12, g: 10, b: 9, a: 1 };
    if (!chain.length || chain[chain.length - 1].a < 1) { const rb = parse(getComputedStyle(document.body).backgroundColor); bg = rb && rb.a > 0 ? rb : bg; }
    for (let i = chain.length - 1; i >= 0; i--) bg = chain[i].a === 1 ? chain[i] : over(chain[i], bg);
    return bg;
  };
  const out = [], seen = new Set();
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('svg,dialog:not([open]),[aria-hidden=true]')) return;
    const txt = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ');
    if (!txt) return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden') return;
    let fg = parse(cs.color); const bg = bgOf(el);
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    fg = over({ ...fg, a: fg.a * op }, bg);
    const [a, b] = [L(fg), L(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) {
      const k = el.className + '|' + ratio.toFixed(2);
      if (!seen.has(k)) { seen.add(k); out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} "${txt.slice(0, 22)}" ${ratio.toFixed(2)} (${cs.fontSize})`); }
    }
  });
  return out;
}
module.exports = { scanContrast };
