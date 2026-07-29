import { supabase } from "../../../lib/supabase.js";
import { createScheduleRepository } from "./scheduleRepository.js";

export const scheduleRepository = createScheduleRepository(supabase);
