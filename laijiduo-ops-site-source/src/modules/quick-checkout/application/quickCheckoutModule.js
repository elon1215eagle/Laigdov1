import { activeCatalog } from "../domain/catalog.js";
import { createCheckoutWorkspace, executeWorkspaceCommand, visibleOrders } from "../domain/workspace.js";

export function createQuickCheckoutModule({ adapter, products }) {
  const catalog = activeCatalog(products);
  return {
    catalog,
    async loadWorkspace() {
      return adapter.loadWorkspace();
    },
    async startWorkspace({ storeCode, storeName, operator }) {
      if (await adapter.loadWorkspace()) throw new Error("已有雲端工作區，請重新讀取，不可覆蓋。");
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
      const saved = await adapter.loadWorkspace();
      if (saved && visibleOrders(saved).length) throw new Error("尚有未完成訂單，不能結束操作。");
      await adapter.clearWorkspace();
    },
  };
}
