(() => {
  const tank = document.getElementById("tank");
  const layer = document.getElementById("life-layer");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (!tank || !layer) return;

  const SCENE = Object.freeze({
    seed: 0xa0f15a,
    creatures: [
      { mode: "fish", count: 4, yMin: 0.14, yMax: 0.62, width: [138, 190], speed: [9, 20], opacity: [0.42, 0.62], blur: [0, 0], sway: [8, 20], z: 2, aspect: 0.58 },
      { mode: "fish", count: 3, yMin: 0.26, yMax: 0.82, width: [190, 260], speed: [15, 28], opacity: [0.62, 0.86], blur: [0, 0], sway: [12, 28], z: 5, aspect: 0.58 },
      { mode: "jelly", count: 4, yMin: 0.16, yMax: 0.72, width: [118, 168], speed: [5, 13], opacity: [0.52, 0.78], blur: [0, 0], sway: [16, 34], z: 4, aspect: 1.18 },
      { mode: "ray", count: 3, yMin: 0.34, yMax: 0.86, width: [170, 250], speed: [10, 23], opacity: [0.52, 0.78], blur: [0, 0], sway: [10, 24], z: 3, aspect: 0.66 },
    ],
    bubbleCount: 34,
  });

  // cheap smooth (value) noise - gives the shimmer/drift texture
  function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
    const a = hash(xi,yi), b = hash(xi+1,yi), c = hash(xi,yi+1), d = hash(xi+1,yi+1);
    return a*(1-u)*(1-v) + b*u*(1-v) + c*(1-u)*v + d*u*v;
  }
  const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
  const smoothstep = (e0,e1,x) => { const t = clamp((x-e0)/(e1-e0||1e-6),0,1); return t*t*(3-2*t); };

  // FISH - faces left, tail on the right swishes most. Returns density 0..1.
  function fishField(x, y, t) {
    const swish = Math.sin(x * 3.0 - t * 4.0) * 0.10 * clamp((x + 0.4) / 1.2, 0, 1);
    const yw = y - swish;                              // warp body by the swim wave
    const bx = x / 0.62, by = yw / 0.30;
    const body = 1.0 - (bx*bx + by*by);               // >0 inside the body ellipse
    const tx = (x - 0.5) / 0.34;                      // 0..1 across the tail fin
    const spread = Math.abs(yw) / (0.06 + tx * 0.34);
    const tail = (x > 0.48) ? (1.0 - Math.max(tx, spread)) : -1;
    let d = smoothstep(0.0, 0.30, Math.max(body, tail)); // feathered edge -> density
    if (d <= 0) return 0;
    const ex = x + 0.40, ey = yw + 0.02;              // punch an eye near the head
    if (ex*ex + ey*ey < 0.004) d = 0;
    const tex = 0.55 + 0.5 * vnoise(x*7 + t*0.6, y*7 - t*0.4);
    return clamp(d * tex, 0, 1);
  }

  // JELLYFISH - pulsing bell + drifting tentacles. Same return contract.
  function jellyField(x, y, t) {
    const pulse = 1.0 + 0.14 * Math.sin(t * 2.2);
    const cy = (y + 0.28), rx = 0.55 * pulse, ry = 0.44 * pulse;
    const bell = 1.0 - ((x/rx)*(x/rx) + (cy/ry)*(cy/ry));
    let dome = (cy < 0.16) ? smoothstep(0.0, 0.30, bell) : 0;     // top hemisphere only
    let tent = 0;
    if (y > -0.06) {
      const strands = 7;
      for (let i = 0; i < strands; i++) {
        const sx  = (i / (strands - 1) - 0.5) * 0.78;
        const wob = Math.sin(y * 6.0 + t * 3.0 + i) * (0.04 + y * 0.06);
        const dx  = Math.abs(x - (sx + wob));
        const fall = clamp(1.0 - (y + 0.06) / 0.9, 0, 1);          // fade downward
        tent = Math.max(tent, smoothstep(0.045, 0.0, dx) * fall * 0.85);
      }
    }
    let d = Math.max(dome, tent);
    if (d <= 0) return 0;
    const tex = 0.5 + 0.55 * vnoise(x*7 - t*0.3, y*7 + t*0.5);
    return clamp(d * tex, 0, 1);
  }

  // RAY - rounded head/body + a wing that beats through the body + a traveling whip-tail wave.
  function rayField(x, y, t) {
    const omega = 2.4;                                  // wingbeat clock, ~0.38 Hz
    const pitch = 0.03 * Math.sin(omega * t - 2.6) * (x + 0.35); // subtle body rock, reacting to the stroke
    const yp = y + pitch;

    const bx = (x + 0.35) / 0.30, by = yp / 0.13;
    const body = 1.0 - (bx*bx + by*by);

    let wing = -1;
    const yTip = 0.50 * Math.sin(omega * t);            // sweeps through the body: +above, -below
    if (Math.abs(yTip) > 0.02 && Math.sign(yp) === Math.sign(yTip) && Math.abs(yp) <= Math.abs(yTip)) {
      const v = yp / yTip;
      const bow = 0.12 * Math.sin(omega * t - 1.1);      // phase-lagged follow-through bend
      const wcx = -0.05 + (0.35 + bow) * v;
      const halfChord = Math.max(1e-4, 0.42 * Math.pow(1 - v, 1.3));
      wing = 1.0 - Math.abs(x - wcx) / halfChord;
    }

    let tail = -1;
    if (x >= 0.22 && x <= 0.90) {
      const u = (x - 0.22) / 0.68;
      const amp = 0.03 + 0.09 * u;                        // amplitude grows toward the tip
      const yc = amp * Math.sin(6 * u - 3.2 * t + 0.5);   // traveling wave, body -> tip
      const h = 0.09 - 0.05 * u;
      tail = smoothstep(h, 0, Math.abs(yp - yc));
    }

    let d = smoothstep(0.0, 0.24, Math.max(Math.max(body, wing), tail * 0.9));
    if (d <= 0) return 0;
    const ex = x + 0.58, ey = yp + 0.02;
    if (ex*ex + ey*ey < 0.0035) d = 0;
    const tex = 0.48 + 0.55 * vnoise(x*6 - t*0.35, y*6 + t*0.25);
    return clamp(d * tex, 0, 1);
  }

  const RAMP = " .:-=+*#%@";          // index 0 = empty space, last = densest

  const PALETTES = Object.freeze({
    fish: { hue: 188, swing: 16, sat: 72, light: 62, glow: "rgba(93, 230, 255, 0.7)" },
    jelly: { hue: 252, swing: 22, sat: 76, light: 66, glow: "rgba(176, 156, 255, 0.72)" },
    ray: { hue: 166, swing: 18, sat: 68, light: 58, glow: "rgba(92, 255, 218, 0.64)" },
  });

  function colorFor(d, ny, t, mode) {
    const p = PALETTES[mode] || PALETTES.fish;
    const hue = p.hue + p.swing * Math.sin(t * 0.32 + ny * 2.0 + d * 1.7);
    const sat = p.sat + d * 18;
    const light = p.light + d * 24;
    return `hsl(${hue|0} ${sat|0}% ${Math.min(94, light)|0}%)`;
  }

  function glowFor(mode) {
    return (PALETTES[mode] || PALETTES.fish).glow;
  }

  const FIELD_BY_MODE = Object.freeze({
    fish: fishField,
    jelly: jellyField,
    ray: rayField,
  });

  let W = Math.max(window.innerWidth, 1);
  let H = Math.max(window.innerHeight, 1);
  let rng = mulberry32(SCENE.seed);
  const entities = [];

  function mulberry32(seed) {
    return function next() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rand(min, max) {
    return rng() * (max - min) + min;
  }

  function setCreatureVars(el, width, height, opacity, blur) {
    el.style.setProperty("--entity-width", `${width}px`);
    el.style.setProperty("--entity-height", `${height}px`);
    el.style.setProperty("--entity-opacity", opacity.toFixed(3));
    el.style.setProperty("--entity-blur", `${blur.toFixed(2)}px`);
  }

  function setBubbleVars(el, size, opacity, blur) {
    el.style.setProperty("--entity-size", `${size}px`);
    el.style.setProperty("--entity-opacity", opacity.toFixed(3));
    el.style.setProperty("--entity-blur", `${blur.toFixed(2)}px`);
  }

  class AsciiRenderer {
    constructor(canvas, mode) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.mode = mode;
      this.cols = 0;
      this.rows = 0;
      this.cellW = 0;
      this.cellH = 0;
      this.aspect = 1;
    }

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height || !this.ctx) return;
      this.canvas.width  = Math.round(r.width  * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = 6.4;                              // target px per character
      this.cols = Math.max(1, Math.floor(r.width  / cell));
      this.rows = Math.max(1, Math.floor(r.height / (cell * 1.4)));
      this.cellW = r.width / this.cols; this.cellH = r.height / this.rows;
      this.aspect = r.height / r.width;              // keep the creature un-stretched
      this.ctx.font = `${Math.round(this.cellH * 0.95)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      this.ctx.textBaseline = "top";
    }

    render(t) {
      if (!this.ctx) return;
      const field = FIELD_BY_MODE[this.mode] || fishField;

      if (this.mode === "jelly") {
        this.ctx.globalCompositeOperation = "destination-out";
        this.ctx.fillStyle = "rgba(0,0,0,0.18)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = "source-over";
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }

      const cells = [];

      for (let r = 0; r < this.rows; r++) {
        const ny = ((r + 0.5) / this.rows * 2 - 1) * this.aspect;
        for (let c = 0; c < this.cols; c++) {
          const nx = (c + 0.5) / this.cols * 2 - 1;
          const d = field(nx, ny, t);
          if (d < 0.06) continue;                    // skip near-empty -> clean white + speed
          cells.push({
            d,
            ny,
            x: c * this.cellW,
            y: r * this.cellH,
            glyph: RAMP[Math.min(RAMP.length - 1, d * RAMP.length | 0)],
          });
        }
      }

      if (!cells.length) return;

      this.ctx.save();
      this.ctx.globalAlpha = this.mode === "jelly" ? 0.58 : 0.48;
      this.ctx.shadowColor = glowFor(this.mode);
      this.ctx.shadowBlur = this.mode === "jelly" ? 16 : 12;
      this.ctx.fillStyle = glowFor(this.mode);
      for (const cell of cells) {
        this.ctx.fillText(cell.glyph, cell.x, cell.y);
      }
      this.ctx.restore();

      this.ctx.save();
      this.ctx.globalAlpha = 1;
      this.ctx.shadowBlur = 0;
      for (const cell of cells) {
        this.ctx.fillStyle = colorFor(cell.d, cell.ny, t, this.mode);
        this.ctx.fillText(cell.glyph, cell.x, cell.y);
      }
      this.ctx.restore();
    }
  }

  class Creature {
    constructor(spec, initial = true) {
      this.spec = spec;
      this.el = document.createElement("canvas");
      this.el.className = `entity creature creature-${spec.mode}`;
      this.el.dataset.creature = spec.mode;
      this.el.setAttribute("aria-hidden", "true");
      layer.appendChild(this.el);

      this.renderer = new AsciiRenderer(this.el, spec.mode);
      this.reset(initial);
    }

    reset(initial) {
      const { spec } = this;
      this.mode = spec.mode;
      this.width = rand(spec.width[0], spec.width[1]);
      this.height = this.width * spec.aspect;
      this.speed = rand(spec.speed[0], spec.speed[1]);
      this.opacity = rand(spec.opacity[0], spec.opacity[1]);
      this.blur = rand(spec.blur[0], spec.blur[1]);
      this.direction = rng() > 0.5 ? 1 : -1;
      this.baseY = rand(H * spec.yMin, H * spec.yMax);
      this.sway = rand(spec.sway[0], spec.sway[1]);
      this.phase = rand(0, Math.PI * 2);
      this.phaseSpeed = rand(0.26, 0.62);
      this.current = rand(2, 7);
      this.localTime = rand(0, 20);
      this.el.style.zIndex = spec.z;
      setCreatureVars(this.el, this.width, this.height, this.opacity, this.blur);
      this.renderer.resize();

      const pad = this.width * 1.2;
      this.x = initial ? rand(-pad, W + pad) : (this.direction > 0 ? -pad : W + pad);
      this.y = this.baseY;
      this.render();
    }

    rescale(xScale, yScale) {
      this.x *= xScale;
      this.baseY *= yScale;
      this.y *= yScale;
      this.renderer.resize();
      this.render();
    }

    step(dt) {
      this.phase += dt * this.phaseSpeed;
      this.localTime += dt;
      this.x += this.direction * this.speed * dt;
      this.y = this.baseY
        + Math.sin(this.phase) * this.sway
        + Math.sin((this.x * 0.006) + this.phase) * this.current;

      const pad = this.width * 1.3;
      if ((this.direction > 0 && this.x > W + pad) || (this.direction < 0 && this.x < -pad)) {
        this.reset(false);
      }

      this.render();
    }

    render() {
      const flip = this.direction < 0 ? 1 : -1;
      this.el.style.transform = `translate3d(${this.x - this.width / 2}px, ${this.y - this.height / 2}px, 0) scaleX(${flip})`;
      this.renderer.render(this.localTime);
    }
  }

  class Bubble {
    constructor(initial = true) {
      this.el = document.createElement("div");
      this.el.className = "entity bubble";
      this.el.setAttribute("aria-hidden", "true");
      layer.appendChild(this.el);
      this.reset(initial);
    }

    reset(initial) {
      this.size = rand(7, 24);
      this.opacity = rand(0.16, 0.5);
      this.blur = rand(0, 0.9);
      this.baseX = rand(W * 0.04, W * 0.96);
      this.y = initial ? rand(-H * 0.1, H * 1.08) : H + rand(20, 180);
      this.rise = rand(12, 38);
      this.sway = rand(8, 28);
      this.phase = rand(0, Math.PI * 2);
      this.phaseSpeed = rand(0.45, 0.9);
      this.el.style.zIndex = Math.round(rand(1, 6));
      setBubbleVars(this.el, this.size, this.opacity, this.blur);
      this.render();
    }

    rescale(xScale, yScale) {
      this.baseX *= xScale;
      this.y *= yScale;
      this.render();
    }

    step(dt) {
      this.phase += dt * this.phaseSpeed;
      this.y -= this.rise * dt;

      if (this.y < -this.size * 3) {
        this.reset(false);
      }

      this.render();
    }

    render() {
      const x = this.baseX + Math.sin(this.phase) * this.sway;
      this.el.style.transform = `translate3d(${x - this.size / 2}px, ${this.y - this.size / 2}px, 0)`;
    }
  }

  function spawn() {
    rng = mulberry32(SCENE.seed);
    layer.replaceChildren();
    entities.length = 0;

    for (const spec of SCENE.creatures) {
      for (let i = 0; i < spec.count; i += 1) {
        entities.push(new Creature(spec));
      }
    }

    for (let i = 0; i < SCENE.bubbleCount; i += 1) {
      entities.push(new Bubble());
    }
  }

  function resize() {
    const previousW = W;
    const previousH = H;
    W = Math.max(window.innerWidth, 1);
    H = Math.max(window.innerHeight, 1);

    const xScale = W / previousW;
    const yScale = H / previousH;
    for (const entity of entities) entity.rescale(xScale, yScale);
  }

  let raf = 0;
  let running = false;
  let lastTime = 0;

  function tick(now) {
    if (!running) return;

    const dt = Math.min((now - lastTime) / 1000 || 0, 0.05);
    lastTime = now;

    for (const entity of entities) entity.step(dt);
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  // Guards against a hidden/backgrounded load (a real condition for OBS's CEF offscreen
  // rendering), where window.innerWidth/innerHeight read 0 at script time. Spawning against
  // that degenerate size, then rescaling once the real size arrives, would multiply every
  // entity's position by a huge factor and fling the whole scene off-screen.
  const MIN_VIEWPORT = 10;
  function hasRealViewport() {
    return window.innerWidth >= MIN_VIEWPORT && window.innerHeight >= MIN_VIEWPORT;
  }

  function boot() {
    W = Math.max(window.innerWidth, 1);
    H = Math.max(window.innerHeight, 1);
    spawn();
    if (!reduceMotion) start();
  }

  if (hasRealViewport()) {
    boot();
  } else {
    let pollId = 0;
    function tryBoot() {
      if (!hasRealViewport()) return;
      window.removeEventListener("resize", tryBoot);
      document.removeEventListener("visibilitychange", tryBoot);
      clearInterval(pollId);
      boot();
    }
    window.addEventListener("resize", tryBoot, { passive: true });
    document.addEventListener("visibilitychange", tryBoot);
    pollId = setInterval(tryBoot, 250);
  }
})();
