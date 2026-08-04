(() => {
  "use strict";

  // ============================================================
  // 定数・設定値
  // ============================================================

  /** 夜空に配置する星の個数 */
  const STAR_COUNT = 10;
  /** 星1つあたりの育成時間（ミリ秒）。仕様どおり1分 */
  const GROWTH_DURATION_MS = 60_000;
  /**
   * 進捗に応じた星の色フェーズ判定テーブル。
   * 大きい閾値から順に照合する。
   */
  const COLOR_THRESHOLDS = [
    { min: 80, phase: "purple" },
    { min: 75, phase: "red" },
    { min: 50, phase: "blue" },
    { min: 25, phase: "yellow" },
    { min: 0, phase: "initial" },
  ];
  /** 完成時の祝福バナー／操作ロックの長さ */
  const CELEBRATE_MS = 2200;
  /** 応援タップ1回あたりの育成短縮量 */
  const CHEER_BOOST_MS = 500;
  /** 1回の育成で応援によって短縮できる合計上限 */
  const CHEER_MAX_TOTAL_MS = 5_000;
  /** 応援タップの連打防止インターバル */
  const CHEER_COOLDOWN_MS = 350;
  /** 成長ログに同時表示する最大件数 */
  const LOG_MAX_ITEMS = 4;
  /** 願いのかけら1個あたり、祝福パーティクルへ追加する個数 */
  const WISH_BONUS_PARTICLES = 14;
  /** 流れ星のクリック判定半径（px） */
  const METEOR_CATCH_RADIUS = 32;
  /** 背景ワールドのサイズ（background.png の実寸） */
  const WORLD_WIDTH = 2752;
  const WORLD_HEIGHT = 1536;
  /** この距離以上動いたらドラッグ扱い（クリックと区別） */
  const DRAG_THRESHOLD_PX = 8;

  /** 進捗マイルストーン到達時に出す成長ログ文言 */
  const GROWTH_MILESTONES = [
    { id: "start", min: 0, text: "やさしい光がゆらぎはじめた…" },
    { id: "yellow", min: 25, text: "あたたかい黄色に輝きだした！" },
    { id: "blue", min: 50, text: "深い青の光が広がっていく…" },
    { id: "red", min: 75, text: "熱い赤に色づいた！" },
    { id: "purple", min: 80, text: "神秘的な紫の光が満ちていく…" },
    { id: "complete", min: 100, text: "キャラクターが生まれた！" },
  ];

  /** 応援タップ時にログへ出す短文（順繰り） */
  const CHEER_LOG_LINES = [
    "きらっと応えてくれた！",
    "応援が届いたみたい…",
    "星が少し元気になった！",
    "ぴかり！ がんばってるよ",
    "あなたの声援、受け取った！",
  ];

  /**
   * 育成星の配置（ワールド全体に散りばめる。相対 0〜1）。
   * 中央付近にも数個置き、初期視点から探し始められるようにする。
   */
  const STAR_POSITIONS = [
    { x: 0.46, y: 0.42 },
    { x: 0.54, y: 0.58 },
    { x: 0.22, y: 0.28 },
    { x: 0.78, y: 0.24 },
    { x: 0.14, y: 0.62 },
    { x: 0.88, y: 0.55 },
    { x: 0.34, y: 0.18 },
    { x: 0.66, y: 0.72 },
    { x: 0.08, y: 0.40 },
    { x: 0.92, y: 0.78 },
  ];

  // ============================================================
  // DOM参照・ゲーム状態
  // ============================================================

  const els = {
    stars: document.getElementById("stars"),
    sky: document.getElementById("sky"),
    world: document.getElementById("world"),
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
  /** 所持中の願いのかけら数 */
  let wishFragments = 0;
  /** 次の流れ星出現予約タイマー */
  let meteorTimerId = null;
  /** 流れ星の一意ID採番用 */
  let meteorSeq = 0;

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

  // ============================================================
  // ユーティリティ
  // ============================================================

  /** 数値を2桁ゼロ埋めする（星ID・時刻表示用） */
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /** 残りミリ秒を「残り mm:ss」形式に変換する */
  function formatRemaining(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `残り ${pad2(m)}:${pad2(s)}`;
  }

  /** 進捗％から星の色フェーズ名を返す */
  function getColorPhase(progress) {
    for (const rule of COLOR_THRESHOLDS) {
      if (progress >= rule.min) return rule.phase;
    }
    return "initial";
  }

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
    const maxX = Math.max(0, WORLD_WIDTH - vw);
    const maxY = Math.max(0, WORLD_HEIGHT - vh);
    return {
      x: Math.min(maxX, Math.max(0, x)),
      y: Math.min(maxY, Math.max(0, y)),
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
    for (const p of particles) {
      p.x -= dx;
      p.y -= dy;
    }

    applyWorldTransform();
  }

  /** world 要素へ translate を適用する（カメラ＝左上原点） */
  function applyWorldTransform() {
    els.world.style.transform = `translate3d(${-camX}px, ${-camY}px, 0)`;
  }

  /** 初期表示：背景中央をプレイ画面の中心に合わせる */
  function centerCameraOnWorld() {
    const { width: vw, height: vh } = getViewportSize();
    setCamera((WORLD_WIDTH - vw) / 2, (WORLD_HEIGHT - vh) / 2);
  }

  /** 星のワールド相対座標 → 画面（ビューポート）座標 */
  function worldToScreen(wxRatio, wyRatio) {
    return {
      x: wxRatio * WORLD_WIDTH - camX,
      y: wyRatio * WORLD_HEIGHT - camY,
    };
  }

  /** 背景ドラッグ開始 */
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

    try {
      els.sky.setPointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }
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
    }

    if (!isDragging) return;

    // 指を右へ動かすと、背景は右へ追従（＝カメラは左へ）
    setCamera(dragOriginCamX - dx, dragOriginCamY - dy);
  }

  /** 背景ドラッグ終了 */
  function onPanPointerUp(event) {
    if (event.pointerId !== activePointerId) return;

    // ドラッグでなければ流れ星捕獲を試す
    if (!isDragging && !celebrating) {
      const meteor = findMeteorAt(event.clientX, event.clientY);
      if (meteor) {
        suppressClick = true;
        catchMeteor(meteor);
      }
    }

    isPointerDown = false;
    isDragging = false;
    activePointerId = null;
    els.sky.classList.remove("is-dragging");

    try {
      els.sky.releasePointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }

    // click イベントより後でフラグを戻す
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  }

  // ============================================================
  // 願いのかけら（流れ星報酬）
  // ============================================================

  /** ヘッダーの所持数表示を更新する */
  function updateWishCounter() {
    els.wishCount.textContent = String(wishFragments);
  }

  /** かけらを加算し、カウンタの獲得アニメを再生する */
  function gainWishFragment(amount = 1) {
    wishFragments += amount;
    updateWishCounter();
    // 同じクラスを付け直して CSS アニメを再発火させる
    els.wishCounter.classList.remove("is-gain");
    void els.wishCounter.offsetWidth;
    els.wishCounter.classList.add("is-gain");
  }

  // ============================================================
  // 流れ星ミニゲーム
  // ============================================================

  /** 画面上の流れ星をすべて消す（祝福開始時など） */
  function clearMeteors() {
    activeMeteors = [];
    els.meteors.replaceChildren();
  }

  /**
   * 次の流れ星出現を予約する。
   * 育成中は待ち時間向けに出現間隔を短くする。
   */
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

  /**
   * 流れ星を1つ生成し、夜空を斜めに横切らせる。
   * 位置は JS で毎フレーム更新し、クリック判定を安定させる。
   */
  function spawnMeteor() {
    if (celebrating) return;
    // 同時出現は最大2つまで
    if (activeMeteors.filter((m) => !m.caught).length >= 2) return;

    const rect = els.sky.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;

    // 左右どちらから飛来するかランダムに決める
    const fromLeft = Math.random() < 0.5;
    const startYRatio = 0.08 + Math.random() * 0.45;
    const endYRatio = Math.min(startYRatio + 0.18 + Math.random() * 0.28, 0.92);
    const startX = (fromLeft ? -0.05 : 1.05) * rect.width;
    const endX = (fromLeft ? 1.05 : -0.05) * rect.width;
    const startY = startYRatio * rect.height;
    const endY = endYRatio * rect.height;
    // 基準時間 × 速度調整係数（段階的に遅くした値）
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

  /** 流れ星の位置・透明度を時間経過で更新する */
  function updateMeteors(dt) {
    if (!activeMeteors.length) return;
    const rect = els.sky.getBoundingClientRect();

    activeMeteors = activeMeteors.filter((m) => {
      // 捕獲済みはキャッチ演出が終わるまで要素が残る場合がある
      if (m.caught) {
        return m.el.isConnected;
      }

      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // 画面横断が終わったら削除
      if (m.life >= m.maxLife) {
        m.el.remove();
        return false;
      }

      // 出現直後と退場直前はフェードする
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

  /**
   * ポインタ座標に近い流れ星を返す。
   * 要素そのものだけでなく、半径内なら捕獲可能にする。
   */
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

  /** 夜空へのポインタ入力。流れ星捕獲を優先して処理する */
  function onSkyPointerDown(event) {
    // パン開始と兼用。捕獲は pointerup で判定する
    onPanPointerDown(event);
  }

  /** 流れ星を捕獲し、願いのかけらを付与する */
  function catchMeteor(meteor) {
    if (!meteor || meteor.caught || celebrating) return;

    meteor.caught = true;
    const rect = els.sky.getBoundingClientRect();
    // 捕獲演出中は現在位置に固定する
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
    // 背景ドラッグ直後の誤クリックを無視
    if (suppressClick || isDragging) return;
    if (celebrating) return;

    const star = findStar(id);
    if (!star || star.status === "completed") return;

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
      el.disabled = true;
      if (!el.querySelector("img")) {
        const img = document.createElement("img");
        img.alt = `星 ${star.index} のキャラクター`;
        // まずプレースホルダを出し、本番画像があれば差し替え
        img.src = createPlaceholderSvg(star.index);
        const probe = new Image();
        probe.onload = () => {
          img.src = star.characterImageUrl;
        };
        probe.src = star.characterImageUrl;
        el.appendChild(img);
      }
    } else if (growingId && growingId === star.id) {
      // 育成対象だけはクリック可（応援用）
      el.disabled = false;
      el.setAttribute("aria-label", `星 ${star.index}（タップで応援）`);
    } else {
      // 育成中は他星を操作不可にする
      el.disabled = Boolean(growingId && growingId !== star.id);
      el.setAttribute("aria-label", `星 ${star.index}`);
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

  /** 「育成」ボタン。選択中の星の育成を開始する */
  function startGrowth() {
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
    // 育成中は流れ星を多めに出すためスケジュールを組み直す
    scheduleNextMeteor();
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
   * 所持中の願いのかけらを消費してパーティクル量を増やし、演出後に操作を再開する。
   */
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

  /** 完成祝福用。願いのかけら数に応じて粒子量を増やす */
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
   * 育成進捗・パーティクル・流れ星を進め、必要な間だけループを継続する。
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
    updateMeteors(dt);

    // 動きがある間だけ rAF を回し、アイドル時は停止して負荷を下げる
    if (growingId || particles.length || celebrating || activeMeteors.length) {
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

  /** 画面構築とイベント登録、最初の流れ星予約を行う */
  function init() {
    // ワールドサイズを CSS 変数へ渡し、背景レイヤの寸法と揃える
    els.sky.style.setProperty("--world-width", `${WORLD_WIDTH}px`);
    els.sky.style.setProperty("--world-height", `${WORLD_HEIGHT}px`);
    els.world.style.width = `${WORLD_WIDTH}px`;
    els.world.style.height = `${WORLD_HEIGHT}px`;

    createStars();
    resizeCanvas();
    centerCameraOnWorld();
    updatePanel();
    updateWishCounter();
    appendLog("背景をドラッグして、散らばる星を探そう", "");
    appendLog("流れ星をタップして、願いのかけらを集めよう", "wish");

    els.growBtn.addEventListener("click", startGrowth);
    els.sky.addEventListener("pointerdown", onSkyPointerDown);
    els.sky.addEventListener("pointermove", onPanPointerMove);
    els.sky.addEventListener("pointerup", onPanPointerUp);
    els.sky.addEventListener("pointercancel", onPanPointerUp);
    window.addEventListener("resize", resizeCanvas);

    // 起動直後は少し待ってから最初の流れ星を出す
    meteorTimerId = window.setTimeout(() => {
      spawnMeteor();
      scheduleNextMeteor();
    }, 2800 + Math.random() * 2200);
  }

  init();
})();
