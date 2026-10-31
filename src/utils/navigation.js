export function getSafeBackTarget(historyState) {
  return Number.isInteger(historyState?.idx) && historyState.idx > 0 ? -1 : '/'
}
