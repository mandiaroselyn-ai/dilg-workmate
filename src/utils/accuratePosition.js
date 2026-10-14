// A first GPS reading is often rough, more so without internet. This takes the `first`
// reading, then fresh readings from `again`, a pause apart, until one is within
// `requiredMeters` or `timeLimitMs` passes, and returns the most accurate one. `onRough`
// hears the accuracy of the best reading each time it is not good enough yet. It stops
// asking when location permission is refused (error code 1).
export const takeAccuratePosition = async ({
  first,
  again,
  requiredMeters,
  onRough,
  timeLimitMs = 40000,
  pauseMs = 1000,
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) => {
  const deadline = now() + timeLimitMs;
  const accuracyOf = position => Number(position?.coords?.accuracy);
  let best = await first();
  while (!(accuracyOf(best) <= requiredMeters) && now() < deadline) {
    onRough?.(accuracyOf(best));
    await sleep(pauseMs);
    let next = null;
    try {
      next = await again();
    } catch (error) {
      if (error?.code === 1) break;
    }
    if (next && (!Number.isFinite(accuracyOf(best)) || accuracyOf(next) < accuracyOf(best))) best = next;
  }
  return best;
};
