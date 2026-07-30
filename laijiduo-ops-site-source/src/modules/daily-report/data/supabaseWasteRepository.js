import { supabase } from "../../../lib/supabase.js";
import { createWasteRepository } from "./wasteRepository.js";

export const wasteRepository = createWasteRepository(supabase);
