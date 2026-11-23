/** Payment/treasury regression vs seeded dev server (piastres). Wipe .devdata before running. */
const API='http://127.0.0.1:4000/api';const H={authorization:'Bearer dev-session-token-0123456789','content-type':'application/json'};
const g=async(p,o={})=>{const r=await fetch(API+p,{headers:H,...o});return {s:r.status,b:await r.json().catch(()=>null)};};
let bad=0;const ck=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));if(!c)bad++;};
const sumFor=async(id)=>{const c=(await g('/treasury/capital/transactions')).b.data.filter(t=>t.refType==='repair'&&t.refId===id);const p=(await g('/treasury/profits/transactions')).b.data.filter(t=>t.refType==='repair'&&t.refId===id);const s=a=>a.reduce((x,t)=>x+t.amount,0);return {cap:s(c),pro:s(p),capN:c.length,proN:p.length};};
(async()=>{
 const rep=(await g('/repairs')).b.data.find(x=>x.status==='in_repair'); const id=rep.id;
 const d0=(await g('/repairs/'+id)).b.data; const total=d0.repair.total; const cost=d0.items.reduce((a,i)=>a+i.quantity*(i.unitCost??i.costAtTime??0),0);
 const paid0=d0.payments.reduce((a,p)=>a+p.amount,0); const t0=await sumFor(id);
 console.log({total,cost,paid0,t0});
 // cross cost: pay enough that paid > cost
 const need=cost-paid0; const pay=need+5000; 
 const r1=await g('/repairs/'+id+'/payments',{method:'POST',body:JSON.stringify({amount:pay})});
 ck('payment crossing cost accepted',r1.s===200||r1.s===201,'status '+r1.s);
 const d1=(await g('/repairs/'+id)).b.data; const paid1=d1.payments.reduce((a,p)=>a+p.amount,0); const t1=await sumFor(id);
 ck('paid sum increased by exactly the payment',paid1===paid0+pay);
 ck('capital+profit == paid',t1.cap+t1.pro===paid1,`cap ${t1.cap} pro ${t1.pro}`);
 ck('capital capped at parts cost',t1.cap===cost);
 ck('excess over cost went to profit',t1.pro===paid1-cost,`profit ${t1.pro}`);
 ck('exactly one new row per treasury side as needed (no duplicates)',(t1.capN-t0.capN)<=1&&(t1.proN-t0.proN)===1);
 // overpayment
 const remaining=total-paid1;
 const nBefore=d1.payments.length;
 const r2=await g('/repairs/'+id+'/payments',{method:'POST',body:JSON.stringify({amount:remaining+1})});
 ck('overpayment rejected 409 OVERPAYMENT',r2.s===409&&r2.b?.error?.code==='OVERPAYMENT',`status ${r2.s}`);
 const d2=(await g('/repairs/'+id)).b.data; const t2=await sumFor(id);
 ck('overpayment left no payment row',d2.payments.length===nBefore);
 ck('overpayment left no treasury rows',t2.cap===t1.cap&&t2.pro===t1.pro&&t2.capN===t1.capN&&t2.proN===t1.proN);
 // exact settle
 const r3=await g('/repairs/'+id+'/payments',{method:'POST',body:JSON.stringify({amount:remaining})});
 const d3=(await g('/repairs/'+id)).b.data; const paid3=d3.payments.reduce((a,p)=>a+p.amount,0); const t3=await sumFor(id);
 ck('exact settlement accepted, paid==total',r3.s<300&&paid3===total);
 ck('final capital+profit==total',t3.cap+t3.pro===total);
 const r4=await g('/repairs/'+id+'/payments',{method:'POST',body:JSON.stringify({amount:1})});
 ck('payment on fully paid repair rejected',r4.s===409);
 process.exit(bad?1:0);
})();
