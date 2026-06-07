/**
 * Returns a tagged diff result using markers:
 * ✓ ok, ⊕ added, ✗ wrong, ○ missing, … end
 *
 * @param {string|string[]} target
 * @param {string|string[]} actual
 * @returns {{ tagged: string, error: number }}
 */
function computeDiff(target, actual) {
  target = Array.isArray(target) ? target.join('') : String(target ?? '');
  actual = Array.isArray(actual) ? actual.join('') : String(actual ?? '');

  const segments = [];
  let errorCount = 0;
  const isUpper = ch => ch === ch.toUpperCase() && ch !== ch.toLowerCase();
  const normalizeToTargetCase = (ch, t) => {
    if (!t) return ch.toLowerCase();
    return isUpper(t) ? ch.toUpperCase() : ch.toLowerCase();
  };
  const append = (marker, ch) => {
    if (!ch) return;
    const last = segments[segments.length - 1];
    if (last && last.marker === marker) last.text += ch;
    else segments.push({ marker, text: ch });
    if (marker === '✗' || marker === '⊕' || marker === '○') errorCount += ch.length;
  };

  let chars_lost = 0;
  let i = 0;

  while (i < target.length) {
    const ai = i - chars_lost;
    const t = target[i];
    const a = ai < actual.length ? actual[ai] : undefined;
    const tCmp = t ? t.toUpperCase() : t;
    const aCmp = a ? a.toUpperCase() : a;

    if (a === undefined) {
      append('…', t);
      i++;
      continue;
    }

    if (tCmp === aCmp) {
      append('✓', t);
      i++;
      continue;
    }

    if (i + 1 < target.length && ai + 1 < actual.length &&
        target[i + 1].toUpperCase() === actual[ai + 1].toUpperCase()) {
      append('✗', normalizeToTargetCase(a, t));
      i++;
      continue;
    }

    if (ai + 1 < actual.length && actual[ai + 1].toUpperCase() === tCmp) {
      append('⊕', normalizeToTargetCase(a, t));
      chars_lost--;
      continue;
    }

    if (i + 1 < target.length && target[i + 1].toUpperCase() === aCmp) {
      append('○', t);
      chars_lost++;
      i++;
      continue;
    }

    append('✗', normalizeToTargetCase(a, t));
    i++;
  }

  let ai = i - chars_lost;
  while (ai < actual.length) {
    append('⊕', actual[ai].toLowerCase());
    ai++;
  }

  return {
    tagged: segments.map(s => s.marker + s.text).join(''),
    error: errorCount
  };
}

if (typeof module !== 'undefined') module.exports = { computeDiff };
