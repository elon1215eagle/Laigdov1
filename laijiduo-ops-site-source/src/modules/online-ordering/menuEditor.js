export function menuError(products){
 if(!Array.isArray(products)||products.length<1||products.length>100)return '請建立 1–100 道餐點。';
 const codes=new Set();
 for(const [index,p] of products.entries()){
  const prefix=`第 ${index+1} 道餐點：`;
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(p.code||''))return prefix+'商品代碼請用英文、數字、底線或連字號。';
  if(codes.has(p.code))return prefix+'商品代碼重複。';codes.add(p.code);
  if(typeof p.name!=='string'||!p.name.trim()||[...p.name.trim()].length>60)return prefix+'名稱必填，最多 60 字。';
  if(!/^\d+$/.test(String(p.price))||!Number.isSafeInteger(Number(p.price))||Number(p.price)<1||Number(p.price)>10000)return prefix+'價格須為 1–10,000 元整數。';
  if(p.image_url&&!/^https:\/\//i.test(p.image_url)&&!/^\/images\//.test(p.image_url))return prefix+'照片請使用 HTTPS 網址或 /images/ 路徑。';
 }
 return '';
}
