/**
 * Job timing helpers — configurable cooldown / success hold with safe defaults.
 * Defaults are tighter than the old fixed 8–15s / 5s waits, but still non-zero.
 */

/**
 * @param {object} [settings]
 * @param {object} [payload]
 * @returns {number} milliseconds
 */
function resolveJobCooldownMs(settings = {}, payload = {}) {
  const rawMin = payload.jobCooldownMinMs ?? settings.jobCooldownMinMs ?? 5000;
  const rawMax = payload.jobCooldownMaxMs ?? settings.jobCooldownMaxMs ?? 10000;
  let min = Number(rawMin);
  let max = Number(rawMax);
  if (!Number.isFinite(min) || min < 0) min = 5000;
  if (!Number.isFinite(max) || max < 0) max = 10000;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (hi === lo) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * @param {object} [settings]
 * @param {object} [options]
 * @returns {number} milliseconds
 */
function resolveSuccessHoldMs(settings = {}, options = {}) {
  const raw = options.successHoldMs ?? settings.successHoldMs ?? 2000;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return 2000;
  return v;
}

module.exports = {
  resolveJobCooldownMs,
  resolveSuccessHoldMs
};
