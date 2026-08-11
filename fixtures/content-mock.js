(() => {
  const linkedFixture = new URLSearchParams(location.search).get("linked") === "1";
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
    storage: {
      local: {
        async get(keys) {
          const selectedKeys = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            selectedKeys.filter((key) => key in memory).map((key) => [key, memory[key]])
          );
        },
        async set(items) {
          Object.assign(memory, items);
          for (const listener of storageListeners) {
            listener();
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
