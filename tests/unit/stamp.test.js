import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('los sellos ?v= de los CSS en index.html están al día (si falla: npm run stamp)', () => {
  assert.doesNotThrow(() => execFileSync('node', ['tools/stamp.js', '--check'], { cwd: root, stdio: 'pipe' }));
});

test('todo css/*.css está enlazado en index.html (y viceversa) y el orden de la cascada no cambió', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const linked = [...html.matchAll(/<link rel="stylesheet" href="css\/([^"?]+)/g)].map(m => m[1]);
  const files = fs.readdirSync(path.join(root, 'css')).sort();
  assert.deepEqual([...linked].sort(), files);
  assert.deepEqual(linked, ['fonts.css', 'tokens.css', 'base.css', 'header.css', 'kpi.css', 'main.css', 'cards.css', 'table.css', 'fab-toast.css', 'dialogs.css', 'forms.css', 'a11y.css'],
    'el orden de los <link> ES el orden de la cascada: cambiarlo cambia el diseño');
});

test('el service worker precachea todos los css/ y js/ y el HTML precarga todos los módulos', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const dir of ['css', 'js']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      assert.ok(sw.includes(`'./${dir}/${f}'`), `sw.js no precachea ${dir}/${f}`);
    }
  }
  for (const f of fs.readdirSync(path.join(root, 'js'))) {
    assert.ok(html.includes(`<link rel="modulepreload" href="js/${f}">`), `falta modulepreload de js/${f}`);
  }
});
