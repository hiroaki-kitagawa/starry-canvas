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
  const CHEER_BOOST_MS = 500;
  const CHEER_MAX_TOTAL_MS = 5_000;
  const CHEER_COOLDOWN_MS = 350;
  const LOG_MAX_ITEMS = 4;
  const WISH_BONUS_PARTICLES = 14;

  const GROWTH_MILESTONES = [
    { id: "start", min: 0, text: "やさしい光がゆらぎはじめた…" },
    { id: "yellow", min: 25, text: "あたたかい黄色に輝きだした！" },
    { id: "blue", min: 50, text: "深い青の光が広がっていく…" },
    { id: "red", min: 75, text: "熱い赤に色づいた！" },
    { id: "purple", min: 80, text: "神秘的な紫の光が満ちていく…" },
    { id: "complete", min: 100, text: "キャラクターが生まれた！" },
  ];

  const CHEER_LOG_LINES = [
    "きらっと応えてくれた！",
    "応援が届いたみたい…",
    "星が少し元気になった！",
    "ぴかり！ がんばってるよ",
    "あなたの声援、受け取った！",
  ];

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
    meteors: document.getElementById("meteors"),
    canvas: document.getElementById("particles"),
    selectionLabel: document.getElementById("selectionLabel"),
    progressTrack: document.getElementById("progressTrack"),
    progressFill: document.getElementById("progressFill"),
    progressPercent: document.getElementById("progressPercent"),
    remainingTime: document.getElementById("remainingTime"),
    growBtn: document.getElementById("growBtn"),
    celebrateBanner: document.getElementById("celebrateBanner"),
    growthLog: document.getElementById("growthLog"),
    wishCount: document.getElementById("wishCount"),
    wishCounter: document.getElementById("wishCounter"),
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
   *   loggedMilestones: Set<string>,
   * }>} */
  let stars = [];
  let selectedId = null;
  let growingId = null;
  let growthStartMs = 0;
  let celebrating = false;
  let rafId = null;
  let cheerBoostAppliedMs = 0;
  let lastCheerMs = 0;
  let cheerLogIndex = 0;
  let wishFragments = 0;
  let meteorTimerId = null;
  let meteorSeq = 0;
  const METEOR_CATCH_RADIUS = 48;

  /** @type {Array<{
   *   id: number,
   *   el: HTMLButtonElement,
   *   x: number,
   *   y: number,
   *   vx: number,
   *   vy: number,
   *   life: number,
   *   maxLife: number,
   *   caught: boolean,
   * }>} */
  let activeMeteors = [];

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

  function updateWishCounter() {
    els.wishCount.textContent = String(wishFragments);
  }

  function gainWishFragment(amount = 1) {
    wishFragments += amount;
    updateWishCounter();
    els.wishCounter.classList.remove("is-gain");
    void els.wishCounter.offsetWidth;
    els.wishCounter.classList.add("is-gain");
  }

  function clearMeteors() {
    activeMeteors = [];
    els.meteors.replaceChildren();
  }

  function scheduleNextMeteor() {
    if (meteorTimerId != null) {
      window.clearTimeout(meteorTimerId);
    }
    const delay = growingId
      ? 6000 + Math.random() * 5000
      : 11000 + Math.random() * 9000;
    meteorTimerId = window.setTimeout(() => {
      spawnMeteor();
      scheduleNextMeteor();
    }, delay);
  }

  function spawnMeteor() {
    if (celebrating) return;
    if (activeMeteors.filter((m) => !m.caught).length >= 2) return;

    const rect = els.sky.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;

    const fromLeft = Math.random() < 0.5;
    const startYRatio = 0.08 + Math.random() * 0.45;
    const endYRatio = Math.min(startYRatio + 0.18 + Math.random() * 0.28, 0.92);
    const startX = (fromLeft ? -0.05 : 1.05) * rect.width;
    const endX = (fromLeft ? 1.05 : -0.05) * rect.width;
    const startY = startYRatio * rect.height;
    const endY = endYRatio * rect.height;
    const duration = (1.8 + Math.random() * 1.0) * 1.2 * 1.3 * 1.5;
    const angle = (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI;

    const id = ++meteorSeq;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "meteor";
    btn.dataset.meteorId = String(id);
    btn.setAttribute("aria-label", "流れ星（タップで願いのかけらをゲット）");
    btn.style.setProperty("--angle", `${angle}deg`);
    btn.style.left = `${(startX / rect.width) * 100}%`;
    btn.style.top = `${(startY / rect.height) * 100}%`;

    els.meteors.appendChild(btn);

    activeMeteors.push({
      id,
      el: btn,
      x: startX,
      y: startY,
      vx: (endX - startX) / duration,
      vy: (endY - startY) / duration,
      life: 0,
      maxLife: duration,
      caught: false,
    });

    ensureLoop();
  }

  function updateMeteors(dt) {
    if (!activeMeteors.length) return;
    const rect = els.sky.getBoundingClientRect();

    activeMeteors = activeMeteors.filter((m) => {
      if (m.caught) {
        return m.el.isConnected;
      }

      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (m.life >= m.maxLife) {
        m.el.remove();
        return false;
      }

      const t = m.life / m.maxLife;
      let opacity = 1;
      if (t < 0.08) opacity = t / 0.08;
      else if (t > 0.88) opacity = (1 - t) / 0.12;

      m.el.style.left = `${(m.x / rect.width) * 100}%`;
      m.el.style.top = `${(m.y / rect.height) * 100}%`;
      m.el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
      return true;
    });
  }

  function findMeteorAt(clientX, clientY) {
    let best = null;
    let bestDist = METEOR_CATCH_RADIUS;

    for (const m of activeMeteors) {
      if (m.caught || !m.el.isConnected) continue;
      const r = m.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = m;
      }
    }
    return best;
  }

  function onSkyPointerDown(event) {
    if (celebrating) return;
    if (event.button != null && event.button !== 0) return;

    const meteor = findMeteorAt(event.clientX, event.clientY);
    if (!meteor) return;

    event.preventDefault();
    event.stopPropagation();
    catchMeteor(meteor);
  }

  function catchMeteor(meteor) {
    if (!meteor || meteor.caught || celebrating) return;

    meteor.caught = true;
    const rect = els.sky.getBoundingClientRect();
    meteor.el.style.left = `${(meteor.x / rect.width) * 100}%`;
    meteor.el.style.top = `${(meteor.y / rect.height) * 100}%`;
    meteor.el.classList.add("is-caught");

    gainWishFragment(1);
    appendLog("流れ星をつかまえた！ 願いのかけら＋1", "wish");
    spawnBurstAt(
      meteor.x,
      meteor.y,
      18,
      ["#ffe566", "#ffffff", "#7ec8ff", "#ffd6f5"],
      40,
      140,
      0.35,
      0.75
    );

    window.setTimeout(() => {
      if (meteor.el.isConnected) meteor.el.remove();
      activeMeteors = activeMeteors.filter((m) => m.id !== meteor.id);
    }, 280);
  }

  function appendLog(text, kind = "") {
    const li = document.createElement("li");
    if (kind) li.classList.add(`is-${kind}`);
    li.textContent = text;
    els.growthLog.appendChild(li);

    while (els.growthLog.children.length > LOG_MAX_ITEMS) {
      els.growthLog.removeChild(els.growthLog.firstElementChild);
    }
  }

  function clearLog() {
    els.growthLog.replaceChildren();
  }

  function maybeLogMilestones(star) {
    for (const milestone of GROWTH_MILESTONES) {
      if (star.progress < milestone.min) continue;
      if (star.loggedMilestones.has(milestone.id)) continue;
      // start は育成開始時に明示的に出す
      if (milestone.id === "start") continue;
      star.loggedMilestones.add(milestone.id);
      appendLog(milestone.text, "milestone");
    }
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
        loggedMilestones: new Set(),
      };
    });
  }

  function findStar(id) {
    return stars.find((s) => s.id === id) || null;
  }

  function onStarClick(id) {
    if (celebrating) return;

    const star = findStar(id);
    if (!star || star.status === "completed") return;

    // 育成中は対象星への応援タップのみ許可
    if (growingId) {
      if (id === growingId) cheerStar(star);
      return;
    }

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

  function cheerStar(star) {
    if (celebrating || star.id !== growingId) return;

    const now = performance.now();
    if (now - lastCheerMs < CHEER_COOLDOWN_MS) return;
    lastCheerMs = now;

    const remainingBudget = CHEER_MAX_TOTAL_MS - cheerBoostAppliedMs;
    if (remainingBudget > 0) {
      const boost = Math.min(CHEER_BOOST_MS, remainingBudget);
      cheerBoostAppliedMs += boost;
      growthStartMs -= boost;
    }

    spawnCheerParticles(star);

    star.el.classList.remove("is-cheered");
    // reflow to restart animation
    void star.el.offsetWidth;
    star.el.classList.add("is-cheered");
    window.setTimeout(() => star.el.classList.remove("is-cheered"), 360);

    const line = CHEER_LOG_LINES[cheerLogIndex % CHEER_LOG_LINES.length];
    cheerLogIndex += 1;
    appendLog(line, "cheer");
    ensureLoop();
  }

  function syncStarElement(star) {
    const { el } = star;
    const wasCheered = el.classList.contains("is-cheered");
    el.className = "star";
    el.classList.add(`phase-${star.colorPhase}`);
    if (wasCheered) el.classList.add("is-cheered");

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
    } else if (growingId && growingId === star.id) {
      el.disabled = false;
      el.setAttribute("aria-label", `星 ${star.index}（タップで応援）`);
    } else {
      el.disabled = Boolean(growingId && growingId !== star.id);
      el.setAttribute("aria-label", `星 ${star.index}`);
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
        ? `星 ${displayStar.index} を育成中… 応援＆流れ星をねらえ！`
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
    cheerBoostAppliedMs = 0;
    lastCheerMs = 0;
    growthStartMs = performance.now() - (star.progress / 100) * GROWTH_DURATION_MS;

    clearLog();
    star.loggedMilestones.add("start");
    appendLog(GROWTH_MILESTONES[0].text, "milestone");

    syncAllStars();
    updatePanel();
    scheduleNextMeteor();
    ensureLoop();
  }

  function applyProgress(star, progress) {
    star.progress = progress;
    const phase = getColorPhase(progress);
    if (phase !== star.colorPhase) {
      star.colorPhase = phase;
      syncStarElement(star);
    }
    maybeLogMilestones(star);
  }

  function completeStar(star) {
    growingId = null;
    selectedId = star.id;
    star.progress = 100;
    star.status = "completed";
    star.colorPhase = "purple";
    maybeLogMilestones(star);
    syncAllStars();
    updatePanel();
    celebrate(star);
  }

  function celebrate(star) {
    celebrating = true;
    els.growBtn.disabled = true;
    clearMeteors();

    const usedWishes = wishFragments;
    wishFragments = 0;
    updateWishCounter();

    spawnCelebrateParticles(star, usedWishes);
    els.celebrateBanner.hidden = false;

    if (usedWishes > 0) {
      appendLog(`願いのかけら ×${usedWishes} で祝福がきらめいた！`, "wish");
    }

    window.setTimeout(() => {
      els.celebrateBanner.hidden = true;
      celebrating = false;
      clearAllParticles();
      selectedId = null;
      for (const s of stars) {
        if (s.status === "selected") s.status = "idle";
      }
      syncAllStars();
      updatePanel();
      scheduleNextMeteor();

      if (stars.every((s) => s.status === "completed")) {
        els.selectionLabel.textContent = "すべての星が完成しました！";
        appendLog("夜空がいっぱいに輝いている…", "milestone");
      }
    }, CELEBRATE_MS);
  }

  function resizeCanvas() {
    const rect = els.sky.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.floor(rect.width * dpr);
    els.canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearParticleCanvas();
  }

  function clearParticleCanvas() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.restore();
  }

  function clearAllParticles() {
    particles = [];
    clearParticleCanvas();
  }

  function spawnParticlesAt(star, count, colors, speedMin, speedMax, lifeMin, lifeMax) {
    const rect = els.sky.getBoundingClientRect();
    const cx = star.x * rect.width;
    const cy = star.y * rect.height;
    spawnBurstAt(cx, cy, count, colors, speedMin, speedMax, lifeMin, lifeMax);
  }

  function spawnBurstAt(cx, cy, count, colors, speedMin, speedMax, lifeMin, lifeMax) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      particles.push({
        x: cx + (Math.random() - 0.5) * 16,
        y: cy + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0,
        maxLife: lifeMin + Math.random() * (lifeMax - lifeMin),
        size: 1.5 + Math.random() * 2.8,
        color: colors[i % colors.length],
      });
    }
    ensureLoop();
  }

  function spawnCelebrateParticles(star, wishBonus) {
    const bonus = Math.max(0, wishBonus) * WISH_BONUS_PARTICLES;
    spawnParticlesAt(
      star,
      70 + bonus,
      ["#ffe566", "#c084fc", "#ffffff", "#7ec8ff", "#ffd6f5", "#b8f0c8"],
      40,
      200 + Math.min(80, wishBonus * 8),
      0.9,
      2.1
    );
  }

  function spawnCheerParticles(star) {
    spawnParticlesAt(
      star,
      14,
      ["#ffffff", "#d6eaff", "#ffe566", "#b8e0ff"],
      30,
      110,
      0.4,
      0.9
    );
  }

  function updateParticles(dt) {
    const rect = els.sky.getBoundingClientRect();
    clearParticleCanvas();
    if (!particles.length) return;

    const bottomLimit = rect.height;
    const sidePad = 12;

    particles = particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      const t = p.life / p.maxLife;
      if (t >= 1) return false;
      // 枠外へ出た粒子は描画せず除去（下端への残留防止）
      if (p.y > bottomLimit || p.y < -20 || p.x < -sidePad || p.x > rect.width + sidePad) {
        return false;
      }

      const alpha = 1 - t;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
      return true;
    });

    ctx.globalAlpha = 1;
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
    updateMeteors(dt);

    if (growingId || particles.length || celebrating || activeMeteors.length) {
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
    updateWishCounter();
    appendLog("夜空の星を選んで、育成してみよう", "");
    appendLog("流れ星をタップして、願いのかけらを集めよう", "wish");

    els.growBtn.addEventListener("click", startGrowth);
    els.sky.addEventListener("pointerdown", onSkyPointerDown);
    window.addEventListener("resize", resizeCanvas);

    meteorTimerId = window.setTimeout(() => {
      spawnMeteor();
      scheduleNextMeteor();
    }, 2800 + Math.random() * 2200);
  }

  init();
})();
