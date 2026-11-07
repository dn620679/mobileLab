'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('a large burst keeps canvas sprites bounded at mobile width and can render a merge', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'effects.js'), 'utf8');
  const data = require('../data.js');
  const pendingFrames = [];
  const timers = [];
  let drawCalls = 0;
  let largest = 0;
  let atlasOutputs = [];
  const drawing = {
    setTransform() {},
    clearRect() { drawCalls = 0; },
    fillRect() {},
    drawImage(_image, column, row) {
      assert.ok(Number.isFinite(column) && Number.isFinite(row));
      largest = Math.max(largest, ++drawCalls);
      atlasOutputs.push([column, row]);
    },
  };
  const canvas = { width: 720, height: 160, clientWidth: 354, clientHeight: 113, getContext: () => drawing };
  const scope = {
    SALVAGE_DATA: data, window: { devicePixelRatio: 2 }, canvas,
    Image: class { complete = true; naturalWidth = 240; },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: callback => pendingFrames.push(callback),
    setTimeout: callback => timers.push(callback),
  };
  const effects = vm.runInNewContext(script + '\nSALVAGE_EFFECTS.create(canvas, () => false);', scope);
  assert.equal(canvas.width, 708);
  for (let index = 0; index < 100; index += 1) effects.drop({ 'mana:1': 100 });
  pendingFrames.shift()(16);
  assert.equal(largest, 110);
  effects.merge('mana:1', 'mana:2');
  for (const callback of timers) callback();
  atlasOutputs = [];
  pendingFrames.shift()(33);
  const shardIndex = Object.keys(data.items).indexOf('mana:2');
  assert.ok(atlasOutputs.some(([column, row]) => column === shardIndex % 10 * 24 && row === Math.floor(shardIndex / 10) * 24));
  assert.ok(largest <= 110);
});
