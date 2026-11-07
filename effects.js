'use strict';

const SALVAGE_EFFECTS = (() => {
  const { items, assetUrl } = SALVAGE_DATA;
  const spritePositions = Object.fromEntries(Object.keys(items).map((id, index) => [id, [index % 10, Math.floor(index / 10)]]));
  const rows = Math.ceil(Object.keys(items).length / 10);
  const random = (min, max) => min + Math.random() * (max - min);
  const limit = 110;
  const pixel = 24;

  function icon(id) {
    const [column, row] = spritePositions[id];
    return '<span class="item-icon" aria-hidden="true" style="--atlas-height:' + (rows * 100) + '%;background-position:' +
      (column * 100 / 9) + '% ' + (row * 100 / (rows - 1)) + '%"></span>';
  }

  function create(canvas, reduced) {
    const ctx = canvas.getContext('2d');
    const art = new Image();
    art.src = assetUrl('icons.png');
    let pieces = [];
    let sparks = [];
    let frame = 0;
    let last = 0;
    let width = canvas.width;
    let height = canvas.height;
    let audio;
    let lastHit = 0;
    let lastMerge = 0;

    function resize() {
      width = Math.max(1, Math.round(canvas.clientWidth));
      height = Math.max(1, Math.round(canvas.clientHeight));
      const scale = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      if (!ctx) return;
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      ctx.imageSmoothingEnabled = false;
      for (const piece of pieces) piece.x = Math.min(width - 10, Math.max(10, piece.x));
      draw();
    }
    new ResizeObserver(resize).observe(canvas);
    resize();

    function sprite(id, x, y, size) {
      if (art.complete && art.naturalWidth) {
        const [column, row] = spritePositions[id];
        ctx.drawImage(art, column * pixel, row * pixel, pixel, pixel,
          Math.round(x - size / 2), Math.round(y - size / 2), size, size);
      } else {
        ctx.fillStyle = items[id].color;
        ctx.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
      }
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        const tier = items[piece.id].tier || 2;
        if (tier > 1) {
          ctx.globalAlpha = piece.alpha * Math.min(0.34, 0.11 + tier * 0.04);
          ctx.fillStyle = items[piece.id].color;
          ctx.fillRect(Math.round(piece.x - piece.size / 2), Math.round(piece.y - 2), piece.size, 4);
        }
        ctx.globalAlpha = piece.alpha;
        sprite(piece.id, piece.x, piece.y, piece.size);
      }
      for (const spark of sparks) {
        ctx.globalAlpha = spark.ttl / spark.life;
        ctx.fillStyle = spark.color;
        ctx.fillRect(Math.round(spark.x), Math.round(spark.y), spark.size, spark.size);
      }
      ctx.globalAlpha = 1;
    }

    function animate(now) {
      frame = 0;
      const dt = last ? Math.min(2, (now - last) / (1000 / 60)) : 1;
      last = now;
      const compact = reduced();
      const floor = height - 17;
      for (let index = 0; index < pieces.length; index += 1) {
        const piece = pieces[index];
        piece.life -= dt;
        if (piece.target) {
          piece.x += (piece.target.x - piece.x) * Math.min(1, dt * 0.18);
          piece.y += (piece.target.y - piece.y) * Math.min(1, dt * 0.18);
          piece.alpha = Math.min(1, piece.life / 10);
          continue;
        }
        if (compact) {
          piece.y = floor;
        } else {
          piece.x += piece.vx * dt;
          piece.y += piece.vy * dt;
          piece.vy += 0.40 * dt;
          if (piece.x < 9 || piece.x > width - 9) {
            piece.x = Math.max(9, Math.min(width - 9, piece.x));
            piece.vx *= -0.62;
          }
          if (piece.y >= floor) {
            piece.y = floor;
            piece.vy = Math.abs(piece.vy) < 1.15 ? 0 : -piece.vy * 0.42;
            piece.vx *= 0.82;
            for (let otherIndex = Math.max(0, index - 9); otherIndex < index; otherIndex += 1) {
              const other = pieces[otherIndex];
              const delta = piece.x - other.x;
              if (other.target || Math.abs(piece.y - other.y) > 10 || Math.abs(delta) > 12) continue;
              const push = Math.sign(delta || 1) * 0.22 * dt;
              piece.vx += push;
              other.vx -= push;
            }
          }
        }
        piece.alpha = Math.min(1, piece.life / 24);
      }
      for (const spark of sparks) {
        spark.ttl -= dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        spark.vy += 0.16 * dt;
      }
      pieces = pieces.filter(piece => piece.life > 0);
      sparks = sparks.filter(spark => spark.ttl > 0);
      draw();
      if (pieces.length || sparks.length) frame = requestAnimationFrame(animate);
      else last = 0;
    }

    function run() {
      if (ctx && !frame) frame = requestAnimationFrame(animate);
    }

    function add(id, x, y, overrides = {}) {
      if (pieces.length >= limit) pieces.shift();
      const compact = reduced();
      pieces.push({
        id, x, y: compact ? height - 18 : y, vx: random(-4.8, 4.8), vy: random(-2, 1.5),
        size: (items[id].tier || 2) > 2 ? 22 : 19, alpha: 1, life: compact ? 42 : random(195, 440),
        ...overrides,
      });
      return pieces[pieces.length - 1];
    }

    function burst(x, y, color, count) {
      const compact = reduced();
      for (let index = 0; index < (compact ? Math.min(4, count) : count); index += 1) {
        const life = compact ? 11 : random(14, 33);
        sparks.push({
          x, y, color, life, ttl: life, size: random(1, 4),
          vx: compact ? 0 : random(-3, 3), vy: compact ? 0 : random(-4, 1),
        });
      }
      if (sparks.length > 120) sparks = sparks.slice(-120);
    }

    function drop(drops, origin = 0.52) {
      const x = width * origin;
      let budget = reduced() ? 10 : 32;
      for (const [id, qty] of Object.entries(drops)) {
        const shown = Math.min(qty, budget);
        for (let index = 0; index < shown; index += 1) add(id, x + random(-24, 24), random(-18, 15));
        budget -= shown;
      }
      burst(x, 21, '#ffd694', 7);
      run();
    }

    function merge(id, output) {
      const nearby = pieces.filter(piece => piece.id === id && !piece.target);
      const pivot = nearby.find(piece => piece.y > height * 0.55) || nearby[0];
      const x = Math.min(width - 24, Math.max(24, pivot?.x || random(width * 0.22, width * 0.76)));
      const y = height - 31;
      nearby.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
      if (reduced()) {
        for (const piece of nearby.slice(0, 3)) piece.life = 0;
        add(output, x, y);
        burst(x, y, items[output].color, 7);
      } else {
        for (let index = 0; index < 3; index += 1) {
          const piece = nearby[index] || add(id, x + (index - 1) * 23, y + 7);
          piece.target = { x, y };
          piece.life = 13;
        }
        setTimeout(() => {
          add(output, x, y, { vx: random(-1, 1), vy: -3, size: 25 });
          burst(x, y, items[output].color, 16 + 3 * items[output].tier);
          run();
        }, 205);
      }
      run();
    }

    function collect(moved) {
      for (const [id, qty] of Object.entries(moved)) {
        const available = pieces.filter(piece => piece.id === id && !piece.target && piece.y > height * 0.52);
        for (const piece of available.slice(0, Math.min(qty, 12))) {
          if (reduced()) piece.life = 0;
          else {
            piece.target = { x: width - 10, y: height - 18 };
            piece.life = 21;
          }
        }
      }
      if (pieces.length) run();
    }

    function arm() {
      if (audio?.state === 'running') return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audio && AudioContext) audio = new AudioContext();
        if (audio?.state === 'suspended') audio.resume().catch(() => {});
      } catch {
        // The workshop remains playable without audio support.
      }
    }

    function sound(type, tier = 1) {
      if (!audio || audio.state !== 'running') return;
      const now = performance.now();
      if (type === 'hit' && now - lastHit < 65) return;
      if (type === 'merge' && now - lastMerge < 90) return;
      if (type === 'hit') lastHit = now;
      if (type === 'merge') lastMerge = now;
      const notes = {
        hit: [122], broken: [140, 196], merge: [280 + 76 * tier, 390 + 97 * tier],
        job: [300, 470], sale: [494, 659], quest: [392, 523, 659],
      }[type];
      if (!notes) return;
      notes.forEach((hz, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + index * 0.052;
        oscillator.type = type === 'hit' ? 'triangle' : 'sine';
        oscillator.frequency.value = hz;
        gain.gain.setValueAtTime(0.055, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.17);
      });
    }

    return { drop, merge, collect, arm, sound };
  }

  return { create, icon };
})();
