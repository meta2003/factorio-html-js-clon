// Build: concatenates src/template.html + src/style.css + src/NN-*.js (sorted) into ONE self-contained HTML file.
// Usage: node build/build.js            -> build/Factio.html
//        node build/build.js --deploy   -> also copies to the Desktop (~/Desktop/Factio.html)
//        node build/build.js --deploy "C:\some\other\path.html"
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const files = fs.readdirSync(src).filter(f => /^\d{2}[-_].*\.js$/.test(f)).sort();
if (!files.length) { console.error('no src/NN-*.js modules found'); process.exit(1); }
const cssPath = path.join(src, 'style.css');
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
let js = files.map(f => `\n// ===================== ${f} =====================\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
js = js.replace(/<\/script/gi, '<\/script'); // never terminate the inline script early
if (!tpl.includes('/*__CSS__*/') || !tpl.includes('/*__JS__*/')) { console.error('template.html must contain /*__CSS__*/ and /*__JS__*/ placeholders'); process.exit(1); }
const html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
const out = path.join(root, 'build', 'Factio.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`built ${out}  (${(html.length / 1024).toFixed(1)} KB, ${files.length} modules: ${files.join(', ')})`);
const di = process.argv.indexOf('--deploy');
if (di !== -1) {
  const dest = (process.argv[di + 1] && !process.argv[di + 1].startsWith('--')) ? process.argv[di + 1] : require('path').join(require('os').homedir(), 'Desktop', 'Factio.html');
  fs.copyFileSync(out, dest);
  console.log('deployed to', dest);
}
