import { photoError, saveRepairPhoto } from './attachments.js';
import { newPhotoJob } from './photoStorage.js';

// One user action, with durable identities for prepare, uploads and final save.
export function createSimpleRepairSubmission({repository,photoStorage,journal,actorId,legacy}) {
  let busy=false;
  const pending=()=>journal.get(actorId);
  async function run(record) {
    if(record.kind!=='simple')return legacy.retry();
    const ticket=await repository.command('prepare',record.prepare);
    for(const photo of record.photos)await saveRepairPhoto(photoStorage,{...photo.job,ticketId:ticket.id},photo.file);
    const result=await repository.command('save',{...record.form,id:ticket.id,version:ticket.version,command_id:record.finalId});
    await journal.remove(actorId);
    return result;
  }
  return {pending,
    async submit(form,groups) {
      if(busy)throw new Error('正在保存');busy=true;
      try {
        if(await pending())throw new Error('請先接續上一筆保存');
        const existing=form.id?await photoStorage.list(form.id):[];
        const photos=[];
        for(const purpose of ['report','completion','receipt']) {
          const files=groups[purpose]||[]; const error=photoError(files);if(error)throw new Error(error);
          if(existing.filter(f=>f.purpose===purpose).length+files.length>5)throw new Error('每類照片合計最多 5 張，請減少本次選擇');
          for(const file of files)photos.push({file,job:{...await newPhotoJob(form.id||'pending',file),purpose}});
        }
        const record={kind:'simple',actorId,form:{...form},finalId:crypto.randomUUID(),photos,
          prepare:{...form,command_id:crypto.randomUUID(),photo_manifest:photos.map(({file,job})=>({id:job.id,purpose:job.purpose,name:file.name,mime:file.type,size:file.size,fingerprint:job.fingerprint}))}};
        await journal.put(actorId,record);
        return await run(record);
      } finally {busy=false;}
    },
    async retry(){if(busy)throw new Error('正在保存');busy=true;try{const record=await pending();if(!record)throw new Error('沒有待保存資料');return await run(record);}finally{busy=false;}},
  };
}
