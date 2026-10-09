// Null means the first successful read: show pending orders without calling them new.
export function comparePending(previous, orders) {
 const pending=orders.filter(order=>order.status==='pending');
 const ids=new Set(pending.map(order=>order.id));
 return {ids,count:pending.length,newCount:previous===null?0:pending.filter(order=>!previous.has(order.id)).length};
}
