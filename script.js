(() => {
  const tank = document.getElementById("tank");

  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prefersReduced) return;

  const fishEmojis = ["🐟","🐠","🐡","🦈","🐬","🐳","🦭","🦀","🦞","🦐","🐙","🪼","🦑","🐠"];
  const bubbleEmojis = ["🫧","🫧","🫧","🫧","🫧","🫧","🫧","🫧","🫧","🫧"];

  // Tunables
  const FISH_COUNT = 32;
  const BUBBLE_COUNT = 26;

  // Cursor/touch repulsion
  const repelRadius = 140;       // px
  const repelStrength = 3.85;    // acceleration multiplier
  const cursorFollow = 0.18;     // how quickly the "pointer" target updates

  // Physics
  const maxSpeed = 1.8;
  const drift = 0.015;           // small random drift
  const damping = 0.985;

  // Screen bounds (updated on resize)
  let W = window.innerWidth;
  let H = window.innerHeight;

  // "Pointer" position (mouse or touch), smoothed
  let pointer = { x: W * 0.5, y: H * 0.5 };
  let pointerTarget = { x: pointer.x, y: pointer.y };

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  class Entity {
    constructor({ emoji, className, x, y, vx, vy, size }) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.size = size;

      this.el = document.createElement("div");
      this.el.className = `entity ${className}`;
      this.el.textContent = emoji;
      this.el.style.fontSize = `${size}px`;
      tank.appendChild(this.el);
    }

    render(flip = 1) {
      // flip = 1 normal, -1 mirrored for direction
      this.el.style.transform = `translate(${this.x}px, ${this.y}px) scaleX(${flip})`;
    }
  }

  class Fish extends Entity {
    constructor(opts) {
      super(opts);
      this.turnBias = rand(0.002, 0.009);
      this.wiggle = rand(0, Math.PI * 2);
      this.baseSpeed = rand(0.6, 1.4);
    }

    step() {
      // random gentle turning
      this.vx += rand(-drift, drift);
      this.vy += rand(-drift, drift);

      // slight sinusoidal vertical wiggle
      this.wiggle += rand(0.02, 0.04);
      this.vy += Math.sin(this.wiggle) * this.turnBias;

      // cursor repulsion
      const dx = this.x - pointer.x;
      const dy = this.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 0.0001;

      if (dist < repelRadius) {
        const force = (1 - dist / repelRadius) * repelStrength;
        this.vx += (dx / dist) * force;
        this.vy += (dy / dist) * force;
      }

      // keep fish generally moving forward (avoid near-zero velocity)
      const speed = Math.hypot(this.vx, this.vy);
      if (speed < 0.2) {
        const a = rand(0, Math.PI * 2);
        this.vx += Math.cos(a) * 0.3;
        this.vy += Math.sin(a) * 0.3;
      }

      // cap speed
      const s = Math.hypot(this.vx, this.vy);
      if (s > maxSpeed) {
        this.vx = (this.vx / s) * maxSpeed;
        this.vy = (this.vy / s) * maxSpeed;
      }

      // apply damping
      this.vx *= damping;
      this.vy *= damping;

      // move
      this.x += this.vx * this.baseSpeed;
      this.y += this.vy * this.baseSpeed;

      // soft boundary bounce
      const margin = 20;
      if (this.x < margin) this.vx += 0.25;
      if (this.x > W - margin) this.vx -= 0.25;
      if (this.y < margin + 60) this.vy += 0.18; // keep away from HUD top
      if (this.y > H - margin - 120) this.vy -= 0.18; // keep above sand

      this.x = clamp(this.x, 0, W);
      this.y = clamp(this.y, 0, H);

      // render flipped based on direction
      const flip = this.vx >= 0 ? 1 : -1;
      this.render(flip);
    }
  }

  class Bubble extends Entity {
    constructor(opts) {
      super(opts);
      this.rise = rand(0.4, 1.2);
      this.sway = rand(0.002, 0.01);
      this.phase = rand(0, Math.PI * 2);
      this.opacity = rand(0.35, 0.85);
      this.el.style.opacity = this.opacity.toFixed(2);
    }

    step() {
      this.phase += 0.03;
      this.x += Math.sin(this.phase) * (this.sway * 50);
      this.y -= this.rise;

      // slight cursor repulsion for bubbles too (subtle)
      const dx = this.x - pointer.x;
      const dy = this.y - pointer.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist < repelRadius * 0.85) {
        const force = (1 - dist / (repelRadius * 0.85)) * 0.25;
        this.x += (dx / dist) * force * 2;
        this.y += (dy / dist) * force * 1;
      }

      // respawn at bottom when off top
      if (this.y < -60) {
        this.y = H + rand(40, 220);
        this.x = rand(0, W);
        this.rise = rand(0.4, 1.2);
        this.opacity = rand(0.35, 0.85);
        this.el.style.opacity = this.opacity.toFixed(2);
      }

      this.render(1);
    }
  }

  const fishes = [];
  const bubbles = [];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function spawn() {
    // fish
    for (let i = 0; i < FISH_COUNT; i++) {
      const size = rand(26, 52);
      fishes.push(new Fish({
        emoji: pick(fishEmojis),
        className: "fish",
        x: rand(0, W),
        y: rand(80, H - 180),
        vx: rand(-1, 1),
        vy: rand(-0.6, 0.6),
        size
      }));
    }

    // bubbles
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const size = rand(14, 30);
      bubbles.push(new Bubble({
        emoji: pick(bubbleEmojis),
        className: "bubble",
        x: rand(0, W),
        y: rand(0, H),
        vx: 0,
        vy: 0,
        size
      }));
    }
  }

  function onResize() {
    W = window.innerWidth;
    H = window.innerHeight;
  }

  function setPointerTarget(x, y) {
    pointerTarget.x = x;
    pointerTarget.y = y;
  }

  window.addEventListener("resize", onResize, { passive: true });

  window.addEventListener("mousemove", (e) => {
    setPointerTarget(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener("touchstart", (e) => {
    if (!e.touches?.length) return;
    const t = e.touches[0];
    setPointerTarget(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!e.touches?.length) return;
    const t = e.touches[0];
    setPointerTarget(t.clientX, t.clientY);
  }, { passive: true });

  // If the pointer leaves, drift back toward center slowly
  window.addEventListener("mouseleave", () => {
    setPointerTarget(W * 0.5, H * 0.5);
  }, { passive: true });

  function animate() {
    // smooth pointer
    pointer.x += (pointerTarget.x - pointer.x) * cursorFollow;
    pointer.y += (pointerTarget.y - pointer.y) * cursorFollow;

    // step entities
    for (const b of bubbles) b.step();
    for (const f of fishes) f.step();

    requestAnimationFrame(animate);
  }

  spawn();
  animate();
})();
