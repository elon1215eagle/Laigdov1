const DEFAULT_KEY = "laigdo-quick-checkout-workspace-v1";

export function createMemoryQuickCheckoutAdapter({ storage = globalThis.localStorage, key = DEFAULT_KEY } = {}) {
  let memoryValue = null;
  return {
    async loadWorkspace() {
      const raw = storage?.getItem ? storage.getItem(key) : memoryValue;
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async saveWorkspace(workspace) {
      const raw = JSON.stringify(workspace);
      if (storage?.setItem) storage.setItem(key, raw);
      else memoryValue = raw;
      return workspace;
    },
    async clearWorkspace() {
      if (storage?.removeItem) storage.removeItem(key);
      memoryValue = null;
    },
  };
}
