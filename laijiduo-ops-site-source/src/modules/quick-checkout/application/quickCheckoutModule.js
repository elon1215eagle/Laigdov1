import { activeCatalog } from "../domain/catalog.js";
import { createCheckoutWorkspace, executeWorkspaceCommand } from "../domain/workspace.js";

export function createQuickCheckoutModule({ adapter, products }) {
  const catalog = activeCatalog(products);
  return {
    catalog,
    async loadWorkspace() {
      return adapter.loadWorkspace();
    },
    async startWorkspace({ storeCode, storeName, operator }) {
      const workspace = createCheckoutWorkspace({ storeCode, storeName, operator });
      await adapter.saveWorkspace(workspace);
      return workspace;
    },
    async execute(workspace, command, now) {
      const next = executeWorkspaceCommand(workspace, command, catalog, now);
      await adapter.saveWorkspace(next);
      return next;
    },
    async reset() {
      await adapter.clearWorkspace();
    },
  };
}
