import { COLOR_THRESHOLDS } from "./config.js";

/** 数値を2桁ゼロ埋めする */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 残りミリ秒を「残り mm:ss」形式に変換する */
export function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `残り ${pad2(m)}:${pad2(s)}`;
}

/** 進捗％から星の色フェーズ名を返す */
export function getColorPhase(progress) {
  for (const rule of COLOR_THRESHOLDS) {
    if (progress >= rule.min) return rule.phase;
  }
  return "initial";
}

/** キャラ画像未配置時の仮マスコット（SVG data URL）を作る */
export function createPlaceholderSvg(index) {
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