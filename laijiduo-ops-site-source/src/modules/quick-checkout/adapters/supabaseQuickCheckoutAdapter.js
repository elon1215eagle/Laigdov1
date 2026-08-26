function unwrapWorkspace(data) {
  if (!data) return null;
  if (Object.prototype.hasOwnProperty.call(data, "workspace")) {
    return data.workspace && typeof data.workspace === "object" ? data.workspace : null;
  }
  return typeof data === "object" ? data : null;
}

export function createSupabaseQuickCheckoutAdapter({ client, deviceToken }) {
  if (!client?.rpc) throw new Error("Supabase client is required");
  if (!String(deviceToken || "").trim()) throw new Error("Device token is required");

  async function rpc(name, parameters) {
    const { data, error } = await client.rpc(name, parameters);
    if (error) throw error;
    return data;
  }

  return {
    async loadWorkspace() {
      const data = await rpc("quick_checkout_load_workspace", { p_device_token: deviceToken });
      return unwrapWorkspace(data);
    },
    async saveWorkspace(workspace) {
      await rpc("quick_checkout_save_workspace", {
        p_device_token: deviceToken,
        p_workspace: workspace,
      });
      return workspace;
    },
    async clearWorkspace() {
      await rpc("quick_checkout_clear_workspace", { p_device_token: deviceToken });
    },
  };
}
