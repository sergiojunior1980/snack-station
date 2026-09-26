export const SESSION_BEAT_KEY = "snack-session-beat";
const SESSION_BEAT_MS = 10_000;

export function markSessionOpen() {
  localStorage.setItem(SESSION_BEAT_KEY, String(Date.now()));
}

export function clearSessionMark() {
  localStorage.removeItem(SESSION_BEAT_KEY);
}

export function sessionStillOpen() {
  const beat = Number(localStorage.getItem(SESSION_BEAT_KEY) || 0);
  return beat > 0 && Date.now() - beat <= SESSION_BEAT_MS;
}
