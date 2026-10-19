// Turns dist/index.html into the page published online (publish/index.html):
// styles inlined, app code served next to it as assets/app.js. The artifact host doesn't serve
// .glb files, so the 3D model goes along base64-encoded in models/shahrofar.glb.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>(.*?)<\/title>/)[1];
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/)[1];
const css = readFileSync(`dist/${cssHref}`, 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].trim();

mkdirSync('publish/assets', { recursive: true });
mkdirSync('publish/models', { recursive: true });
const app = readFileSync('dist/assets/app.js', 'utf8');
if (!app.includes('models/shahrofar.glb')) throw new Error('model URL not found in app.js');
writeFileSync('publish/assets/app.js', app.replaceAll('models/shahrofar.glb', 'models/shahrofar.glb.json'));
const glb = readFileSync('dist/models/shahrofar.glb');
writeFileSync('publish/models/shahrofar.glb.json', JSON.stringify({ glb: glb.toString('base64') }));
writeFileSync(
  'publish/index.html',
  `<title>${title}</title>\n<style>${css}</style>\n${body}\n<script type="module" src="assets/app.js"></script>\n`,
);
console.log('publish/index.html ready');
