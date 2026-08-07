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
  ZOOM_MAX,
  ZOOM_STEP,
  COMPLETION_POPUP,
  CHARACTER_MESSAGES,
  GROWTH_MILESTONES,
  CHEER_LOG_LINES,
  STAR_POSITIONS,
} from "./config.js";
import { pad2, formatRemaining, getColorPhase } from "./utils.js";

  // ============================================================
  // DOM参照・ゲーム状態
  // ============================================================

  const els = {
    stageWrap: document.querySelector(".stage-wrap"),
    stars: document.getElementById("stars"),
    sky: document.getElementById("sky"),
    world: document.getElementById("world"),
    zoomIn: document.getElementById("zoomIn"),
    zoomOut: document.getElementById("zoomOut"),
    zoomInput: document.getElementById("zoomInput"),
    zoomLevel: document.getElementById("zoomLevel"),
    canvas: document.getElementById("particles"),
    telescope: document.getElementById("telescope"),
    telescopeStar: document.getElementById("telescopeStar"),
    telescopeImage: document.getElementById("telescopeImage"),
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
    tutorial: document.getElementById("tutorial"),
    tutorialBubble: document.getElementById("tutorialBubble"),
    tutorialTitle: document.getElementById("tutorialTitle"),
    tutorialMessage: document.getElementById("tutorialMessage"),
    tutorialStepLabel: document.getElementById("tutorialStepLabel"),
    tutorialNext: document.getElementById("tutorialNext"),
    tutorialSkip: document.getElementById("tutorialSkip"),
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
  /** 現在選択中の星ID（未選択時は null） */
  let selectedId = null;
  /** 育成中の星ID（同時育成は1つのみ） */
  let growingId = null;
  /**
   * 育成開始時刻（performance.now 基準）。
   * 応援で短縮するときはこの値を手前にずらす。
   */
  let growthStartMs = 0;
  /** 祝福演出中は操作をロックする */
  let celebrating = false;
  /** requestAnimationFrame のハンドル */
  let rafId = null;
  /** 現在の育成セッションで既に適用した応援短縮量 */
  let cheerBoostAppliedMs = 0;
  /** 直前の応援タップ時刻（クールダウン用） */
  let lastCheerMs = 0;
  /** 応援ログ文言のローテーション用インデックス */
  let cheerLogIndex = 0;
  /** 直前に開いたキャラクターポップアップ */
  let activePopupStarId = null;
  /** 全星完成ポップアップを1度だけ表示するためのフラグ */
  let completionPopupShown = false;
  /** 全星完成ポップアップを後で出すためのフラグ */
  let pendingCompletionPopup = false;
  /** ズーム倍率 */
  let zoom = 1;

  /** カメラ（ビューポート左上のワールド座標） */
  let camX = 0;
  let camY = 0;
  /** ドラッグ操作の状態 */
  let isPointerDown = false;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginCamX = 0;
  let dragOriginCamY = 0;
  /** ドラッグ後の click を無視するためのフラグ */
  let suppressClick = false;
  let activePointerId = null;
  /** タッチ端末の2本指ピンチ操作 */
  const touchPointers = new Map();
  let isPinching = false;
  let nativePinchActive = false;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;
  let pinchWorldAnchorX = 0;
  let pinchWorldAnchorY = 0;
  let nativeTouchTracking = false;
  let nativeTouchDragging = false;
  let nativeTouchAxis = null;
  let touchPanStartX = 0;
  let touchPanStartY = 0;
  let touchPanOriginCamX = 0;
  let touchPanOriginCamY = 0;
  let touchPageOriginScrollY = 0;
  /** 望遠鏡プレビュー中の星ID */
  let telescopeStarId = null;
  let tutorialStepIndex = -1;
  let tutorialActive = false;
  let tutorialStarId = null;
  let tutorialTargetEl = null;
  let tutorialPreviewApplied = false;
  let lastModalFocus = null;
  let viewportResizeFrame = null;

  const GROW_BTN_OFFSET_Y = 34;
  const GROW_BTN_EDGE_PAD = 12;

  const TUTORIAL_STEPS = [
    {
      title: "1. 黄色く輝く星を見つけよう",
      message: "夜空を見渡して、黄色く光る星を探してみよう。",
      placement: "top",
      target: "star",
    },
    {
      title: "2. 星を選択して育成ボタンを押そう",
      message: "星を選ぶと、すぐ下に育成ボタンが出てくるよ。押して育てよう。",
      placement: "top",
      target: "grow",
    },
    {
      title: "3. 左上で拡大・縮小しよう",
      message: "星が見つからないときは、左上のコントロールで見やすさを調整してみよう。",
      placement: "bottom",
      target: "zoom",
    },
    {
      title: "4. 星が完成するとキャラクターが出るよ",
      message: "育成が完了すると、星からキャラクターが出現するよ。",
      placement: "top",
      target: "completed",
    },
  ];

  /** @type {Array<{
   *   x: number, y: number, vx: number, vy: number,
   *   life: number, maxLife: number, size: number, color: string
   * }>} */
  let particles = [];

  // ============================================================
  // カメラ（背景パン）
  // ============================================================

  /** ビューポート（プレイ画面）のサイズを取得する */
  function getViewportSize() {
    const rect = els.sky.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /** カメラがワールド内に収まるようクランプする */
  function clampCamera(x, y) {
    const { width: vw, height: vh } = getViewportSize();
    const maxX = Math.max(0, WORLD_WIDTH - vw / zoom);
    const maxY = Math.max(0, WORLD_HEIGHT - vh / zoom);
    return {
      x: Math.min(maxX, Math.max(0, x)),
      y: Math.min(maxY, Math.max(0, y)),
    };
  }

  /** 利用可能な領域内で、表示枠をワールドと同じ縦横比の最大サイズにする */
  function layoutViewport() {
    const style = window.getComputedStyle(els.stageWrap);
    const availableWidth =
      els.stageWrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableHeight =
      els.stageWrap.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

    if (availableWidth <= 0 || availableHeight <= 0) return;

    const worldAspectRatio = WORLD_WIDTH / WORLD_HEIGHT;
    const availableAspectRatio = availableWidth / availableHeight;
    const width =
      availableAspectRatio > worldAspectRatio
        ? availableHeight * worldAspectRatio
        : availableWidth;
    const height = width / worldAspectRatio;

    els.sky.style.width = `${width}px`;
    els.sky.style.height = `${height}px`;
  }

  /** ワールドが表示領域より小さい軸では、余白を均等にして中央へ配置する */
  function getWorldOffset() {
    const { width: vw, height: vh } = getViewportSize();
    return {
      x: Math.max(0, (vw - WORLD_WIDTH * zoom) / 2),
      y: Math.max(0, (vh - WORLD_HEIGHT * zoom) / 2),
    };
  }

  /**
   * カメラ位置を反映する。
   * パン中にパーティクルがずれないよう、差分だけ粒子座標も動かす。
   */
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

    // 視点固定の粒子は、ワールドが動いた分だけ逆方向へずらす
    // 画面移動量はズーム倍率分だけ大きくなる
    for (const p of particles) {
      p.x -= dx * zoom;
      p.y -= dy * zoom;
    }

    applyWorldTransform();
  }

  /** world 要素へ translate を適用する（カメラ＝左上原点） */
  function applyWorldTransform() {
    const offset = getWorldOffset();
    els.world.style.transform = `translate3d(${offset.x - camX * zoom}px, ${offset.y - camY * zoom}px, 0) scale(${zoom})`;
    updateGrowButtonAnchor();
  }

  /** 初期表示：背景中央をプレイ画面の中心に合わせる */
  function centerCameraOnWorld() {
    const { width: vw, height: vh } = getViewportSize();
    setCamera((WORLD_WIDTH - vw / zoom) / 2, (WORLD_HEIGHT - vh / zoom) / 2);
  }

  /** 星のワールド相対座標 → 画面（ビューポート）座標 */
  function worldToScreen(wxRatio, wyRatio) {
    const offset = getWorldOffset();
    return {
      x: offset.x + (wxRatio * WORLD_WIDTH - camX) * zoom,
      y: offset.y + (wyRatio * WORLD_HEIGHT - camY) * zoom,
    };
  }

  /** 背景全体が画面内に収まる最小ズーム倍率を返す */
  function getFitZoom() {
    const { width: vw, height: vh } = getViewportSize();
    if (vw <= 0 || vh <= 0) return 1;
    return Math.min(1, vw / WORLD_WIDTH, vh / WORLD_HEIGHT);
  }

  /** ズーム表示を更新する */
  function updateZoomUI() {
    const minPct = (getFitZoom() * 100).toFixed(1);
    els.zoomInput.min = minPct;
    els.zoomInput.max = `${Math.round(ZOOM_MAX * 100)}`;
    els.zoomInput.step = "0.1";
    els.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
    if (document.activeElement !== els.zoomInput) {
      els.zoomInput.value = `${Math.round(zoom * 100)}`;
    }
  }

  /** ズーム入力欄の値を反映する */
  function applyZoomInputValue() {
    const raw = Number(els.zoomInput.value);
    if (!Number.isFinite(raw)) {
      updateZoomUI();
      return;
    }

    setZoom(raw / 100);
  }

  /** 指定座標を中心にズーム倍率を変更する */
  function setZoom(nextZoom, anchorX, anchorY) {
    const minZoom = getFitZoom();
    const clampedZoom = Math.min(ZOOM_MAX, Math.max(minZoom, nextZoom));
    if (clampedZoom === zoom) {
      updateZoomUI();
      return;
    }

    const { width: vw, height: vh } = getViewportSize();
    const ax = Number.isFinite(anchorX) ? anchorX : vw / 2;
    const ay = Number.isFinite(anchorY) ? anchorY : vh / 2;
    const previousOffset = getWorldOffset();
    const worldAnchorX = camX + (ax - previousOffset.x) / zoom;
    const worldAnchorY = camY + (ay - previousOffset.y) / zoom;

    zoom = clampedZoom;
    const nextOffset = getWorldOffset();
    setCamera(
      worldAnchorX - (ax - nextOffset.x) / zoom,
      worldAnchorY - (ay - nextOffset.y) / zoom,
    );
    clearAllParticles();
    updateZoomUI();
    updatePanel();
  }

  /** 背景ドラッグ開始 */
  function onPanPointerDown(event) {
    if (celebrating) return;
    if (event.button != null && event.button !== 0) return;

    closeTelescopePreview();

    isPointerDown = true;
    isDragging = false;
    suppressClick = false;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginCamX = camX;
    dragOriginCamY = camY;
    // pointer capture はドラッグ確定後に行う（即キャプチャすると星の click が消える）
  }

  /** 背景ドラッグ中：カメラを移動 */
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
      } catch (_) {
        /* ignore */
      }
    }

    if (!isDragging) return;

    // 指を右へ動かすと、背景は右へ追従（＝カメラは左へ）
    setCamera(dragOriginCamX - dx / zoom, dragOriginCamY - dy / zoom);
  }

  /** 背景ドラッグ終了 */
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
    } catch (_) {
      /* ignore */
    }

    // ドラッグでなければ、ポインタ位置の星を選択／応援する
    if (!wasDragging && !celebrating) {
      const star = findStarAtPoint(event.clientX, event.clientY);
      if (star) {
        onStarClick(star.id);
        // 後続の click イベントでの二重処理を防ぐ
        suppressClick = true;
      }
    }

    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  }

  /**
   * 画面座標から最も近いクリック可能な星を返す。
   * 星が小さくても押しやすいよう判定半径を広めにとる。
   */
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

  /** 夜空へのポインタ入力（背景パン開始） */
  function onSkyPointerDown(event) {
    if (tutorialActive) return;
    if (event.pointerType === "touch" && "ontouchstart" in window) return;
    if (event.pointerType === "touch") {
      if (!touchPointers.has(event.pointerId) && touchPointers.size >= 2) return;
      touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointers.size >= 2) {
        startPinchGesture();
        return;
      }
    }
    onPanPointerDown(event);
  }

  function getPinchPoints() {
    return [...touchPointers.values()].slice(0, 2);
  }

  /** 2本指になった時点の倍率・中心座標をピンチ操作の基準として保存する */
  function startPinchGesture() {
    const points = getPinchPoints();
    if (points.length < 2) return;

    startPinchFromPoints(points);
  }

  function startPinchFromPoints(points) {
    if (points.length < 2) return;

    const [a, b] = points;
    startPinchFromCenter((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinchStartDistance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  }

  function startPinchFromCenter(clientX, clientY) {
    const rect = els.sky.getBoundingClientRect();
    const midX = clientX - rect.left;
    const midY = clientY - rect.top;
    const offset = getWorldOffset();

    isPinching = true;
    isPointerDown = false;
    isDragging = false;
    activePointerId = null;
    suppressClick = true;
    pinchStartZoom = zoom;
    pinchWorldAnchorX = camX + (midX - offset.x) / zoom;
    pinchWorldAnchorY = camY + (midY - offset.y) / zoom;
    els.sky.classList.remove("is-dragging");
    clearAllParticles();

    for (const pointerId of touchPointers.keys()) {
      try {
        els.sky.setPointerCapture(pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** ピンチ中は2本指の中点に同じワールド座標が留まるよう倍率とカメラを更新する */
  function updatePinchGesture(event) {
    touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!isPinching || touchPointers.size < 2) return false;

    event.preventDefault();
    updatePinchFromPoints(getPinchPoints());
    return true;
  }

  function updatePinchFromPoints(points) {
    if (points.length < 2) return;

    const [a, b] = points;
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    updatePinchFromCenter(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      pinchStartZoom * distance / pinchStartDistance,
    );
  }

  function updatePinchFromCenter(clientX, clientY, requestedZoom) {
    const minZoom = getFitZoom();
    const nextZoom = Math.min(ZOOM_MAX, Math.max(minZoom, requestedZoom));
    const rect = els.sky.getBoundingClientRect();
    const midX = clientX - rect.left;
    const midY = clientY - rect.top;

    zoom = nextZoom;
    const offset = getWorldOffset();
    setCamera(
      pinchWorldAnchorX - (midX - offset.x) / zoom,
      pinchWorldAnchorY - (midY - offset.y) / zoom,
    );
    updateZoomUI();
    updatePanel();
  }

  function getTouchEventPoints(event) {
    return Array.from(event.touches).slice(0, 2).map((touch) => ({
      x: touch.clientX,
      y: touch.clientY,
    }));
  }

  function isPointInsideSky(clientX, clientY) {
    const rect = els.sky.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  /** iOS・Androidでは1本指移動と2本指ピンチをTouch Eventsで一元管理する */
  function onSkyTouchStart(event) {
    if (tutorialActive || event.touches.length === 0) return;
    const points = getTouchEventPoints(event);
    const target = event.target instanceof Element ? event.target : null;
    const isControl = target?.closest(".zoom-controls, .grow-btn");

    if (!nativeTouchTracking) {
      if (isControl || !points[0] || !isPointInsideSky(points[0].x, points[0].y)) return;
      nativeTouchTracking = true;
      nativeTouchDragging = false;
      nativeTouchAxis = null;
      suppressClick = false;
      touchPanStartX = points[0].x;
      touchPanStartY = points[0].y;
      touchPanOriginCamX = camX;
      touchPanOriginCamY = camY;
      touchPageOriginScrollY = window.scrollY;
    }

    if (event.touches.length >= 2) {
      event.preventDefault();
      nativePinchActive = true;
      nativeTouchDragging = false;
      nativeTouchAxis = "pinch";
      startPinchFromPoints(points);
    }
  }

  function onSkyTouchMove(event) {
    if (!nativeTouchTracking || event.touches.length === 0) return;
    const points = getTouchEventPoints(event);

    if (event.touches.length >= 2) {
      event.preventDefault();
      if (!nativePinchActive) {
        nativePinchActive = true;
        startPinchFromPoints(points);
      } else {
        updatePinchFromPoints(points);
      }
      suppressClick = true;
      return;
    }

    if (nativePinchActive) return;
    const dx = points[0].x - touchPanStartX;
    const dy = points[0].y - touchPanStartY;
    if (!nativeTouchDragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

    if (!nativeTouchAxis) {
      const landscapeTouchLayout = window.matchMedia(
        "(orientation: landscape) and (max-height: 600px)",
      ).matches;
      nativeTouchAxis = landscapeTouchLayout && Math.abs(dy) > Math.abs(dx) ? "page" : "sky";
    }

    if (nativeTouchAxis === "page") {
      event.preventDefault();
      suppressClick = true;
      window.scrollTo({ top: touchPageOriginScrollY - dy, behavior: "auto" });
      return;
    }

    event.preventDefault();
    nativeTouchDragging = true;
    suppressClick = true;
    els.sky.classList.add("is-dragging");
    setCamera(touchPanOriginCamX - dx / zoom, touchPanOriginCamY - dy / zoom);
  }

  function onSkyTouchEnd(event) {
    if (!nativeTouchTracking) return;

    if (event.touches.length >= 2) return;
    if (event.touches.length === 1 && nativePinchActive) {
      const touch = event.touches[0];
      nativePinchActive = false;
      isPinching = false;
      nativeTouchAxis = "sky";
      touchPanStartX = touch.clientX;
      touchPanStartY = touch.clientY;
      touchPanOriginCamX = camX;
      touchPanOriginCamY = camY;
      suppressClick = true;
      return;
    }

    if (event.touches.length === 0) {
      nativeTouchTracking = false;
      nativeTouchDragging = false;
      nativeTouchAxis = null;
      nativePinchActive = false;
      isPinching = false;
      touchPointers.clear();
      isPointerDown = false;
      isDragging = false;
      activePointerId = null;
      els.sky.classList.remove("is-dragging");
    }
  }

  function onSkyPointerMove(event) {
    if (event.pointerType === "touch" && "ontouchstart" in window) return;
    if (nativePinchActive && event.pointerType === "touch") return;
    if (event.pointerType === "touch" && touchPointers.has(event.pointerId)) {
      if (updatePinchGesture(event)) return;
    }
    onPanPointerMove(event);
  }

  function onSkyPointerUp(event) {
    if (event.pointerType === "touch" && "ontouchstart" in window) return;
    if (nativePinchActive && event.pointerType === "touch") return;
    if (event.pointerType === "touch") {
      const wasPinching = isPinching;
      touchPointers.delete(event.pointerId);
      if (wasPinching) {
        isPinching = touchPointers.size >= 2;
        suppressClick = true;
        try {
          if (els.sky.hasPointerCapture?.(event.pointerId)) {
            els.sky.releasePointerCapture(event.pointerId);
          }
        } catch (_) {
          /* ignore */
        }
        return;
      }
    }
    onPanPointerUp(event);
  }

  /** 選択中の星の真下へ育成ボタンを配置する */
  function updateGrowButtonAnchor() {
    const targetId = growingId || selectedId;
    const star = targetId ? findStar(targetId) : null;
    const shouldShow = Boolean(star && star.status !== "completed" && !celebrating);

    if (!shouldShow) {
      els.growBtn.hidden = true;
      return;
    }

    els.growBtn.hidden = false;
    const screen = worldToScreen(star.x, star.y);
    const { width: vw, height: vh } = getViewportSize();
    const btnRect = els.growBtn.getBoundingClientRect();
    const btnWidth = Math.max(112, btnRect.width || 0);
    const btnHeight = Math.max(42, btnRect.height || 0);
    const half = btnWidth / 2;

    const left = Math.min(vw - half - GROW_BTN_EDGE_PAD, Math.max(half + GROW_BTN_EDGE_PAD, screen.x));
    const top = Math.min(vh - btnHeight - GROW_BTN_EDGE_PAD, Math.max(GROW_BTN_EDGE_PAD, screen.y + GROW_BTN_OFFSET_Y));
    els.growBtn.style.left = `${left}px`;
    els.growBtn.style.top = `${top}px`;

    if (tutorialActive) {
      layoutTutorialBubble();
    }
  }

  function clearTutorialTarget() {
    if (tutorialTargetEl) {
      tutorialTargetEl.classList.remove("tutorial-target");
      tutorialTargetEl = null;
    }
  }

  function getTutorialStar() {
    if (!tutorialStarId) return null;
    return findStar(tutorialStarId);
  }

  function applyTutorialCompletedPreview(enabled) {
    const star = getTutorialStar();
    if (!star) return;

    if (!enabled) {
      if (!tutorialPreviewApplied) return;
      tutorialPreviewApplied = false;
      star.progress = 0;
      star.status = "selected";
      star.colorPhase = "initial";
      syncStarElement(star);
      return;
    }

    tutorialPreviewApplied = true;
    star.progress = 100;
    star.status = "completed";
    star.colorPhase = "purple";
    syncStarElement(star);
  }

  function getTutorialTargetElement(step) {
    const star = getTutorialStar();
    if (!step) return null;
    if (step.target === "zoom") return els.sky.querySelector(".zoom-controls");
    if (!star) return null;
    if (step.target === "grow") return els.growBtn;
    return star.el;
  }

  function getTutorialTargetRect(step) {
    const target = getTutorialTargetElement(step);
    if (!target) return null;
    return target.getBoundingClientRect();
  }

  function layoutTutorialBubble() {
    if (!tutorialActive || tutorialStepIndex < 0) return;
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    const rect = getTutorialTargetRect(step);
    if (!rect) return;

    const bubble = els.tutorialBubble;
    const compactTouchLayout = window.matchMedia("(max-width: 599px), (pointer: coarse)").matches;
    bubble.classList.remove("is-top", "is-bottom");
    bubble.classList.add(
      compactTouchLayout ? "is-bottom" : step.placement === "bottom" ? "is-bottom" : "is-top",
    );

    const bubbleWidth = Math.min(window.innerWidth * 0.92, 360);
    const bubbleHeight = bubble.offsetHeight || 180;
    const centerX = rect.left + rect.width / 2;
    const desiredY =
      compactTouchLayout
        ? window.innerHeight / 2
        : step.placement === "bottom"
        ? rect.bottom + 16 + bubbleHeight / 2
        : rect.top - 16 - bubbleHeight / 2;

    const x = Math.min(window.innerWidth - bubbleWidth / 2 - 12, Math.max(bubbleWidth / 2 + 12, centerX));
    const y = Math.min(window.innerHeight - bubbleHeight / 2 - 12, Math.max(bubbleHeight / 2 + 12, desiredY));

    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  function showTutorialStep(index) {
    tutorialStepIndex = index;
    const step = TUTORIAL_STEPS[index];

    clearTutorialTarget();
    applyTutorialCompletedPreview(false);

    const star = getTutorialStar();
    if (star && star.status !== "completed") {
      selectedId = star.id;
      star.status = "selected";
      syncStarElement(star);
      updatePanel();
    }

    if (step.target === "completed") {
      applyTutorialCompletedPreview(true);
      updatePanel();
    }

    const target = getTutorialTargetElement(step);
    if (target) {
      tutorialTargetEl = target;
      tutorialTargetEl.classList.add("tutorial-target");
    }

    const compactTouchLayout = window.matchMedia("(max-width: 599px), (pointer: coarse)").matches;
    els.tutorialTitle.textContent =
      step.target === "zoom" && compactTouchLayout
        ? "3. ピンチまたは＋・−で拡大・縮小しよう"
        : step.title;
    els.tutorialMessage.textContent =
      step.target === "zoom" && compactTouchLayout
        ? "画面を2本指で広げたり縮めたりできるよ。左上の＋・−ボタンでも調整できます。"
        : step.message;
    els.tutorialStepLabel.textContent = `${index + 1} / ${TUTORIAL_STEPS.length}`;
    els.tutorialNext.textContent = index === TUTORIAL_STEPS.length - 1 ? "はじめる" : "次へ";

    layoutTutorialBubble();
  }

  function closeTutorial() {
    tutorialActive = false;
    clearTutorialTarget();
    applyTutorialCompletedPreview(false);
    els.tutorial.hidden = true;
    els.tutorial.setAttribute("aria-hidden", "true");
    tutorialStepIndex = -1;
    selectedId = null;
    syncAllStars();
    updatePanel();
  }

  function startTutorial() {
    const first = stars.find((s) => s.status !== "completed") || stars[0] || null;
    if (!first) return;

    tutorialActive = true;
    tutorialStarId = first.id;
    selectedId = first.id;
    first.status = "selected";
    syncAllStars();
    updatePanel();

    els.tutorial.hidden = false;
    els.tutorial.setAttribute("aria-hidden", "false");
    showTutorialStep(0);
  }

  /** マウス利用時のみ望遠鏡プレビューを表示する */
  function canUseTelescope(event) {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
    if (!event || event.pointerType === "mouse") return true;
    return false;
  }

  /** 望遠鏡の位置をカーソル付近へ配置（端でははみ出し防止） */
  function updateTelescopePosition(clientX, clientY) {
    const rect = els.sky.getBoundingClientRect();
    const scope = els.telescope.firstElementChild;
    if (!scope) return;
    const radius = (scope.getBoundingClientRect().width || 344) / 2;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const offsetX = radius + 40;
    const offsetY = -radius;
    const x = Math.min(rect.width - radius, Math.max(radius, localX + offsetX));
    const y = Math.min(rect.height - radius, Math.max(radius, localY + offsetY));
    scope.style.left = `${x}px`;
    scope.style.top = `${y}px`;
  }

  /** 望遠鏡内の表示を星状態に合わせる */
  function renderTelescopeContent(star) {
    if (!star) return;

    const completed = star.status === "completed";
    els.telescope.classList.toggle("is-completed", completed);

    if (!completed) {
      els.telescopeStar.className = `telescope__star phase-${star.colorPhase}`;
      els.telescopeImage.removeAttribute("src");
      els.telescopeImage.alt = "";
      return;
    }

    els.telescopeImage.src = star.characterImageUrl;
    els.telescopeImage.alt = `星 ${star.index} の拡大表示`;
  }

  /** 星ホバー開始時に望遠鏡プレビューを開く */
  function openTelescopePreview(star, event) {
    if (!star || !canUseTelescope(event)) return;
    telescopeStarId = star.id;
    renderTelescopeContent(star);
    updateTelescopePosition(event.clientX, event.clientY);
    els.telescope.hidden = false;
    els.telescope.setAttribute("aria-hidden", "false");
  }

  /** 望遠鏡プレビューを閉じる */
  function closeTelescopePreview() {
    telescopeStarId = null;
    els.telescope.hidden = true;
    els.telescope.classList.remove("is-completed");
    els.telescope.setAttribute("aria-hidden", "true");
  }

  function onStarPointerEnter(id, event) {
    if (suppressClick) return;
    const star = findStar(id);
    if (!star) return;
    if (celebrating && star.status !== "completed") return;
    openTelescopePreview(star, event);
  }

  function onStarPointerMove(id, event) {
    if (telescopeStarId !== id) return;
    if (!canUseTelescope(event)) return;
    updateTelescopePosition(event.clientX, event.clientY);
  }

  function onStarPointerLeave(id) {
    if (telescopeStarId !== id) return;
    closeTelescopePreview();
  }

  // ============================================================
  // 成長ログ
  // ============================================================

  /** 成長ログへ1行追加し、古い行を上限まで削る */
  function appendLog(text, kind = "") {
    const li = document.createElement("li");
    if (kind) li.classList.add(`is-${kind}`);
    li.textContent = text;
    els.growthLog.appendChild(li);

    while (els.growthLog.children.length > LOG_MAX_ITEMS) {
      els.growthLog.removeChild(els.growthLog.firstElementChild);
    }

    // 最新行が見えるよう末尾へスクロール
    els.growthLog.scrollTop = els.growthLog.scrollHeight;
  }

  function clearLog() {
    els.growthLog.replaceChildren();
  }

  /** 進捗がマイルストーンを超えたら、未出力のログだけ追加する */
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

  // ============================================================
  // 星の生成・選択・表示同期
  // ============================================================

  /**
   * キャラ画像未配置時の仮マスコット（SVG data URL）を作る。
   * 本番画像が読み込めたら差し替える。
   */
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

  /** プリセット座標で星ボタンとデータモデルを生成する */
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
      btn.addEventListener("pointerenter", (event) => onStarPointerEnter(id, event));
      btn.addEventListener("pointermove", (event) => onStarPointerMove(id, event));
      btn.addEventListener("pointerleave", () => onStarPointerLeave(id));
      btn.addEventListener("pointercancel", () => onStarPointerLeave(id));
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

  /**
   * 星クリック時の分岐。
   * - 通常時: 選択
   * - 育成中: 育成対象なら応援タップ
   * - 完成済み / 祝福中: 無視
   */
  function onStarClick(id) {
    if (tutorialActive) return;
    // 背景ドラッグ直後の誤クリックを無視
    if (suppressClick || isDragging) return;
    if (celebrating) return;

    const star = findStar(id);
    if (!star) return;

    if (star.status === "completed") {
      openCharacterPopup(star);
      return;
    }

    // 育成中は対象星への応援タップのみ許可
    if (growingId) {
      if (id === growingId) cheerStar(star);
      return;
    }

    // 別の星が選択中なら解除してから付け替える
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

  /**
   * 育成中の星への応援タップ。
   * パーティクル演出に加え、上限付きで育成時間をわずかに短縮する。
   */
  function cheerStar(star) {
    if (celebrating || star.id !== growingId) return;

    const now = performance.now();
    if (now - lastCheerMs < CHEER_COOLDOWN_MS) return;
    lastCheerMs = now;

    // growthStartMs を過去へずらすと、経過時間が伸びて進捗が前倒しになる
    const remainingBudget = CHEER_MAX_TOTAL_MS - cheerBoostAppliedMs;
    if (remainingBudget > 0) {
      const boost = Math.min(CHEER_BOOST_MS, remainingBudget);
      cheerBoostAppliedMs += boost;
      growthStartMs -= boost;
    }

    spawnCheerParticles(star);

    // 同じクラス再付与で脈打ちアニメを再スタート
    star.el.classList.remove("is-cheered");
    void star.el.offsetWidth;
    star.el.classList.add("is-cheered");
    window.setTimeout(() => star.el.classList.remove("is-cheered"), 360);

    const line = CHEER_LOG_LINES[cheerLogIndex % CHEER_LOG_LINES.length];
    cheerLogIndex += 1;
    appendLog(line, "cheer");
    ensureLoop();
  }

  /**
   * 星データに合わせて DOM の見た目・活性状態を同期する。
   * 完成時は画像を載せ、未配置ならプレースホルダを使う。
   */
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
        // まずプレースホルダを出し、本番画像があれば差し替え
        img.src = createPlaceholderSvg(star.index);
        const probe = new Image();
        probe.onload = () => {
          img.src = star.characterImageUrl;
          if (telescopeStarId === star.id && !els.telescope.hidden) {
            renderTelescopeContent(star);
          }
        };
        probe.src = star.characterImageUrl;
        el.appendChild(img);
      }
    } else if (growingId && growingId === star.id) {
      const existingImg = el.querySelector("img");
      if (existingImg) existingImg.remove();
      // 育成対象だけはクリック可（応援用）
      el.disabled = false;
      el.setAttribute("aria-label", `星 ${star.index}（タップで応援）`);
    } else {
      const existingImg = el.querySelector("img");
      if (existingImg) existingImg.remove();
      // 育成中は他星を操作不可にする
      el.disabled = Boolean(growingId && growingId !== star.id);
      el.setAttribute("aria-label", `星 ${star.index}`);
    }

    if (telescopeStarId === star.id && !els.telescope.hidden) {
      renderTelescopeContent(star);
    }
  }

  function syncAllStars() {
    for (const star of stars) syncStarElement(star);
  }

  // ============================================================
  // 下部パネル（進捗・育成ボタン）
  // ============================================================

  /** 選択中／育成中の星に合わせてパネル文言と進捗表示を更新する */
  function updatePanel() {
    const star = selectedId ? findStar(selectedId) : null;
    const displayStar =
      (growingId && findStar(growingId)) ||
      star ||
      null;

    if (!displayStar) {
      els.selectionLabel.textContent = "ドラッグで探して、星を選んでください";
      setProgress(0);
      els.remainingTime.textContent = "残り —";
      els.growBtn.disabled = true;
      els.growBtn.textContent = "育成";
      updateGrowButtonAnchor();
      return;
    }

    if (displayStar.status === "completed") {
      els.selectionLabel.textContent = `星 ${displayStar.index} — 完成（クリックでメッセージ）`;
      setProgress(100);
      els.remainingTime.textContent = "残り 00:00";
      els.growBtn.disabled = true;
      els.growBtn.textContent = "完成";
      updateGrowButtonAnchor();
      return;
    }

    els.selectionLabel.textContent =
      displayStar.status === "growing"
        ? `星 ${displayStar.index} を育成中… タップで応援！`
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
    updateGrowButtonAnchor();
  }

  /** プログレスバーと％表示を更新する */
  function setProgress(progress) {
    const pct = Math.max(0, Math.min(100, progress));
    const shown = Math.floor(pct);
    els.progressFill.style.width = `${pct}%`;
    els.progressPercent.textContent = `${shown}%`;
    els.progressTrack.setAttribute("aria-valuenow", String(shown));
  }

  // ============================================================
  // 育成・完成・祝福
  // ============================================================

  /** 完成済みキャラクリック時のポップアップを開く */
  function openCharacterPopup(star) {
    if (activePopupStarId === star.id && !els.characterPopup.hidden) {
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
    if (img) {
      els.characterPopupImage.src = img.src;
    } else {
      els.characterPopupImage.src = star.characterImageUrl;
    }

    els.characterPopup.hidden = false;
    els.characterPopup.setAttribute("aria-hidden", "false");
    lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("has-modal");
    window.requestAnimationFrame(() => els.characterPopupClose.focus());
  }

  /** ポップアップを閉じる */
  function closeCharacterPopup() {
    activePopupStarId = null;
    els.characterPopup.hidden = true;
    els.characterPopup.setAttribute("aria-hidden", "true");
    if (pendingCompletionPopup && stars.every((s) => s.status === "completed")) {
      pendingCompletionPopup = false;
      openCompletionPopup();
    } else {
      document.body.classList.remove("has-modal");
      lastModalFocus?.focus();
      lastModalFocus = null;
    }
  }

  /** 全星完成時のお祝いポップアップを開く */
  function openCompletionPopup() {
    if (completionPopupShown && !els.completionPopup.hidden) return;
    completionPopupShown = true;
    els.completionPopupTitle.textContent = COMPLETION_POPUP.title;
    els.completionPopupMessage.textContent = COMPLETION_POPUP.message;
    els.completionPopup.hidden = false;
    els.completionPopup.setAttribute("aria-hidden", "false");
    if (!lastModalFocus) {
      lastModalFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    document.body.classList.add("has-modal");
    window.requestAnimationFrame(() => els.completionPopupClose.focus());
  }

  /** 全星完成時のお祝いポップアップを閉じる */
  function closeCompletionPopup() {
    els.completionPopup.hidden = true;
    els.completionPopup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("has-modal");
    lastModalFocus?.focus();
    lastModalFocus = null;
  }

  /** 「育成」ボタン。選択中の星の育成を開始する */
  function startGrowth() {
    if (tutorialActive) return;
    if (celebrating || growingId || !selectedId) return;
    const star = findStar(selectedId);
    if (!star || star.status !== "selected") return;

    growingId = star.id;
    star.status = "growing";
    cheerBoostAppliedMs = 0;
    lastCheerMs = 0;
    // 進捗途中からの再開にも対応できるよう、開始時刻を進捗分ずらす
    growthStartMs = performance.now() - (star.progress / 100) * GROWTH_DURATION_MS;

    clearLog();
    star.loggedMilestones.add("start");
    appendLog(GROWTH_MILESTONES[0].text, "milestone");

    syncAllStars();
    updatePanel();
    ensureLoop();
  }

  /**
   * 育成中の進捗を反映する。
   * 色フェーズが変わったときだけ DOM を同期し、毎フレームの再描画コストを抑える。
   */
  function applyProgress(star, progress) {
    star.progress = progress;
    const phase = getColorPhase(progress);
    if (phase !== star.colorPhase) {
      star.colorPhase = phase;
      syncStarElement(star);
    }
    maybeLogMilestones(star);
  }

  /** 進捗100%到達時。育成を終え、祝福演出へ移行する */
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

  /**
   * 完成祝福。
   * パーティクル演出を再生し、演出後に操作を再開する。
   */
  function celebrate(star) {
    celebrating = true;
    els.growBtn.disabled = true;

    spawnCelebrateParticles(star);
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

  /** 完成した星に視点を寄せて、少しズームする */
  function focusOnCompletedStar(star) {
    const { width: vw, height: vh } = getViewportSize();
    zoom = Math.min(ZOOM_MAX, 1.5);
    setCamera(star.x * WORLD_WIDTH - vw / (2 * zoom), star.y * WORLD_HEIGHT - vh / (2 * zoom));
    clearAllParticles();
    updateZoomUI();
    updatePanel();
  }

  // ============================================================
  // パーティクル（Canvas）
  // ============================================================

  /**
   * パーティクル用キャンバスを夜空サイズに合わせる。
   * 高DPIディスプレイでは devicePixelRatio で解像度を上げる。
   */
  function resizeCanvas() {
    const rect = els.sky.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.floor(rect.width * dpr);
    els.canvas.height = Math.floor(rect.height * dpr);
    // 以降の描画座標は CSS ピクセル基準で扱えるようにする
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearParticleCanvas();
    // リサイズ後もカメラが枠外に出ないよう再クランプ
    setCamera(camX, camY);
    updateZoomUI();
  }

  /** 画面回転・ブラウザUI変化を含む表示領域の変更を1フレームにまとめて反映する */
  function scheduleViewportLayout() {
    if (viewportResizeFrame != null) cancelAnimationFrame(viewportResizeFrame);
    viewportResizeFrame = requestAnimationFrame(() => {
      viewportResizeFrame = null;
      closeTelescopePreview();
      layoutViewport();
      resizeCanvas();
      if (tutorialActive) layoutTutorialBubble();
    });
  }

  /**
   * キャンバス全体を確実に消去する。
   * 変換行列の影響を避けるため、いったん単位行列で clear する。
   */
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

  /** 星のワールド座標を画面座標へ変換してパーティクルを発生させる */
  function spawnParticlesAt(star, count, colors, speedMin, speedMax, lifeMin, lifeMax) {
    const screen = worldToScreen(star.x, star.y);
    spawnBurstAt(screen.x, screen.y, count, colors, speedMin, speedMax, lifeMin, lifeMax);
  }

  /** 指定座標から放射状にパーティクルを生成する */
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

  /** 完成祝福用パーティクル */
  function spawnCelebrateParticles(star) {
    spawnParticlesAt(
      star,
      70,
      ["#ffe566", "#c084fc", "#ffffff", "#7ec8ff", "#ffd6f5", "#b8f0c8"],
      40,
      200,
      0.9,
      2.1
    );
  }

  /** 応援タップ用の小さめの輝き */
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

  /**
   * パーティクルの移動・寿命・描画を1フレーム分進める。
   * 枠外へ出た粒子はすぐ捨て、下端に残像が残らないようにする。
   */
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
      p.vy += 90 * dt; // 重力
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

  // ============================================================
  // メインループ
  // ============================================================

  let lastTs = 0;

  /**
   * 毎フレームの更新入口。
   * 育成進捗・パーティクルを進め、必要な間だけループを継続する。
   */
  function tick(ts) {
    rafId = null;
    if (!lastTs) lastTs = ts;
    // タブ復帰などで大きな dt にならないよう上限を設ける
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

    // 動きがある間だけ rAF を回し、アイドル時は停止して負荷を下げる
    if (growingId || particles.length || celebrating) {
      rafId = requestAnimationFrame(tick);
    } else {
      lastTs = 0;
    }
  }

  /** メインループが止まっていれば再開する */
  function ensureLoop() {
    if (rafId == null) {
      lastTs = 0;
      rafId = requestAnimationFrame(tick);
    }
  }

  // ============================================================
  // 初期化
  // ============================================================

  /** 画面構築とイベント登録を行う */
  function init() {
    // ワールドサイズを CSS 変数へ渡し、背景レイヤの寸法と揃える
    els.sky.style.setProperty("--world-width", `${WORLD_WIDTH}px`);
    els.sky.style.setProperty("--world-height", `${WORLD_HEIGHT}px`);
    els.world.style.width = `${WORLD_WIDTH}px`;
    els.world.style.height = `${WORLD_HEIGHT}px`;

    createStars();
    layoutViewport();
    resizeCanvas();
    centerCameraOnWorld();
    updateZoomUI();
    updatePanel();
    appendLog("背景をドラッグして、散らばる星を探そう", "");
    appendLog("星を選んで育成ボタンを押してみよう", "");

    els.growBtn.addEventListener("click", startGrowth);
    els.sky.addEventListener("pointerdown", onSkyPointerDown);
    els.sky.addEventListener("pointermove", onSkyPointerMove);
    els.sky.addEventListener("pointerup", onSkyPointerUp);
    els.sky.addEventListener("pointercancel", onSkyPointerUp);
    document.addEventListener("touchstart", onSkyTouchStart, { passive: false, capture: true });
    document.addEventListener("touchmove", onSkyTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", onSkyTouchEnd, { passive: false, capture: true });
    document.addEventListener("touchcancel", onSkyTouchEnd, { passive: false, capture: true });
    els.zoomIn.addEventListener("pointerdown", (event) => event.stopPropagation());
    els.zoomOut.addEventListener("pointerdown", (event) => event.stopPropagation());
    els.zoomInput.addEventListener("pointerdown", (event) => event.stopPropagation());
    els.zoomInput.parentElement?.addEventListener("pointerdown", (event) => event.stopPropagation());
    els.growBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
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
    els.tutorialNext.addEventListener("click", () => {
      if (!tutorialActive) return;
      const next = tutorialStepIndex + 1;
      if (next >= TUTORIAL_STEPS.length) {
        closeTutorial();
        return;
      }
      showTutorialStep(next);
    });
    els.tutorialSkip.addEventListener("click", closeTutorial);
    window.addEventListener("keydown", (event) => {
      if (tutorialActive && event.key === "Escape") {
        closeTutorial();
        return;
      }

      if (tutorialActive) return;

      const characterPopupOpen = !els.characterPopup.hidden;
      const completionPopupOpen = !els.completionPopup.hidden;
      if (characterPopupOpen || completionPopupOpen) {
        if (event.key === "Escape") {
          if (characterPopupOpen) closeCharacterPopup();
          else closeCompletionPopup();
        }
        return;
      }

      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (!isTypingTarget && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          setZoom(zoom - ZOOM_STEP);
          return;
        }

        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          setZoom(zoom + ZOOM_STEP);
          return;
        }
      }

    });
    window.addEventListener("resize", scheduleViewportLayout);
    window.visualViewport?.addEventListener("resize", scheduleViewportLayout);
    if ("ResizeObserver" in window) {
      const stageResizeObserver = new ResizeObserver(scheduleViewportLayout);
      stageResizeObserver.observe(els.stageWrap);
    }

    startTutorial();
  }

init();
