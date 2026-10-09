import React, { useMemo } from 'react';
import { supabase } from '../../lib/supabase.js';
import RepairPage from './SimpleRepairPage.jsx';
import { createSimpleRepairSubmission } from './simpleSubmission.js';
import { createRepairRepository } from './repository.js';
import { createRepairCommands } from './commands.js';
import { createRepairPhotoStorage } from './photoStorage.js';
import { createRepairJournal, createRepairSubmission } from './submission.js';

export default function RepairModule({ profile }) {
  const services = useMemo(() => {
    if (!profile?.id || !supabase) return null;
    try {
      const repository = createRepairRepository(supabase,'ops_repair_simple_api');
      const photoStorage = createRepairPhotoStorage(supabase);
      const actorId = profile.id;
      const journal = createRepairJournal();
      const legacy = createRepairSubmission({repository:createRepairRepository(supabase),photoStorage,journal,actorId});
      const oldCommands = createRepairCommands({repository:createRepairRepository(supabase),storage:window.sessionStorage,actorId});
      const newCommands = createRepairCommands({repository,storage:window.sessionStorage,actorId:`simple:${actorId}`});
      return { repository, photoStorage,
        commands: { pending:()=>oldCommands.pending()||newCommands.pending(),
          retry:()=>oldCommands.pending()?oldCommands.retry():newCommands.retry(),
          send:(action,payload)=>{if(oldCommands.pending())throw new Error('請先確認上一筆操作結果');return newCommands.send(action,payload);}},
        submission: createSimpleRepairSubmission({ repository, photoStorage, journal, actorId, legacy }),
      };
    } catch { return null; }
  }, [profile?.id]);
  return services ? <RepairPage {...services}/> : <p role="alert">無法啟用報修，請確認登入及瀏覽器儲存權限後重新載入。</p>;
}
