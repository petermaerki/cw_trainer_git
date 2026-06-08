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

  const tLen = target.length;
  const aLen = actual.length;

  const isUpper = ch => ch === ch.toUpperCase() && ch !== ch.toLowerCase();

  // Semi-global edit-distance DP.
  // dp[i][j] = min cost to consume actual[0..j-1] aligned to target[0..i-1].
  // Trailing target chars after actual is exhausted are FREE (emitted as '…').
  // Costs: match=0, replace(✗)=1, delete-target(○)=1, insert-actual(⊕)=1.
  const dp = Array.from({ length: tLen + 1 }, () => new Int32Array(aLen + 1));
  for (let i = 0; i <= tLen; i++) dp[i][0] = i;
  for (let j = 0; j <= aLen; j++) dp[0][j] = j;

  for (let i = 1; i <= tLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      const hit = target[i - 1].toUpperCase() === actual[j - 1].toUpperCase();
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (hit ? 0 : 1), // match or replace
        dp[i - 1][j] + 1,                   // delete target (○)
        dp[i][j - 1] + 1                    // insert actual (⊕)
      );
    }
  }

  // Find the rightmost i with the minimum dp[i][aLen]
  // (rightmost = least trailing '…', i.e. process as much of target as possible).
  let bestCost = Infinity;
  let bestI = tLen;
  for (let i = 0; i <= tLen; i++) {
    if (dp[i][aLen] <= bestCost) {
      bestCost = dp[i][aLen];
      bestI = i;
    }
  }

  // Backtrack from dp[bestI][aLen].
  // Priority: Match > Delete-target(○) > Insert-actual(⊕) > Replace(✗)
  // This preference keeps ○ before ⊕ in ambiguous runs, producing cleaner output.
  const ops = [];

  // Pre-drain: trailing actual chars that are purely extra (⊕) at the target
  // boundary must appear AFTER matched content. Drain them backwards first so
  // they end up at the end of the ops list after reversal.
  let j = aLen;
  while (j > 0 && dp[bestI][j] === dp[bestI][j - 1] + 1) {
    ops.push({ op: 'I', aChar: actual[j - 1] });
    j--;
  }

  // Main backtrack from (bestI, j)
  let i = bestI;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const hit     = target[i - 1].toUpperCase() === actual[j - 1].toUpperCase();
      const diagCost = dp[i - 1][j - 1] + (hit ? 0 : 1);
      const delCost  = dp[i - 1][j] + 1;
      const insCost  = dp[i][j - 1] + 1;

      if (hit && diagCost === dp[i][j]) {
        ops.push({ op: 'M', tChar: target[i - 1], aChar: actual[j - 1] });
        i--; j--;
      } else if (delCost === dp[i][j]) {
        ops.push({ op: 'D', tChar: target[i - 1] });
        i--;
      } else if (insCost === dp[i][j]) {
        ops.push({ op: 'I', aChar: actual[j - 1] });
        j--;
      } else {
        // replace
        ops.push({ op: 'R', tChar: target[i - 1], aChar: actual[j - 1] });
        i--; j--;
      }
    } else if (i > 0) {
      ops.push({ op: 'D', tChar: target[i - 1] });
      i--;
    } else {
      ops.push({ op: 'I', aChar: actual[j - 1] });
      j--;
    }
  }
  ops.reverse();

  // Append trailing '…' for untyped target chars
  for (let k = bestI; k < tLen; k++) {
    ops.push({ op: 'E', tChar: target[k] });
  }

  // Emit segments
  const segments = [];
  let errorCount = 0;

  const append = (marker, ch) => {
    if (!ch) return;
    const last = segments[segments.length - 1];
    if (last && last.marker === marker) last.text += ch;
    else segments.push({ marker, text: ch });
    if (marker === '✗' || marker === '⊕' || marker === '○') errorCount += ch.length;
  };

  for (const op of ops) {
    switch (op.op) {
      case 'M': append('✓', op.tChar); break;
      case 'D': append('○', op.tChar); break;
      case 'I': append('⊕', op.aChar.toLowerCase()); break;
      case 'E': append('…', op.tChar); break;
      case 'R': {
        const ch = isUpper(op.tChar) ? op.aChar.toUpperCase() : op.aChar.toLowerCase();
        append('✗', ch);
        break;
      }
    }
  }

  return {
    tagged: segments.map(s => s.marker + s.text).join(''),
    error: errorCount
  };
}

if (typeof module !== 'undefined') module.exports = { computeDiff };

