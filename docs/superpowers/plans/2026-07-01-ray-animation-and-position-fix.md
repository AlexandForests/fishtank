# Ray Animation Rework + Off-Screen Position Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **NO-CODE PLAN (per Alex's explicit instruction):** this plan contains no implementation code. Every step instead specifies exact geometry, math, constants, and observable pass/fail criteria. The executor writes the code from these specs. This intentionally deviates from the usual "complete code in every step" plan rule — the user instruction overrides it.

**Goal:** Make the ray creature read as a swimming ray (visible wing strokes + whip tail) instead of a bobbing triangle blob, and fix the bootstrap bug that flings all creatures permanently off-screen when the page loads in a hidden/zero-size viewport (the exact condition OBS Browser Sources can produce).

**Architecture:** All changes live in `script.js`. The ray change replaces the body of `rayField(x, y, t)` only — same signature, same "density 0..1" contract consumed by `AsciiRenderer` via `FIELD_BY_MODE.ray` — plus possibly one number (the ray `aspect`) in `SCENE.creatures`. The position fix changes only the bootstrap (gate `spawn()`/`start()` on a real viewport) and `resize()` (guard against a degenerate previous size).

**Tech Stack:** Plain HTML/CSS/JS, Canvas2D, no dependencies, no build step. Repo: `~/Desktop/claude/aurafish` (remote `github.com/AlexandForests/fishtank`).

## Global Constraints

- No new dependencies, no build step, no new files (except this plan doc).
- `rayField(x, y, t)` keeps its exact signature and return contract: density in `[0, 1]`, `0` means "draw nothing in this cell".
- Field space convention (matches fish/jelly): `x ∈ [−1, 1]` left→right, head at −x / tail at +x; `y ∈ [−a, +a]` where `a` = canvas height/width; direction flip is done by CSS `scaleX`, never inside the field.
- Keep the existing `vnoise` texture multiply and the existing `smoothstep(0.0, K, …)` edge-feathering style.
- No per-frame allocations beyond the existing pattern (the field is called ~250×/creature/frame).
- Do not touch `docs/superpowers/plans|specs/2026-06-01-aurawarp*` — stale docs from a different project; leave in place, untracked or tracked as-is.
- Match the file's existing plain-JS style (const-heavy, short helper math, comments only for non-obvious constraints).
- Commit at the end of every task. Trailer on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Execution-order note

Alex asked for ray work first, position fix second, and the plan is ordered that way. But Part B is fully independent, and **executing Part B first makes every Part A verification simpler** (creatures appear on-screen naturally instead of needing the pinning harness below). Either order works; the harness makes Part A self-sufficient.

## Verification harness (used by Part A tasks while the position bug still exists)

The preview tab loads hidden (viewport reports 0×0), so creatures spawn off-screen. Until Part B lands, each visual check pins rays on-screen the same way it was done during research on 2026-07-01:

1. Start the `aurafish` server from `.claude/launch.json` (python http.server, port 4179).
2. Via `preview_eval`, append a `<style>` element to `document.head` containing rules of the form `.creature-ray:nth-of-type(…) { transform: translate3d(Xpx, Ypx, 0) scaleX(1) !important; }` — one rule per ray, spaced across the viewport. `!important` beats the per-frame inline `style.transform` writes, so the animation keeps running while position is pinned.
3. Screenshot via `preview_screenshot`. For motion checks, take screenshots ~0.8 s apart (the field keeps animating because `localTime` advances regardless of position).
4. Remove the injected style / reload when done.

The rays are the `canvas.creature-ray` elements (3 of them, per `SCENE.creatures`).

---

## File Structure

| File | Change |
| --- | --- |
| `script.js` | Task 1: committed as-is (baseline). Task 2–4: `rayField` body rewritten + one `SCENE` ray-spec number if needed. Task 5–6: bootstrap gate + `resize()` guard. |
| `index.html`, `style.css` | Task 1 baseline commit only; no edits. |
| `docs/superpowers/plans/2026-07-01-ray-animation-and-position-fix.md` | This plan (commit in Task 1). |

---

## Task 1: Baseline commit — protect the uncommitted rewrite

The entire procedural-ASCII rewrite (the real product) exists only in the working tree; the only commit on `main` is the old emoji fish tank. Nothing else in this plan should run before the baseline is safe.

**Files:**
- Commit (no edits): `index.html`, `script.js`, `style.css`, this plan file.

- [ ] **Step 1: Confirm state** — `git -C ~/Desktop/claude/aurafish status` shows exactly: modified `index.html`, `script.js`, `style.css`; untracked `docs/`, `.DS_Store`. If anything else appears, stop and surface it.
- [ ] **Step 2: Stage and commit** — stage the three product files plus this plan file (path-explicit adds; do **not** stage `.DS_Store` or the stale aurawarp docs). Commit message: `feat: procedural ASCII creature rewrite (fish/jelly/ray density fields, bubbles, caustics)` + trailer.
- [ ] **Step 3: Verify** — `git status` clean except `.DS_Store` and the two aurawarp doc files; `git log --oneline` shows the new commit on top of `66b5869`. Do not push (publish only on explicit go-ahead).

---

## Task 2: Ray silhouette rewrite (static pose)

Replace the diamond with a side-profile ray at a fixed mid-stroke pose. No animation changes yet — this task is judged entirely on whether a frozen frame reads as a ray.

**Files:**
- Modify: `script.js` — body of `rayField` (currently lines ~71–83).

**Interfaces:**
- Consumes: existing helpers `clamp`, `smoothstep`, `vnoise` (unchanged).
- Produces: `rayField(x, y, t)` → density `0..1`, same as before. `FIELD_BY_MODE`, `AsciiRenderer`, `Creature` untouched.

**Geometry spec (all coordinates in field space):**

1. **Body** — flat horizontal ellipse: center `(−0.15, 0)`, semi-axes `rx = 0.58`, `ry = 0.15`. Density from the same "1 − normalized-radius²" pattern `fishField` uses for its body, fed through the shared final feathering (step 5).
2. **Eye** — punch to zero, matching `fishField`'s technique: zero the density where `(x + 0.60)² + (y + 0.02)² < 0.0035`. (Head is at the left; the eye is what makes the blunt end read as a head.)
3. **Wing (fixed pose for this task)** — one large fin seen side-on, sweeping from a root chord on the body to a point:
   - Tip at `(−0.12, 0.38)` (above the back for the static pose).
   - For a point at height `y` between body midline and tip, define `v = y / 0.38`, valid `v ∈ [0, 1]`.
   - Wing centerline at height `v`: `cx(v) = −0.12 + 0.06·v²` (a slight fixed rearward bow so the edge is curved, not straight).
   - Half-chord (horizontal half-width) at height `v`: `halfChord(v) = 0.30·(1 − v)^1.45` — a curved taper to a genuine point (the exponent > 1 is what kills the "triangle" read; linear taper = straight edges).
   - Wing density: `1 − |x − cx(v)| / halfChord(v)`, clamped at 0, only for `v ∈ [0, 1]`.
4. **Whip tail** — freed from the disc (the old wing spanned `|x| ≤ 0.96`, leaving the tail nowhere to exist):
   - Domain `x ∈ [0.30, 0.98]`; let `u = (x − 0.30) / 0.68`.
   - Static centerline for this task: `yc(u) = 0.03·sin(7·u + 0.5)` (a gentle fixed S-curve).
   - Half-thickness `h(u)` tapering linearly `0.05 → 0.02` from base to tip.
   - Tail density: `smoothstep(h(u), 0, |y − yc(u)|)`, weighted `× 0.9` in the max below.
5. **Combine** — `d = smoothstep(0.0, 0.24, max(body, wing, tail·0.9))`, then the eye punch, then the existing `vnoise` texture multiply and clamp — identical structure to the current final three lines of `rayField`.

- [ ] **Step 1: Success criterion (write it down before editing)** — a pinned ray at ~500 px width shows: blunt head with eye at left, flat wide body, one curved fin rising to a point above the back, and a thin tail extending right, clearly outside the body silhouette. A stranger asked "what animal is this?" should say ray/stingray/manta, not "triangle".
- [ ] **Step 2: Implement the geometry above** — replace the `rayField` body. Remove the now-dead old constants (`flap`, `wingThickness`, `tailWave` in their old forms); leave everything else in the file untouched.
- [ ] **Step 3: Verify at display size** — pin all 3 rays via the harness; screenshot. Check the silhouette criterion at each ray's natural random width (170–250 px).
- [ ] **Step 4: Tail rasterization check** — at the smallest ray (~170 px wide → ~12 rows), the tail is near one-cell thickness. A **dotted/intermittent** glyph tail is acceptable (it reads as a whip and suits the ASCII aesthetic); an **invisible** tail is a failure — if invisible, raise tail half-thickness to `0.06 → 0.03` and re-verify; if still invisible, raise the ray spec's minimum width `170 → 190` in `SCENE.creatures` and re-verify.
- [ ] **Step 5: Commit** — `feat: ray silhouette rework — side-profile body, curved wing fin, freed whip tail` + trailer.

---

## Task 3: Ray animation — wing stroke, follow-through, tail wave

Animate the Task-2 pose. This is the actual "improve the animation" deliverable.

**Files:**
- Modify: `script.js` — `rayField` only (turn Task 2's fixed constants into functions of `t`).

**Animation spec:**

1. **Stroke clock** — `ω = 2.4` rad/s (~0.38 Hz, one full wingbeat ≈ 2.6 s; majestic glide, distinctly slower than the fish swish at ~4 rad/s).
2. **Wing stroke** — tip height `yTip(t) = 0.42·sin(ω·t)`. The wing sweeps *through* the body: positive = over the back, negative = under the belly, momentarily edge-on (near-invisible) at the zero crossing — that appear/disappear beat is the signature side-view manta motion. Wing math from Task 2 generalizes with `v = y / yTip(t)` (valid when `y` and `yTip` share sign and `|y| ≤ |yTip|`); guard the near-zero crossing (`|yTip| < ~0.02` → no wing) to avoid a divide-by-tiny flicker.
3. **Follow-through bend** — the bow term becomes `cx(v) = −0.12 + bow(t)·v²` with `bow(t) = 0.16·sin(ω·t − 1.1)`. The phase lag makes the wing tip trail the stroke and the fin visibly *bend* through each beat — this, not the stroke itself, is what makes it feel alive rather than mechanical. (Task 2's amplitude envelope already fixes the old inverted-envelope bug: displacement is now zero at the body and maximal at the tip.)
4. **Tail traveling wave** — centerline becomes `yc(u, t) = amp(u)·sin(7·u − 3.2·t + 0.5)` with `amp(u) = 0.025 + 0.085·u` (amplitude grows toward the tip; positive `u` coefficient with negative `t` coefficient makes the wave travel body→tip).
5. **Body pitch (subtle)** — shear the sampling coordinate before all geometry: `y′ = y + 0.04·sin(ω·t − 2.6)·(x + 0.15)`, then use `y′` everywhere Task 2 used `y`. The body gently rocks against the wingbeat (reaction to the stroke). If it muddies the silhouette at small sizes, drop the coefficient to 0.02 or delete this term — it's polish, not load-bearing.

- [ ] **Step 1: Success criterion** — three screenshots of a pinned ray at ~0.8 s spacing show the wing tip clearly above the body, near edge-on, and clearly below (or an equivalent phase sampling); the tail's S-curve differs between shots; nothing pops or teleports at the wing's zero crossing.
- [ ] **Step 2: Implement** the five animation terms above.
- [ ] **Step 3: Verify motion** — run the harness screenshot sequence; check the criterion. Also watch ~10 s for the zero-crossing guard (no one-frame full-height flash).
- [ ] **Step 4: Verify no clipping** — at the stroke peak (`|yTip| = 0.42` plus feathering), the tip must not clip the canvas edge (field `y` range is `±aspect = ±0.66`). If clipped, raise the ray `aspect` in `SCENE.creatures` from `0.66` to `0.72` (this changes only canvas proportions; the spec's `width` ranges stay).
- [ ] **Step 5: Cross-check the other creatures** — fish and jelly are untouched by construction, but confirm with one full-scene pinned screenshot (guards against accidental shared-helper edits).
- [ ] **Step 6: Commit** — `feat: ray wingbeat with follow-through, traveling tail wave, body pitch` + trailer.

---

## Task 4: Ray tuning pass at scene scale

The ray is judged in the tank, not in isolation: against the green `PALETTES.ray` glow, screen blend mode, and at its z-depth among fish and jellies.

**Files:**
- Modify: `script.js` — constants only (`rayField` numbers and/or the ray line in `SCENE.creatures`). No structural changes permitted in this task.

- [ ] **Step 1: Success criterion** — in a full pinned-scene screenshot, rays are identifiable as rays at a glance among fish/jellies, their motion cadence is visibly slower/glidier than the fish, and no ray feature (tail, wing tip) disappears at the smallest spawned size.
- [ ] **Step 2: Screenshot the full scene** with all creatures pinned in a grid (harness), plus the 3 rays at natural sizes.
- [ ] **Step 3: Tune within bounds** — permitted knobs and ranges: stroke amplitude `0.35–0.50`, `ω` `2.0–2.8`, bow `0.10–0.22`, tail amp ceiling `0.08–0.14`, tail thickness per Task 2 Step 4, ray `opacity`/`width` ranges in `SCENE.creatures` (±20% of current). Anything outside these bounds means the geometry is wrong — go back to the responsible task instead of tuning harder.
- [ ] **Step 4: Verify + commit** — re-screenshot, criterion holds. Commit: `tune: ray stroke/tail constants at scene scale` + trailer. If Step 3 changed nothing, skip the commit.

---

## Task 5: Position fix — gate spawn on a real viewport

Root cause recap (found 2026-07-01): when the page loads hidden (preview tab; plausibly OBS CEF), `window.innerWidth/innerHeight` read `0` at script time, so `W`/`H` bootstrap to the `Math.max(…, 1)` floor of 1 px. Two observed failure modes: (a) a later real `resize` makes `resize()` rescale by `realWidth ÷ 1`, flinging creatures to x ≈ ±80,000–230,000 px; (b) no resize ever fires, and everything stays clustered in x ∈ [−pad, 1+pad] — off-screen-left of a real-width canvas. Both silent, both "empty tank with bubbles".

**Files:**
- Modify: `script.js` — bootstrap section only (the `let W/H` init and the closing `spawn(); if (!reduceMotion) start();` lines).

**Interfaces:**
- Consumes: existing `spawn()`, `start()`, `reduceMotion`.
- Produces: no new exports; observable behavior: nothing spawns until the viewport is real, then everything spawns exactly once.

**Fix spec:**

1. Define a degenerate viewport as `innerWidth < 10 || innerHeight < 10` (threshold constant, named).
2. At bootstrap: if the viewport is real, set `W`/`H` and run `spawn()` + conditional `start()` exactly as today.
3. If degenerate: do **not** spawn. Install a one-shot gate that re-checks on `resize`, on `visibilitychange`, and on a 250 ms interval (belt-and-braces for hosts that fire neither — the interval is the one guaranteed path). First re-check that sees a real viewport: set `W`/`H` from it, run `spawn()` + conditional `start()`, and tear down all three gate hooks. The interval never gives up (it's negligible cost, and a host that never reports dimensions can't display anything anyway).
4. `reduceMotion` semantics unchanged: spawn still happens (static scene), only `start()` is skipped.

- [ ] **Step 1: Reproduce first** — reload the hidden preview tab as-is (pre-fix) and record the broken state via eval: `innerWidth === 0` and all creature transform x-values clustered within ±300 px or flung past ±10,000 px. This is the failing "test".
- [ ] **Step 2: Implement the gate** per the spec.
- [ ] **Step 3: Verify the repro is fixed** — reload the hidden preview tab. Eval until the gate fires (poll the creature count), then assert: every creature's transform x is within `[−1.5·width, W + 1.5·width]` for the *real* `W`, and `H` likewise. Screenshot: creatures visible in the tank with no pinning harness — first time this works naturally.
- [ ] **Step 4: Verify the normal path regressed nothing** — load in a visible viewport (or the preview when focused): creatures spawn immediately (no 250 ms visual delay perceptible on the fast path — the gate must check synchronously first).
- [ ] **Step 5: Commit** — `fix: defer creature spawn until viewport reports real dimensions (hidden-tab/OBS bootstrap)` + trailer.

---

## Task 6: Position fix — guard rescale against a degenerate baseline

Defense in depth for the flinging arithmetic itself, for embed contexts we can't test (OBS sizing a source through a transient 0–1 px state, host reflows).

**Files:**
- Modify: `script.js` — `resize()` only.

**Fix spec:**

1. In `resize()`, after reading the new dimensions: if `previousW` or `previousH` is below the same degenerate threshold, **do not rescale** — run a full `spawn()` instead and return. `spawn()` is already idempotent and deterministic: it re-seeds `rng = mulberry32(SCENE.seed)`, clears the layer via `replaceChildren()`, and rebuilds — a full respawn is cheaper and safer than trying to repair positions multiplied by garbage.
2. Normal resizes (both dims real before and after) keep the existing proportional `rescale` path untouched.

- [ ] **Step 1: Success criterion** — no code path can ever multiply a creature position by a scale factor derived from a sub-10 px previous dimension; and ordinary window resizes still smoothly rescale (no respawn flicker).
- [ ] **Step 2: Implement the guard.**
- [ ] **Step 3: Verify normal resize** — `preview_resize` 1280×800 → 800×600 → 1280×800 with screenshots: creatures stay on-screen and keep proportional positions (rescale path, not respawn — same creatures, same relative layout, no layout re-shuffle).
- [ ] **Step 4: Verify the guard path** — simulate via eval by dispatching a `resize` event after temporarily forcing the tracked previous dims degenerate is not reachable without code hooks; instead verify by reading the code path (the guard is two comparisons) plus re-running the Task 5 Step 3 hidden-reload repro end-to-end. Accept code-inspection for this branch — it exists precisely for conditions we can't reproduce locally.
- [ ] **Step 5: Commit** — `fix: respawn instead of rescale when previous viewport was degenerate` + trailer.

---

## Task 7: OBS acceptance (user-assisted)

The whole point. Requires Alex's OBS — Claude prepares, Alex clicks.

- [ ] **Step 1: Serve** — start the `aurafish` launch config (http://localhost:4179).
- [ ] **Step 2: Alex adds a Browser Source** — URL `http://localhost:4179`, size = canvas resolution (e.g. 1920×1080), default FPS. Two checks: (a) creatures visible and animating immediately on add; (b) toggle the source/scene off and back on — creatures still present and moving (no re-fling, no frozen tank).
- [ ] **Step 3: Property matrix** — repeat check (b) with "Shutdown source when not visible" ON, since it reloads the page in a hidden-ish state — this is the exact condition Tasks 5–6 target.
- [ ] **Step 4: Performance sanity** — with the source live, OBS stats dock shows no encoder overload / dropped frames attributable to the source. (A full performance pass — the ~250 glyphs × 2 `fillText` passes × `shadowBlur` × 14 creatures concern — is a separate piece of work, out of scope here; only note the numbers.)
- [ ] **Step 5: Record results** — outcomes (including OBS version and any quirks) go into the session log and project memory.

---

## Self-Review

- **Coverage:** ray animation complaint → Tasks 2–4 (silhouette, motion, scene tuning — root causes: inverted flap envelope, symmetric linear-taper diamond, trapped/aliased tail, all addressed structurally, not by tuning). Positioning bug → Tasks 5–6 (both observed failure modes: post-rescale fling and never-rescaled cluster), OBS end-goal → Task 7. Uncommitted-work risk → Task 1.
- **No-code check:** no implementation code blocks anywhere; every step carries concrete constants, formulas, and observable pass/fail criteria instead. Two named commands only (git/status, launch config) — operational, not implementation.
- **Consistency:** `rayField(x, y, t)` signature/contract identical across Tasks 2–4; degenerate threshold shared by Tasks 5–6; harness defined once, referenced by Tasks 2–4; aspect change localized to `SCENE.creatures` and only if Task 3 Step 4 proves clipping.
