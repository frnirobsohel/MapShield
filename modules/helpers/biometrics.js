/**
 * modules/helpers/biometrics.js
 * Mathematical & Biometric Human Motor Dynamics
 * Simulates realistic human behavior: Gaussian reaction delays, Box-Muller distribution,
 * subconscious mouse drift, physical typing velocity, and realistic typo corrections.
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normal (Gaussian) distribution for realistic human reaction times (Box-Muller transform)
 * @param {number} mean Average reaction time in ms
 * @param {number} stdDev Standard deviation
 * @returns {number}
 */
function gaussianRandom(mean, stdDev) {
  // Clamp u away from 0 and 1 to avoid Math.log(0) = -Infinity -> NaN
  let u = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, Math.random()));
  let v = Math.random();
  let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.max(0, Math.round(mean + z * stdDev));
}

/**
 * Generates an integer between min and max inclusive
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Natural scrolling with deceleration curve
 * @param {import('rebrowser-puppeteer-core').Page} page 
 * @param {number} totalDistance 
 * @param {number} [steps=8] 
 */
async function humanScroll(page, totalDistance, steps = 8) {
  const stepDistance = totalDistance / steps;
  for (let i = 0; i < steps; i++) {
    const currentStep = stepDistance * (1 - (i / (steps * 1.5)));
    await page.evaluate((d) => window.scrollBy(0, d), currentStep).catch(() => {});
    await sleep(randomBetween(50, 110));
  }
}

/**
 * Natural subconscious mouse movement while human reads or waits
 * @param {Object} cursor ghost-cursor instance
 */
async function humanWanderMouse(cursor) {
  if (!cursor) return;
  try {
    await cursor.randomMove();
    await sleep(gaussianRandom(450, 100));
  } catch (e) {
    // Ignore boundary limits
  }
}

const QWERTY_NEIGHBORS = {
  a: ['s', 'q', 'z', 'w'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'v'],
  d: ['s', 'e', 'f', 'c', 'x'],
  e: ['w', 'r', 'd', 's'],
  f: ['d', 'r', 't', 'g', 'v'],
  g: ['f', 't', 'y', 'h', 'b'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'o', 'k', 'j'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'p', 'k', 'l'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 't', 'f', 'd'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', 'y', 'g', 'f'],
  u: ['y', 'i', 'j', 'h'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', 'e', 's', 'a'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', 'u', 'h', 'g'],
  z: ['a', 's', 'x']
};

const SHIFT_CHARS = new Set(['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '{', '}', '|', ':', '"', '<', '>', '?', '~']);

/**
 * Simulates physical key press with biological hold time (keydown -> wait -> keyup)
 */
async function naturalKeyPress(page, char) {
  const isUppercase = char !== char.toLowerCase() && char.toUpperCase() === char;
  const needsShift = isUppercase || SHIFT_CHARS.has(char);

  if (needsShift) {
    await page.keyboard.down('Shift');
    await sleep(randomBetween(60, 120));
  }

  await page.keyboard.press(char, { delay: gaussianRandom(95, 20) });

  if (needsShift) {
    await sleep(randomBetween(50, 100));
    await page.keyboard.up('Shift');
  }
}

/**
 * Biometric Human Typing:
 * - Natural typing with realistic typos & Backspace corrections
 * - Variable delay based on character type (special symbols require higher cognitive load)
 */
async function humanType(page, text, { canMakeMistakes = true, typoChance = 0.08 } = {}) {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const lowerChar = char.toLowerCase();

    // Natural typo simulation
    if (canMakeMistakes && QWERTY_NEIGHBORS[lowerChar] && Math.random() < typoChance) {
      const neighbors = QWERTY_NEIGHBORS[lowerChar];
      const typoChar = neighbors[Math.floor(Math.random() * neighbors.length)];

      await naturalKeyPress(page, typoChar);
      await sleep(gaussianRandom(400, 80)); // Human realization pause
      await page.keyboard.press('Backspace', { delay: gaussianRandom(85, 20) });
      await sleep(gaussianRandom(200, 40));
    }

    await naturalKeyPress(page, char);

    let delay = gaussianRandom(160, 35);
    
    // Higher thinking delay on special characters or word transitions
    if (['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+'].includes(char)) {
      delay += randomBetween(200, 450);
    } else if (char === ' ' || char === '.' || char === ',' || Math.random() < 0.04) {
      delay += randomBetween(250, 500);
    }
    await sleep(delay);
  }
}

module.exports = {
  sleep,
  gaussianRandom,
  randomBetween,
  humanScroll,
  humanWanderMouse,
  naturalKeyPress,
  humanType,
  QWERTY_NEIGHBORS,
  SHIFT_CHARS
};
