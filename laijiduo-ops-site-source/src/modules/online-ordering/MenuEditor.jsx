import {menuError} from './menuEditor.js';
export default function MenuEditor({value,onChange,disabled=false}){
 let products;try{products=JSON.parse(value);if(!Array.isArray(products))throw new Error()}catch{return <p role="alert">菜單資料格式有誤，請重新載入目前菜單。</p>}
 function update(index,key,value){onChange(JSON.stringify(products.map((p,i)=>i===index?{...p,[key]:value}:p),null,2))}
 const error=menuError(products);
 return <div className="menu-editor">
  <p>先建立餐點，再核對價格。商品代碼發布後應保持不變。尚未匯入內部商品主檔。</p>
  {products.map((p,i)=><fieldset key={i} className="menu-product" disabled={disabled}><legend>餐點 {i+1}｜{p.name||'新餐點'}</legend>
   <div className="menu-fields"><label>商品代碼<input value={p.code||''} maxLength={60} onChange={e=>update(i,'code',e.target.value)} /></label>
   <label>餐點名稱<input value={p.name||''} maxLength={60} onChange={e=>update(i,'name',e.target.value)} /></label>
   <label>售價（元）<input type="number" min={1} max={10000} step={1} value={p.price??''} onChange={e=>update(i,'price',e.target.value===''?'':Number(e.target.value))} /></label>
   <label>分類<input value={p.category||''} maxLength={40} placeholder="例如：經典炸雞" onChange={e=>update(i,'category',e.target.value)} /></label></div>
   <label>餐點說明<textarea value={p.description||''} maxLength={300} rows={2} onChange={e=>update(i,'description',e.target.value)} /></label>
   <label>照片網址<input type="url" value={p.image_url||''} placeholder="https://…（正式照片須核准）" onChange={e=>update(i,'image_url',e.target.value)} /></label>
   <div className="online-toolbar"><label><input type="checkbox" checked={Boolean(p.featured)} onChange={e=>update(i,'featured',e.target.checked)} />人氣餐點</label><label><input type="checkbox" checked={Boolean(p.sold_out)} onChange={e=>update(i,'sold_out',e.target.checked)} />售完</label>
   <button type="button" onClick={()=>onChange(JSON.stringify(products.filter((_,n)=>n!==i),null,2))}>移除此餐點</button></div>
   {p.option_groups?.length>0&&<p className="menu-option-note">已保留選項：{p.option_groups.map(g=>`${g.name}（${g.required?'必選':'選填'}：${g.choices.map(c=>c.label).join('／')}）`).join('；')}。編輯餐點不會清除既有規格。</p>}
  </fieldset>)}
  <button type="button" disabled={disabled||products.length>=100} onClick={()=>onChange(JSON.stringify([...products,{code:'',name:'',price:'',category:'',sold_out:false}],null,2))}>＋ 新增餐點</button>
  {error&&<p className="menu-validation" role="status">{error}</p>}
 </div>
}
