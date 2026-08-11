export interface YouTubeContext {
  video: HTMLVideoElement;
  player: HTMLElement;
  videoId: string;
}

export function getVideoIdFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname !== "/watch") {
      return null;
    }
    return parsedUrl.searchParams.get("v");
  } catch {
    return null;
  }
}

export function findYouTubeContext(): YouTubeContext | null {
  const videoId = getVideoIdFromUrl(location.href);
  if (!videoId) {
    return null;
  }

  const player = document.querySelector<HTMLElement>("#movie_player");
  const video =
    player?.querySelector<HTMLVideoElement>("video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video");

  if (!player || !video) {
    return null;
  }

  return { player, video, videoId };
}

export function isAdPlaying(player: HTMLElement): boolean {
  return player.classList.contains("ad-showing");
}

export function observeYouTubeNavigation(onChange: () => void): () => void {
  let scheduled = false;
  const schedule = (): void => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      onChange();
    }, 80);
  };

  const youtubeEvents = ["yt-navigate-finish", "yt-page-data-updated"];
  for (const eventName of youtubeEvents) {
    document.addEventListener(eventName, schedule);
  }
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);

  const observer = new MutationObserver((records) => {
    const hasRelevantNode = records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some((node) => {
        if (!(node instanceof Element)) {
          return false;
        }
        return (
          node.matches("#movie_player, video.html5-main-video") ||
          Boolean(node.querySelector("#movie_player, video.html5-main-video"))
        );
      })
    );
    if (hasRelevantNode) {
      schedule();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const eventName of youtubeEvents) {
      document.removeEventListener(eventName, schedule);
    }
    window.removeEventListener("popstate", schedule);
    window.removeEventListener("pageshow", schedule);
  };
}
