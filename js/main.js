(() => {
  "use strict";

  const STAR_COUNT = 10;
  const GROWTH_DURATION_MS = 60_000;
  const COLOR_THRESHOLDS = [
    { min: 80, phase: "purple" },
    { min: 75, phase: "red" },
    { min: 50, phase: "blue" },
    { min: 25, phase: "yellow" },
    { min: 0, phase: "initial" },
  ];
  const CELEBRATE_MS = 2200;

  /** 重複しにくいプリセット座標（相対 0〜1） */
  const STAR_POSITIONS = [
    { x: 0.12, y: 0.22 },
    { x: 0.28, y: 0.48 },
    { x: 0.18, y: 0.72 },
    { x: 0.42, y: 0.18 },
    { x: 0.48, y: 0.58 },
    { x: 0.38, y: 0.82 },
    { x: 0.62, y: 0.32 },
    { x: 0.72, y: 0.62 },
    { x: 0.78, y: 0.18 },
    { x: 0.88, y: 0.48 },
  ];

  const els = {
    stars: document.getElementById("stars"),
    sky: document.getElementById("sky"),
    canvas: document.getElementById("particles"),
    selectionLabel: document.getElementById("selectionLabel"),
    progressTrack: document.getElementById("progressTrack"),
    progressFill: document.getElementById("progressFill"),
    progressPercent: document.getElementById("progressPercent"),
    remainingTime: document.getElementById("remainingTime"),
    growBtn: document.getElementById("growBtn"),
    celebrateBanner: document.getElementById("celebrateBanner"),
  };

  const ctx = els.canvas.getContext("2d");

  /** @type {Array<{
   *   id: string,
   *   index: number,
   *   x: number,
   *   y: number,
   *   progress: number,
   *   status: "idle" | "selected" | "growing" | "completed",
   *   colorPhase: string,
   *   characterImageUrl: string,
   *   el: HTMLButtonElement,
   * }>} */
  let stars = [];
  let selectedId = null;
  let growingId = null;
  let growthStartMs = 0;
  let celebrating = false;
  let rafId = null;

  /** @type {Array<{
   *   x: number, y: number, vx: number, vy: number,
   *   life: number, maxLife: number, size: number, color: string
   * }>} */
  let particles = [];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatRemaining(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `残り ${pad2(m)}:${pad2(s)}`;
  }

  function getColorPhase(progress) {
    for (const rule of COLOR_THRESHOLDS) {
      if (progress >= rule.min) return rule.phase;
    }
    return "initial";
  }

  function createPlaceholderSvg(index) {
    const hues = [200, 45, 320, 160, 280, 20, 190, 340, 100, 240];
    const hue = hues[(index - 1) % hues.length];
    const body = `hsl(${hue} 55% 72%)`;
    const cheek = `hsl(${hue} 70% 82%)`;
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="キャラクター ${pad2(index)}">
  <defs>
    <radialGradient id="g" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="#fff6"/>
      <stop offset="100%" stop-color="${body}"/>
    </radialGradient>
  </defs>
  <circle cx="48" cy="50" r="28" fill="url(#g)" stroke="#fff8" stroke-width="2"/>
  <circle cx="38" cy="46" r="3.2" fill="#2a3344"/>
  <circle cx="58" cy="46" r="3.2" fill="#2a3344"/>
  <circle cx="34" cy="52" r="4" fill="${cheek}" opacity="0.7"/>
  <circle cx="62" cy="52" r="4" fill="${cheek}" opacity="0.7"/>
  <path d="M42 58 Q48 64 54 58" fill="none" stroke="#2a3344" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="48" cy="22" r="6" fill="${body}" stroke="#fff8" stroke-width="1.5"/>
</svg>`.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function createStars() {
    stars = STAR_POSITIONS.slice(0, STAR_COUNT).map((pos, i) => {
      const index = i + 1;
      const id = `star-${pad2(index)}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "star phase-initial";
      btn.dataset.id = id;
      btn.style.left = `${pos.x * 100}%`;
      btn.style.top = `${pos.y * 100}%`;
      btn.setAttribute("aria-label", `星 ${index}`);
      btn.addEventListener("click", () => onStarClick(id));
      els.stars.appendChild(btn);

      return {
        id,
        index,
        x: pos.x,
        y: pos.y,
        progress: 0,
        status: "idle",
        colorPhase: "initial",
        characterImageUrl: `assets/characters/star-${pad2(index)}.png`,
        el: btn,
      };
    });
  }

  function findStar(id) {
    return stars.find((s) => s.id === id) || null;
  }

  function onStarClick(id) {
    if (celebrating) return;
    if (growingId) return;

    const star = findStar(id);
    if (!star || star.status === "completed") return;

    if (selectedId && selectedId !== id) {
      const prev = findStar(selectedId);
      if (prev && prev.status === "selected") {
        prev.status = "idle";
        syncStarElement(prev);
      }
    }

    selectedId = id;
    star.status = "selected";
    syncStarElement(star);
    updatePanel();
  }

  function syncStarElement(star) {
    const { el } = star;
    el.className = "star";
    el.classList.add(`phase-${star.colorPhase}`);

    if (star.status === "selected") el.classList.add("is-selected");
    if (star.status === "growing") el.classList.add("is-growing");
    if (star.status === "completed") {
      el.classList.add("is-completed");
      el.disabled = true;
      if (!el.querySelector("img")) {
        const img = document.createElement("img");
        img.alt = `星 ${star.index} のキャラクター`;
        img.src = createPlaceholderSvg(star.index);
        const probe = new Image();
        probe.onload = () => {
          img.src = star.characterImageUrl;
        };
        probe.src = star.characterImageUrl;
        el.appendChild(img);
      }
    } else {
      el.disabled = Boolean(growingId && growingId !== star.id);
    }
  }

  function syncAllStars() {
    for (const star of stars) syncStarElement(star);
  }

  function updatePanel() {
    const star = selectedId ? findStar(selectedId) : null;
    const displayStar =
      (growingId && findStar(growingId)) ||
      star ||
      null;

    if (!displayStar) {
      els.selectionLabel.textContent = "星を選んでください";
      setProgress(0);
      els.remainingTime.textContent = "残り —";
      els.growBtn.disabled = true;
      els.growBtn.textContent = "育成";
      return;
    }

    if (displayStar.status === "completed") {
      els.selectionLabel.textContent = `星 ${displayStar.index} — 完成`;
      setProgress(100);
      els.remainingTime.textContent = "残り 00:00";
      els.growBtn.disabled = true;
      els.growBtn.textContent = "完成";
      return;
    }

    els.selectionLabel.textContent =
      displayStar.status === "growing"
        ? `星 ${displayStar.index} を育成中…`
        : `選択中: 星 ${displayStar.index}`;

    setProgress(displayStar.progress);

    const remainingMs =
      GROWTH_DURATION_MS * (1 - displayStar.progress / 100);
    els.remainingTime.textContent =
      displayStar.status === "growing" || displayStar.progress > 0
        ? formatRemaining(remainingMs)
        : formatRemaining(GROWTH_DURATION_MS);

    const canGrow =
      !celebrating &&
      !growingId &&
      displayStar.status === "selected" &&
      displayStar.progress < 100;

    els.growBtn.disabled = !canGrow;
    els.growBtn.textContent = growingId ? "育成中…" : "育成";
  }

  function setProgress(progress) {
    const pct = Math.max(0, Math.min(100, progress));
    const shown = Math.floor(pct);
    els.progressFill.style.width = `${pct}%`;
    els.progressPercent.textContent = `${shown}%`;
    els.progressTrack.setAttribute("aria-valuenow", String(shown));
  }

  function startGrowth() {
    if (celebrating || growingId || !selectedId) return;
    const star = findStar(selectedId);
    if (!star || star.status !== "selected") return;

    growingId = star.id;
    star.status = "growing";
    growthStartMs = performance.now() - (star.progress / 100) * GROWTH_DURATION_MS;
    syncAllStars();
    updatePanel();
    ensureLoop();
  }

  function applyProgress(star, progress) {
    star.progress = progress;
    const phase = getColorPhase(progress);
    if (phase !== star.colorPhase) {
      star.colorPhase = phase;
    }
    syncStarElement(star);
  }

  function completeStar(star) {
    growingId = null;
    selectedId = star.id;
    star.progress = 100;
    star.status = "completed";
    star.colorPhase = "purple";
    syncAllStars();
    updatePanel();
    celebrate(star);
  }

  function celebrate(star) {
    celebrating = true;
    els.growBtn.disabled = true;
    spawnParticles(star);
    els.celebrateBanner.hidden = false;

    window.setTimeout(() => {
      els.celebrateBanner.hidden = true;
      celebrating = false;
      selectedId = null;
      for (const s of stars) {
        if (s.status === "selected") s.status = "idle";
      }
      syncAllStars();
      updatePanel();

      if (stars.every((s) => s.status === "completed")) {
        els.selectionLabel.textContent = "すべての星が完成しました！";
      }
    }, CELEBRATE_MS);
  }

  function resizeCanvas() {
    const rect = els.sky.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.floor(rect.width * dpr);
    els.canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnParticles(star) {
    const rect = els.sky.getBoundingClientRect();
    const cx = star.x * rect.width;
    const cy = star.y * rect.height;
    const colors = ["#ffe566", "#c084fc", "#ffffff", "#7ec8ff", "#ffd6f5", "#b8f0c8"];

    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      particles.push({
        x: cx + (Math.random() - 0.5) * 20,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 0,
        maxLife: 0.9 + Math.random() * 1.2,
        size: 2 + Math.random() * 3.5,
        color: colors[i % colors.length],
      });
    }
    ensureLoop();
  }

  function updateParticles(dt) {
    if (!particles.length) return;
    const rect = els.sky.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    particles = particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      const t = p.life / p.maxLife;
      if (t >= 1) return false;

      const alpha = 1 - t;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    ctx.globalAlpha = 1;
    if (!particles.length) {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
  }

  let lastTs = 0;

  function tick(ts) {
    rafId = null;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (growingId) {
      const star = findStar(growingId);
      if (star) {
        const elapsed = ts - growthStartMs;
        const progress = Math.min(100, (elapsed / GROWTH_DURATION_MS) * 100);
        applyProgress(star, progress);
        updatePanel();
        if (progress >= 100) {
          completeStar(star);
        }
      }
    }

    updateParticles(dt);

    if (growingId || particles.length || celebrating) {
      rafId = requestAnimationFrame(tick);
    } else {
      lastTs = 0;
    }
  }

  function ensureLoop() {
    if (rafId == null) {
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    }
  }

  function init() {
    createStars();
    resizeCanvas();
    updatePanel();

    els.growBtn.addEventListener("click", startGrowth);
    window.addEventListener("resize", resizeCanvas);
  }

  init();
})();
