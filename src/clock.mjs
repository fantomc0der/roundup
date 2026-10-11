// One tick is a second against real herdr; the tests shrink it so readiness loops finish fast.
export const TICK_MS = Math.max(1, Number(process.env.ROUNDUP_TICK_MS ?? 1000))

export const sleep = ticks => new Promise(r => setTimeout(r, ticks * TICK_MS))

export const ticksToMs = ticks => String(Math.round(ticks * TICK_MS))
