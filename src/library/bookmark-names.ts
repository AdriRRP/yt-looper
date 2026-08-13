export function formatLoopTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
}

export function createDefaultBookmarkName(videoTitle: string, start: number, end: number): string {
  const suffix = ` · ${formatLoopTime(start)}–${formatLoopTime(end)}`;
  const normalizedTitle = videoTitle.trim();
  return `${normalizedTitle.slice(0, Math.max(1, 80 - suffix.length)).trimEnd()}${suffix}`;
}
