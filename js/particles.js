let particles = [];
let canvasElement = null;
let ctx = null;
let skyElement = null;

export function initParticles(canvas, sky) {
  canvasElement = canvas;
  skyElement = sky;
  ctx = canvasElement.getContext("2d");
}

export function hasParticles() {
  return particles.length > 0;
}

export function clearParticleCanvas() {
  if (!ctx || !canvasElement) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  ctx.restore();
}

export function clearAllParticles() {
  particles = [];
  clearParticleCanvas();
}

/** 視点移動時の粒子座標移動 */
export function shiftParticles(dx, dy, zoom) {
  for (const p of particles) {
    p.x -= dx * zoom;
    p.y -= dy * zoom;
  }
}

/** キャンバスのリサイズ設定 */
export function resizeParticleCanvas() {
  if (!skyElement || !canvasElement || !ctx) return;
  const rect = skyElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvasElement.width = Math.floor(rect.width * dpr);
  canvasElement.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  clearParticleCanvas();
}

/** 指定座標から放射状にパーティクルを生成 */
export function spawnBurstAt(cx, cy, count, colors, speedMin, speedMax, lifeMin, lifeMax) {
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
}

export function spawnCelebrateParticles(screenX, screenY) {
  spawnBurstAt(
    screenX,
    screenY,
    70,
    ["#ffe566", "#c084fc", "#ffffff", "#7ec8ff", "#ffd6f5", "#b8f0c8"],
    40,
    200,
    0.9,
    2.1
  );
}

export function spawnCheerParticles(screenX, screenY) {
  spawnBurstAt(
    screenX,
    screenY,
    14,
    ["#ffffff", "#d6eaff", "#ffe566", "#b8e0ff"],
    30,
    110,
    0.4,
    0.9
  );
}

/** パーティクルの更新と描画 */
export function updateParticles(dt) {
  if (!skyElement || !ctx) return;
  const rect = skyElement.getBoundingClientRect();
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