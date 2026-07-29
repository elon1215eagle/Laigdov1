import { supabase } from "../../../lib/supabase.js";
import { createInventoryRepository } from "./inventoryRepository.js";

export const inventoryRepository = createInventoryRepository(supabase);
