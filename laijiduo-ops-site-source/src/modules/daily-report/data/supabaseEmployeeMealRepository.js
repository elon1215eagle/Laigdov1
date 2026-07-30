import { supabase } from "../../../lib/supabase.js";
import { createEmployeeMealRepository } from "./employeeMealRepository.js";

export const employeeMealRepository = createEmployeeMealRepository(supabase);
