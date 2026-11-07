'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { build } = require('../scripts/build-standalone.js');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('the downloadable HTML matches its sources and loads no linked files', () => {
  assert.equal(html, build());
  const markup = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(markup, /<(?:link|script|img)\b[^>]*(?:href|src)=/i);
  assert.ok(html.indexOf('<style>') < html.indexOf('</head>'));
  assert.ok(html.indexOf('<script>') > html.indexOf('</main>'));
  assert.match(html, /var\(--hangar-art, none\)/);
  assert.match(html, /var\(--item-art, none\)/);
  assert.match(html, /var\(--station-art, none\)/);
});

test('inline startup order makes every art asset accessible without a base URL', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => new vm.Script(code));
  assert.equal(scripts.length, 5);
  const context = vm.createContext({});
  // Run the manifest and the inline game libraries with browser-style globals.
  for (const script of scripts.slice(0, -1)) script.runInContext(context);
  const names = vm.runInContext("SALVAGE_DATA.beasts.map(beast => beast.id + '.webp')", context);
  for (const name of [...names, 'hangar.jpg', 'stations.png', 'icons.png']) {
    const url = vm.runInContext('SALVAGE_DATA.assetUrl(' + JSON.stringify(name) + ')', context);
    const [, encoded] = url.match(/^data:image\/(?:webp|jpeg|png);base64,(.+)$/);
    assert.deepEqual(Buffer.from(encoded, 'base64'), readFileSync(join(root, 'assets', name)));
  }
  assert.equal(vm.runInContext('SALVAGE_GAME.create().state.hp.length', context), 4);
  assert.equal(vm.runInContext("typeof SALVAGE_EFFECTS.create", context), 'function');
});
