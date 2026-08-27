const money=n=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2}).format(Number(n||0));
const num=v=>Number(v)||0;

function setText(element,value){
  if(element&&element.textContent!==value)element.textContent=value;
}

function updatePrimaryCashRow(){
  const state=globalThis.__presupuestoOnlineState;
  if(!state||!Array.isArray(state.accounts))return;

  const primaryIndex=state.accounts.findIndex(a=>a.type==='cash');
  if(primaryIndex<0)return;
  const primary=state.accounts[primaryIndex];

  const month=document.querySelector('#month')?.value;
  const half=document.querySelector('#half')?.value;
  if(!month||!half)return;

  const p=state.periods?.[`${month}|${half}`]||{incomes:[],expenses:[],payments:[]};
  const expenses=Array.isArray(p.expenses)?p.expenses:[];
  const incomes=Array.isArray(p.incomes)?p.incomes:[];
  const paymentsList=Array.isArray(p.payments)?p.payments:[];

  const expenseCharges=expenses
    .filter(x=>x.account===primary.id)
    .reduce((sum,x)=>sum+num(x.amount),0);
  const incomeInflows=incomes
    .filter(x=>x.received&&x.account===primary.id)
    .reduce((sum,x)=>sum+num(x.amount),0);
  const incomingTransfers=paymentsList
    .filter(x=>x.paid&&x.internal&&x.account===primary.id)
    .reduce((sum,x)=>sum+num(x.amount),0);
  const outgoingTransfers=paymentsList
    .filter(x=>x.paid&&x.internal&&x.sourceAccount===primary.id)
    .reduce((sum,x)=>sum+num(x.amount),0);
  const regularPayments=paymentsList
    .filter(x=>x.paid&&!x.internal&&x.account===primary.id)
    .reduce((sum,x)=>sum+num(x.amount),0);

  const entries=incomeInflows+incomingTransfers;
  const exits=expenseCharges+regularPayments+outgoingTransfers;
  const balance=entries-exits;

  const rows=[...document.querySelectorAll('table.accounts tbody tr')];
  const row=rows[primaryIndex];
  if(!row)return;
  const cells=row.children;
  if(cells.length<5)return;

  // La cuenta principal es una bolsa de distribución de cada quincena:
  // nunca arrastra saldo anterior. Ahorros y tarjetas conservan su arrastre normal.
  setText(cells[1],money(0));
  setText(cells[2],money(entries));
  setText(cells[3],money(exits));
  setText(cells[4].querySelector('b')||cells[4],money(balance));
}

export function installPrimaryCashBalanceFix(){
  const app=document.querySelector('#app');
  if(!app)return;

  let pending=false;
  const schedule=()=>{
    if(pending)return;
    pending=true;
    requestAnimationFrame(()=>{
      pending=false;
      updatePrimaryCashRow();
    });
  };

  const observer=new MutationObserver(schedule);
  observer.observe(app,{childList:true,subtree:true});
  schedule();
}
