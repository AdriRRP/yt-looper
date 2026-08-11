(() => {
  const fixtureStorageKey = "ytLooperPopupFixtureStorage";
  const memory = JSON.parse(sessionStorage.getItem(fixtureStorageKey) ?? "{}");
  const persistMemory = () => sessionStorage.setItem(fixtureStorageKey, JSON.stringify(memory));
  const linkedFixture = new URLSearchParams(location.search).get("linked") === "1";
  const matchingFixture = new URLSearchParams(location.search).get("match") === "1";
  const linkedName =
    new URLSearchParams(location.search).get("long") === "1"
      ? "Solo principal — segunda vuelta, compases 17 a 32 a velocidad de estudio"
      : "Solo principal";
  if (linkedFixture && !memory.ytLooperStateV3) {
    memory.ytLooperStateV3 = {
      version: 3,
      settings: { rate: 0.75 },
      loops: {},
      folders: [
        { id: "practice", name: "Práctica", parentId: null, createdAt: 1 },
        { id: "favorites", name: "Favoritos", parentId: null, createdAt: 2 }
      ],
      bookmarks: [
        {
          id: "saved-fragment",
          name: linkedName,
          folderId: "practice",
          videoId: "fixtureVid1",
          videoTitle: "Canción de práctica",
          start: 10,
          end: 17,
          rate: 1,
          createdAt: 3
        }
      ]
    };
    persistMemory();
  }
  globalThis.browser = {
    i18n: globalThis.__ytLooperFixtureMessages
      ? {
          getMessage(key, substitutions = []) {
            const entry = globalThis.__ytLooperFixtureMessages[key];
            if (!entry) {
              return "";
            }
            const values = Array.isArray(substitutions) ? substitutions : [substitutions];
            let message = entry.message;
            for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
              const index = Number(placeholder.content.slice(1)) - 1;
              message = message.replaceAll(`$${name.toUpperCase()}$`, values[index] ?? "");
            }
            return message;
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
          Object.assign(memory, items);
          persistMemory();
        }
      }
    },
    tabs: {
      async query() {
        return [{ id: 1 }];
      },
      async sendMessage(_tabId, message) {
        if (message.type === "show-widget") {
          return { shown: true };
        }
        return {
          available: true,
          videoId: "fixtureVid1",
          videoTitle: "Canción de práctica",
          start: matchingFixture ? 10 : 12.5,
          end: matchingFixture ? 17 : 18.75,
          rate: matchingFixture ? 1 : 0.75,
          valid: true,
          widgetVisible: false,
          bookmarkId: linkedFixture ? "saved-fragment" : undefined,
          bookmarkName: linkedFixture ? linkedName : undefined
        };
      },
      async create(properties) {
        globalThis.__ytLooperOpenedUrl = properties.url;
        return { id: 2 };
      }
    }
  };
})();
