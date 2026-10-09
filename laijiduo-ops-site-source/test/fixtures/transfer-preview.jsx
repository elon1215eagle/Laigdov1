// Development fixture only. Never part of the production entry.
import React from 'react';
import { createRoot } from 'react-dom/client';
import TransferCenter from '../../src/modules/transfers/TransferCenter.jsx';
import '../../src/styles.css';
const hq = new URLSearchParams(location.search).has('hq');
const actor = { id: 'fixture', name: '測試操作人', store: new URLSearchParams(location.search).get('store') || 'S01', is_hq: hq };
const stores = [{ code: 'S01', name: '鳳山五甲店' }, { code: 'S02', name: '鳳山凱旋店' }, { code: 'S03', name: '鳳山武廟店' }];
const products = [ ['雞翅','肉品',['箱','包']], ['雞腿','肉品',['箱','包']], ['雞排','肉品',['箱','包']], ['地瓜','點心',['箱','包']], ['雞皮','點心',['支']], ['花枝丸','點心',['包']], ['耐炸油','南北貨',['桶']], ['洗碗手套','五金',['雙']] ].map(([name,category,units],i) => ({ id: `p${i}`, name, category, units, code: `TR-${i}`, stores: stores.map(s=>s.code), active: true, spec: '', sort_order: i, version: 1 }));
let rows = [{ id:'r1', number:1, sender:'S02',receiver:'S01',status:'shipped',version:2,created_at:new Date().toISOString(), data:{date:'2026-09-09',requester:'測試',sender_name:'鳳山凱旋店',receiver_name:'鳳山五甲店',lines:[{...products[0],product_id:'p0',quantity:2,unit:'箱'}],shipped:[{...products[0],product_id:'p0',quantity:2,unit:'箱'}]},events:[] }];
products.push({ id: 'pork', code: 'TR-MEAT-PORK-CHOP', name: '排骨', category: '肉品', units: ['箱','包'], stores: ['S01','S02','S08'], sender_stores: ['S01'], receiver_stores: ['S02','S08'], active: true, spec: '', sort_order: 8, version: 1 });
const repository = { async call(action,p={}) {
 if(action==='bootstrap') return structuredClone({actor,stores,senders:[{code:'HQ',name:'總部'},...stores],products:products.map(p=>({...p,units:[...p.units,'公斤'],sender_stores:['HQ',...(p.sender_stores||p.stores)]}))});
 if(action==='product_history') return [];
 if(action==='list') return structuredClone(rows.filter(r=>!p.status||r.status===p.status));
 if(action==='detail') return structuredClone(rows.find(r=>r.id===p.id));
 if(action==='product') {Object.assign(products.find(x=>x.id===p.id),p);return p;}
 if(action==='create'){ const r={id:p.id,number:rows.length+1,sender:p.sender,receiver:p.receiver,status:'requested',version:1,created_at:new Date().toISOString(),data:{...p,requester:actor.name,sender_name:p.sender==='HQ'?'總部':stores.find(s=>s.code===p.sender).name,receiver_name:stores.find(s=>s.code===p.receiver).name,lines:p.lines.map(l=>({...products.find(x=>x.id===l.product_id),...l}))},events:[]}; rows.push(r); return structuredClone(r); }
 const r=rows.find(r=>r.id===p.id);
 if(action==='receive') {r.status=p.lines.some(l=>l.quantity!==r.data.shipped.find(x=>x.product_id===l.product_id).quantity)?'disputed':'completed';r.data.received=p.lines.map(l=>({...r.data.shipped.find(x=>x.product_id===l.product_id),...l}));}
 if(action==='cancel') r.status='cancelled';
 r.version++;r.events.push({id:r.events.length+1,actor_name:actor.name,action,reason:p.reason,created_at:new Date().toISOString(),after_state:structuredClone(r)});
 return structuredClone(r);
} };
createRoot(document.getElementById('root')).render(<div className="store-manager-app"><TransferCenter repository={repository}/></div>);
