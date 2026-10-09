export const PHOTO_LIMIT = 5;
export const PHOTO_BYTES = 10 * 1024 * 1024;
const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export function photoError(files) {
  if (files.length > PHOTO_LIMIT) return '最多可加入 5 張照片';
  if (files.some(file => !mimeTypes.has(file.type))) return '請選擇 JPG、PNG 或 WebP 照片';
  if (files.some(file => file.size <= 0 || file.size > PHOTO_BYTES)) return '每張照片須小於 10 MB，且不可為空檔案';
  return '';
}

// Each stage is retryable under one upload identity. Never delete after an uncertain result.
// Adapter must enforce identity, file signature, size and ticket access on the server.
export async function saveRepairPhoto(adapter, job, file) {
  const error = photoError([file]);
  if (error) throw new Error(error);
  if (!job?.id || !job?.ticketId || !job?.fingerprint) throw new Error('缺少照片上傳識別');
  const slot = await adapter.reserve({ ...job, name: file.name, mime: file.type, size: file.size });
  if (slot?.id !== job.id || slot.fingerprint !== job.fingerprint) throw new Error('照片登記結果不符，請重新查核');
  if (slot.state === 'available') return slot;
  if (!['reserved', 'uploaded'].includes(slot.state)) throw new Error('照片狀態待確認');
  if (slot.state === 'reserved') await adapter.upload(slot, file);
  const confirmed = await adapter.confirm(job);
  if (confirmed?.id !== job.id || confirmed.state !== 'available' || confirmed.fingerprint !== job.fingerprint) {
    throw new Error('照片尚未確認保存，請重試原照片');
  }
  return confirmed;
}
