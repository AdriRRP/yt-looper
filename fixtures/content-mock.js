(() => {
  const fixtureParameters = new URLSearchParams(location.search);
  const linkedFixture = fixtureParameters.get("linked") === "1";
  if (fixtureParameters.get("youtubeHost") === "1") {
    const NativeUrl = globalThis.URL;
    globalThis.URL = class FixtureYouTubeUrl extends NativeUrl {
      get hostname() {
        return super.hostname === "127.0.0.1" ? "www.youtube.com" : super.hostname;
      }
    };
  }
  const memory = linkedFixture
    ? {
        ytLooperStateV3: {
          version: 3,
          settings: { rate: 1 },
          loops: {},
          folders: [{ id: "practice", name: "Práctica", parentId: null, createdAt: 1 }],
          bookmarks: [
            {
              id: "saved-fragment",
              name: "Solo principal",
              folderId: "practice",
              videoId: "fixtureVid1",
              videoTitle: "YT Looper integration fixture",
              start: 0.5,
              end: 3.5,
              rate: 1,
              createdAt: 2
            }
          ]
        }
      }
    : {};
  const storageListeners = new Set();
  const messageListeners = new Set();

  globalThis.browser = {
    i18n: globalThis.__ytLooperFixtureMessages
      ? {
          getMessage(key, substitutions = []) {
            const entry = globalThis.__ytLooperFixtureMessages[key];
            if (!entry) return "";
            const values = Array.isArray(substitutions) ? substitutions : [substitutions];
            let message = entry.message;
            for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
              const index = Number(placeholder.content.slice(1)) - 1;
              message = message.replaceAll(`$${name.toUpperCase()}$`, values[index] ?? "");
            }
            return message;
          },
          getUILanguage() {
            return "en";
          }
        }
      : undefined,
    storage: {
      local: {
        async get(keys) {
          const selectedKeys = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            selectedKeys.filter((key) => key in memory).map((key) => [key, memory[key]])
          );
        },
        async set(items) {
          const changes = Object.fromEntries(
            Object.entries(items).map(([key, newValue]) => [
              key,
              { oldValue: memory[key], newValue }
            ])
          );
          Object.assign(memory, items);
          for (const listener of storageListeners) {
            listener(changes, "local");
          }
        }
      },
      onChanged: {
        addListener(listener) {
          storageListeners.add(listener);
        },
        removeListener(listener) {
          storageListeners.delete(listener);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          messageListeners.add(listener);
        }
      }
    }
  };
})();
