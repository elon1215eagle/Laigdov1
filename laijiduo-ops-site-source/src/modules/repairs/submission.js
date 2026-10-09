import { photoError, saveRepairPhoto } from './attachments.js';
import { repairDraftError } from './domain.js';
import { newPhotoJob } from './photoStorage.js';

// Store both the immutable command and photo bytes before the first server write.
export function createRepairSubmission({ repository, photoStorage, journal, actorId }) {
  if (!actorId) throw new Error('缺少登入身分');
  let busy = false;
  async function read() {
    const record = await journal.get(actorId);
    if (record && (record.actorId !== actorId || !record.command?.command_id || !Array.isArray(record.photos))) throw new Error('待送出資料不完整');
    return record;
  }
  async function resume(record) {
    // Repeating this exact command also recovers a successful write with a lost response.
    const ticket = record.kind === 'attach' ? (await repository.detail(record.ticketId)).ticket : await repository.command('create', record.command);
    if (!ticket?.id || !Number.isInteger(ticket.version)) throw new Error('報修單結果待確認');
    for (const photo of record.photos) {
      await saveRepairPhoto(photoStorage, { ...photo.job, ticketId: ticket.id }, photo.file);
    }
    await journal.remove(actorId);
    return ticket;
  }
  return {
    pending: read,
    async attach(ticketId, purpose, files) {
      if (busy) throw new Error('正在送出');
      busy = true;
      try {
        if (await read()) throw new Error('請先接續上一筆照片');
        const error = photoError(files);
        if (error || !files.length) throw new Error(error || '請選擇照片');
        if (!['completion','receipt'].includes(purpose)) throw new Error('照片類別不正確');
        const existing = await photoStorage.list(ticketId);
        if (existing.length + files.length > 5) throw new Error('每筆報修合計最多 5 張照片');
        const photos = [];
        for (const file of files) photos.push({ file, job: { ...await newPhotoJob(ticketId,file), purpose } });
        const record = { actorId, kind: 'attach', ticketId, command: { command_id: crypto.randomUUID() }, photos };
        await journal.put(actorId,record);
        return await resume(record);
      } finally { busy = false; }
    },
    async submit(draft, files) {
      if (busy) throw new Error('正在送出');
      busy = true;
      try {
        if (await read()) throw new Error('請先重試上一筆報修');
        const error = repairDraftError(draft) || photoError(files);
        if (error) throw new Error(error);
        const photos = [];
        for (const file of files) photos.push({ file, job: await newPhotoJob('pending', file) });
        const record = { actorId, command: { ...draft, command_id: crypto.randomUUID(),
          photo_manifest: photos.map(({file,job}) => ({ id:job.id, name:file.name, mime:file.type, size:file.size, fingerprint:job.fingerprint })) }, photos };
        await journal.put(actorId, record);
        return await resume(record);
      } finally { busy = false; }
    },
    async retry() {
      if (busy) throw new Error('正在送出');
      busy = true;
      try { const record=await read(); if (!record) throw new Error('沒有待確認報修'); return await resume(record); }
      finally { busy = false; }
    },
  };
}

export function createRepairJournal(factory = indexedDB) {
  async function transact(mode, operation) {
    const db = await new Promise((resolve,reject) => {
      const open=factory.open('ops-repair-submission',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('pending');
      open.onsuccess=()=>resolve(open.result); open.onerror=()=>reject(open.error);
      open.onblocked=()=>reject(new Error('報修暫存被其他分頁占用'));
    });
    try {
      return await new Promise((resolve,reject) => {
        const tx=db.transaction('pending',mode);
        const request=operation(tx.objectStore('pending'));
        tx.oncomplete=()=>resolve(request.result);
        tx.onabort=()=>reject(tx.error || new Error('無法保存報修暫存'));
        tx.onerror=()=>reject(tx.error || new Error('無法保存報修暫存'));
      });
    } finally { db.close(); }
  }
  return { get:key=>transact('readonly',s=>s.get(key)),put:(key,value)=>transact('readwrite',s=>s.put(value,key)),remove:key=>transact('readwrite',s=>s.delete(key)) };
}
