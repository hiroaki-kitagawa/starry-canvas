import { COLOR_THRESHOLDS } from "./config.js";

/** 数値を2桁ゼロ埋めする（星ID・時刻表示用） */
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
