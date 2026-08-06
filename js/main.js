import {
  STAR_COUNT,
  GROWTH_DURATION_MS,
  CELEBRATE_MS,
  CHEER_BOOST_MS,
  CHEER_MAX_TOTAL_MS,
  CHEER_COOLDOWN_MS,
  LOG_MAX_ITEMS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DRAG_THRESHOLD_PX,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  COMPLETION_POPUP,
  CHARACTER_MESSAGES,
  GROWTH_MILESTONES,
  CHEER_LOG_LINES,
  STAR_POSITIONS,
} from "./config.js";

import { pad2, formatRemaining, getColorPhase, createPlaceholderSvg } from "./utils.js";

import {
  initParticles,
  hasParticles,
  clearAllParticles,
  shiftParticles,
  resizeParticleCanvas,
  spawnCelebrateParticles,
  spawnCheerParticles,
  updateParticles,
} from "./particles.js";

// DOM参照
const els = {
  stars: document.getElementById("stars"),
  sky: document.getElementById("sky"),
  world: document.getElementById("world"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  zoomInput: document.getElementById("zoomInput"),
  zoomLevel: document.getElementById("zoomLevel"),
  canvas: document.getElementById("particles"),
  selectionLabel: document.getElementById("selectionLabel"),
  progressTrack: document.getElementById("progressTrack"),
  progressFill: document.getElementById("progressFill"),
  progressPercent: document.getElementById("progressPercent"),
  remainingTime: document.getElementById("remainingTime"),
  growBtn: document.getElementById("growBtn"),
  celebrateBanner: document.getElementById("celebrateBanner"),
  growthLog: document.getElementById("growthLog"),
  characterPopup: document.getElementById("characterPopup"),
  characterPopupClose: document.getElementById("characterPopupClose"),
  characterPopupImage: document.getElementById("characterPopupImage"),
  characterPopupTitle: document.getElementById("characterPopupTitle"),
  characterPopupMessage: document.getElementById("characterPopupMessage"),
  completionPopup: document.getElementById("completionPopup"),
  completionPopupClose: document.getElementById("completionPopupClose"),
  completionPopupTitle: document.getElementById("completionPopupTitle"),
  completionPopupMessage: document.getElementById("completionPopupMessage"),
};

let stars = [];
let selectedId = null;
let growingId = null;
let growthStartMs = 0;
let celebrating = false;
let rafId = null;
let cheerBoostAppliedMs = 0;
let lastCheerMs = 0;
let cheerLogIndex = 0;
let activePopupStarId = null;
let completionPopupShown = false;
let pendingCompletionPopup = false;
let zoom = 1;

let camX = 0;
let camY = 0;
let isPointerDown = false;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragOriginCamX = 0;
let dragOriginCamY = 0;
let suppressClick = false;
let activePointerId = null;

function getViewportSize() {
  const rect = els.sky.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function clampCamera(x, y) {
  const { width: vw, height: vh } = getViewportSize();
  const maxX = Math.max(0, WORLD_WIDTH - vw / zoom);
  const maxY = Math.max(0, WORLD_HEIGHT - vh / zoom);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

function setCamera(nextX, nextY) {
  const clamped = clampCamera(nextX, nextY);
  const dx = clamped.x - camX;
  const dy = clamped.y - camY;
  if (dx === 0 && dy === 0) {
    applyWorldTransform();
    return;
  }

  camX = clamped.x;
  camY = clamped.y;

  shiftParticles(dx, dy, zoom);
  applyWorldTransform();
}

function applyWorldTransform() {
  els.world.style.transform = `translate3d(${-camX * zoom}px, ${-camY * zoom}px, 0) scale(${zoom})`;
  if (activePopupStarId) {
    const star = findStar(activePopupStarId);
    if (star) updateCharacterPopupPosition(star);
  }
}

function centerCameraOnWorld() {
  const { width: vw, height: vh } = getViewportSize();
  setCamera((WORLD_WIDTH - vw / zoom) / 2, (WORLD_HEIGHT - vh / zoom) / 2);
}

function worldToScreen(wxRatio, wyRatio) {
  return {
    x: (wxRatio * WORLD_WIDTH - camX) * zoom,
    y: (wyRatio * WORLD_HEIGHT - camY) * zoom,
  };
}

function updateZoomUI() {
  els.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
  if (document.activeElement !== els.zoomInput) {
    els.zoomInput.value = `${Math.round(zoom * 100)}`;
  }
}

function applyZoomInputValue() {
  const raw = Number(els.zoomInput.value);
  if (!Number.isFinite(raw)) {
    updateZoomUI();
    return;
  }
  setZoom(raw / 100);
}

function setZoom(nextZoom, anchorX, anchorY) {
  const clampedZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  if (clampedZoom === zoom) return;

  const { width: vw, height: vh } = getViewportSize();
  const ax = Number.isFinite(anchorX) ? anchorX : vw / 2;
  const ay = Number.isFinite(anchorY) ? anchorY : vh / 2;
  const worldAnchorX = camX + ax / zoom;
  const worldAnchorY = camY + ay / zoom;

  zoom = clampedZoom;
  setCamera(worldAnchorX - ax / zoom, worldAnchorY - ay / zoom);
  clearAllParticles();
  updateZoomUI();
  updatePanel();
  if (activePopupStarId) {
    const star = findStar(activePopupStarId);
    if (star) updateCharacterPopupPosition(star);
  }
}

function onPanPointerDown(event) {
  if (celebrating) return;
  if (event.button != null && event.button !== 0) return;

  isPointerDown = true;
  isDragging = false;
  suppressClick = false;
  activePointerId = event.pointerId;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragOriginCamX = camX;
  dragOriginCamY = camY;
}

function onPanPointerMove(event) {
  if (!isPointerDown || event.pointerId !== activePointerId) return;

  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;

  if (!isDragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
    isDragging = true;
    suppressClick = true;
    els.sky.classList.add("is-dragging");
    try {
      els.sky.setPointerCapture(event.pointerId);
    } catch (_) {}
  }

  if (!isDragging) return;
  setCamera(dragOriginCamX - dx / zoom, dragOriginCamY - dy / zoom);
}

function onPanPointerUp(event) {
  if (event.pointerId !== activePointerId) return;

  const wasDragging = isDragging;
  isPointerDown = false;
  isDragging = false;
  activePointerId = null;
  els.sky.classList.remove("is-dragging");

  try {
    if (els.sky.hasPointerCapture?.(event.pointerId)) {
      els.sky.releasePointerCapture(event.pointerId);
    }
  } catch (_) {}

  if (!wasDragging && !celebrating) {
    const star = findStarAtPoint(event.clientX, event.clientY);
    if (star) {
      onStarClick(star.id);
      suppressClick = true;
    }
  }

  window.setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function findStarAtPoint(clientX, clientY) {
  let best = null;
  let bestDist = Infinity;
  const hitRadius = 28;

  for (const star of stars) {
    if (star.status === "completed") continue;
    if (growingId && star.id !== growingId) continue;

    const r = star.el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    const radius = Math.max(hitRadius, Math.max(r.width, r.height) / 2 + 6);
    if (dist <= radius && dist < bestDist) {
      best = star;
      bestDist = dist;
    }
  }
  return best;
}

function appendLog(text, kind = "") {
  const li = document.createElement("li");
  if (kind) li.classList.add(`is-${kind}`);
  li.textContent = text;
  els.growthLog.appendChild(li);

  while (els.growthLog.children.length > LOG_MAX_ITEMS) {
    els.growthLog.removeChild(els.growthLog.firstElementChild);
  }
  els.growthLog.scrollTop = els.growthLog.scrollHeight;
}

function clearLog() {
  els.growthLog.replaceChildren();
}

function maybeLogMilestones(star) {
  for (const milestone of GROWTH_MILESTONES) {
    if (star.progress < milestone.min) continue;
    if (star.loggedMilestones.has(milestone.id)) continue;
    if (milestone.id === "start") continue;
    star.loggedMilestones.add(milestone.id);
    appendLog(milestone.text, "milestone");
  }
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
  if (suppressClick || isDragging || celebrating) return;

  const star = findStar(id);
  if (!star) return;

  if (star.status === "completed") {
    openCharacterPopup(star);
    return;
  }

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

  const screen = worldToScreen(star.x, star.y);
  spawnCheerParticles(screen.x, screen.y);

  star.el.classList.remove("is-cheered");
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
    el.disabled = false;
    el.setAttribute("aria-label", `星 ${star.index}（クリックでメッセージ）`);
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
  const displayStar = (growingId && findStar(growingId)) || star || null;

  if (!displayStar) {
    els.selectionLabel.textContent = "ドラッグで探して、星を選んでください";
    setProgress(0);
    els.remainingTime.textContent = "残り —";
    els.growBtn.disabled = true;
    els.growBtn.textContent = "育成";
    return;
  }

  if (displayStar.status === "completed") {
    els.selectionLabel.textContent = `星 ${displayStar.index} — 完成（クリックでメッセージ）`;
    setProgress(100);
    els.remainingTime.textContent = "残り 00:00";
    els.growBtn.disabled = true;
    els.growBtn.textContent = "完成";
    return;
  }

  els.selectionLabel.textContent =
    displayStar.status === "growing"
      ? `星 ${displayStar.index} を育成中… タップで応援！`
      : `選択中: 星 ${displayStar.index}`;

  setProgress(displayStar.progress);

  const remainingMs = GROWTH_DURATION_MS * (1 - displayStar.progress / 100);
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

function openCharacterPopup(star) {
  if (activePopupStarId === star.id && !els.characterPopup.hidden) {
    updateCharacterPopupPosition(star);
    return;
  }

  const info = CHARACTER_MESSAGES[star.index - 1] || {
    title: `星 ${pad2(star.index)} のキャラクター`,
    message: "育ててくれてありがとう。おめでとう、きみのおかげでここまで来られたよ。",
  };

  activePopupStarId = star.id;
  els.characterPopupTitle.textContent = info.title;
  els.characterPopupMessage.textContent = info.message;
  els.characterPopupImage.alt = info.title;

  const img = star.el.querySelector("img");
  els.characterPopupImage.src = img ? img.src : star.characterImageUrl;

  els.characterPopup.hidden = false;
  els.characterPopup.setAttribute("aria-hidden", "false");
  updateCharacterPopupPosition(star);
}

function closeCharacterPopup() {
  activePopupStarId = null;
  els.characterPopup.hidden = true;
  els.characterPopup.setAttribute("aria-hidden", "true");
  if (pendingCompletionPopup && stars.every((s) => s.status === "completed")) {
    pendingCompletionPopup = false;
    openCompletionPopup();
  }
}

function updateCharacterPopupPosition(star) {
  if (!star || els.characterPopup.hidden) return;

  const screen = worldToScreen(star.x, star.y);
  const { width: vw, height: vh } = getViewportSize();
  const left = Math.min(vw - 24, Math.max(24, screen.x));
  const top = Math.min(vh - 32, Math.max(44, screen.y - 24));

  const card = els.characterPopup.querySelector(".character-popup__card");
  if (!card) return;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function openCompletionPopup() {
  if (completionPopupShown && !els.completionPopup.hidden) return;
  completionPopupShown = true;
  els.completionPopupTitle.textContent = COMPLETION_POPUP.title;
  els.completionPopupMessage.textContent = COMPLETION_POPUP.message;
  els.completionPopup.hidden = false;
  els.completionPopup.setAttribute("aria-hidden", "false");
}

function closeCompletionPopup() {
  els.completionPopup.hidden = true;
  els.completionPopup.setAttribute("aria-hidden", "true");
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

  const screen = worldToScreen(star.x, star.y);
  spawnCelebrateParticles(screen.x, screen.y);
  els.celebrateBanner.hidden = false;

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

    const allCompleted = stars.every((s) => s.status === "completed");
    if (allCompleted) {
      els.selectionLabel.textContent = "すべての星が完成しました！";
      appendLog("夜空がいっぱいに輝いている…", "milestone");
      focusOnCompletedStar(star);
      openCharacterPopup(star);
      pendingCompletionPopup = true;
    } else {
      focusOnCompletedStar(star);
      openCharacterPopup(star);
    }
  }, CELEBRATE_MS);
}

function focusOnCompletedStar(star) {
  const { width: vw, height: vh } = getViewportSize();
  zoom = Math.min(ZOOM_MAX, 1.5);
  setCamera(star.x * WORLD_WIDTH - vw / (2 * zoom), star.y * WORLD_HEIGHT - vh / (2 * zoom));
  clearAllParticles();
  updateZoomUI();
  updatePanel();
}

function handleResize() {
  resizeParticleCanvas();
  setCamera(camX, camY);
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

  if (growingId || hasParticles() || celebrating) {
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
  els.sky.style.setProperty("--world-width", `${WORLD_WIDTH}px`);
  els.sky.style.setProperty("--world-height", `${WORLD_HEIGHT}px`);
  els.world.style.width = `${WORLD_WIDTH}px`;
  els.world.style.height = `${WORLD_HEIGHT}px`;

  initParticles(els.canvas, els.sky);
  createStars();
  resizeParticleCanvas();
  centerCameraOnWorld();
  updateZoomUI();
  updatePanel();
  appendLog("背景をドラッグして、散らばる星を探そう", "");
  appendLog("星を選んで育成ボタンを押してみよう", "");

  els.growBtn.addEventListener("click", startGrowth);
  els.sky.addEventListener("pointerdown", onPanPointerDown);
  els.sky.addEventListener("pointermove", onPanPointerMove);
  els.sky.addEventListener("pointerup", onPanPointerUp);
  els.sky.addEventListener("pointercancel", onPanPointerUp);
  els.zoomIn.addEventListener("pointerdown", (event) => event.stopPropagation());
  els.zoomOut.addEventListener("pointerdown", (event) => event.stopPropagation());
  els.zoomInput.addEventListener("pointerdown", (event) => event.stopPropagation());
  els.zoomInput.parentElement?.addEventListener("pointerdown", (event) => event.stopPropagation());
  els.zoomIn.addEventListener("click", (event) => {
    event.stopPropagation();
    setZoom(zoom + ZOOM_STEP);
  });
  els.zoomOut.addEventListener("click", (event) => {
    event.stopPropagation();
    setZoom(zoom - ZOOM_STEP);
  });
  els.zoomInput.addEventListener("change", applyZoomInputValue);
  els.zoomInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyZoomInputValue();
      els.zoomInput.blur();
    }
  });
  els.characterPopupClose.addEventListener("click", closeCharacterPopup);
  els.characterPopup.addEventListener("click", (event) => {
    if (event.target?.dataset?.popupClose === "true") {
      closeCharacterPopup();
    }
  });
  els.completionPopupClose.addEventListener("click", closeCompletionPopup);
  els.completionPopup.addEventListener("click", (event) => {
    if (event.target?.dataset?.popupClose === "true") {
      closeCompletionPopup();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.characterPopup.hidden) {
      closeCharacterPopup();
    } else if (event.key === "Escape" && !els.completionPopup.hidden) {
      closeCompletionPopup();
    }
  });
  window.addEventListener("resize", handleResize);
}

init();