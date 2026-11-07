'use strict';

const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const read = name => readFileSync(join(root, name), 'utf8');
const mimeTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function inline(tag, source) {
  if (source.toLowerCase().includes('</' + tag)) {
    throw new Error('Unexpected closing ' + tag + ' tag in source file');
  }
  return '<' + tag + '>\n' + source.trimEnd() + '\n</' + tag + '>';
}

function build() {
  const art = Object.fromEntries(readdirSync(join(root, 'assets')).sort().map(name => {
    const mime = mimeTypes[name.split('.').pop()];
    if (!mime || !/^[\w.-]+$/.test(name)) throw new Error('Unsupported asset: ' + name);
    const bytes = readFileSync(join(root, 'assets', name));
    return [name, 'data:' + mime + ';base64,' + bytes.toString('base64')];
  }));

  const scripts = [inline('script', 'const SALVAGE_EMBEDDED_ART = ' + JSON.stringify(art) + ';')];
  const html = read('index.template.html')
    .replace('<link rel="stylesheet" href="styles.css">', () => inline('style', read('styles.css')))
    .replace(/^[ \t]*<script defer src="([\w.-]+\.js)"><\/script>\r?\n/gm, (_, name) => {
      scripts.push(inline('script', read(name)));
      return '';
    });
  if (scripts.length === 1 || /<(?:link|script)\b[^>]*(?:src|href)=/i.test(html) || !html.includes('</body>')) {
    throw new Error('The HTML template contains missing or unexpected asset links');
  }

  // Classic inline scripts run immediately, so place them after the game controls.
  return html.replace('</body>', () => scripts.join('\n') + '\n</body>');
}

if (require.main === module) writeFileSync(join(root, 'index.html'), build());

module.exports = { build };
