import React, { useEffect, useState } from 'react';
import { photoError } from './attachments.js';

function Photo({ file, remove }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return <figure className="rp-photo">
    {url && <img src={url} alt={file.name} />}
    <button type="button" className="rp-photo-remove" title="移除照片" aria-label={`移除照片 ${file.name}`} onClick={remove}>×</button>
    <figcaption>{file.name}<span>尚未上傳</span></figcaption>
  </figure>;
}

export default function RepairPhotos({ files, onChange, title = '現場照片' }) {
  const [error, setError] = useState('');
  function choose(event) {
    const added = Array.from(event.target.files || []);
    const next = [...files, ...added];
    const message = photoError(next);
    event.target.value = '';
    setError(message);
    if (!message) onChange(next);
  }
  return <fieldset className="rp-photo-field rp-full"><legend>{title}（選填）</legend>
    <div className="rp-photo-toolbar"><label className="rp-photo-picker">＋選擇照片<input aria-label={`加入${title}`} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choose} /></label><span>{files.length} / 5 張</span></div>
    <p className="rp-muted">JPG、PNG、WebP，每張最多 10 MB</p>
    {error && <p role="alert">{error}</p>}
    <div className="rp-photos">{files.map((file,i) => <Photo key={`${file.name}-${file.lastModified}-${i}`} file={file} remove={() => { onChange(files.filter((_,index) => index !== i)); setError(''); }} />)}</div>
  </fieldset>;
}
