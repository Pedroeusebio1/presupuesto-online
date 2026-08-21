import { loadState, saveState, uid } from './store.js';
import { localToday, parseLocalDate, isoDate, daysBetween, nextCut, nextDue, friendlyDate, latestCutOnOrBefore, dueDateForCut } from './dates.js';

const app=document.querySelector('#app');
let state=loadState();
const now=localToday();
let period=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}|${now.getDate()<=15?'1':'2'}`;
const money=n=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2}).format(Number(n||0));
const num=v=>Number(v)||0;
const parseMoney=v=>{
  let s=String(v??'').trim().replace(/\s/g,'').replace(/RD\$/gi,'');
  if(!s)return 0;
  if(s.includes(',')&&s.includes('.')) s=s.replace(/,/g,'');
  else if(s.includes(',')){
    const p=s.split(',');
    s=p.length===2&&p[1].length<=2?`${p[0]}.${p[1]}`:s.replace(/,/g,'');
  }
  s=s.replace(/[^0-9.-]/g,'');
  return Number(s)||0;
};
const accountingNumber=n=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(parseMoney(n));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const account=id=>state.accounts.find(a=>a.id===id);
const assetAccounts=()=>state.accounts.filter(a=>a.type==='cash'||a.type==='savings');
const primaryAssetId=(exclude='')=>assetAccounts().find(a=>a.type==='cash'&&a.id!==exclude)?.id||assetAccounts().find(a=>a.id!==exclude)?.id||'';
const validTransferSource=(id,destination='')=>Boolean(id&&id!==destination&&assetAccounts().some(a=>a.id===id));

function normalize(){
  state.settings||={browserNotifications:false};
  state.statements||=[];
  state.accounts=Array.isArray(state.accounts)?state.accounts:[];
  state.periods||={};
  const primary=primaryAssetId();
  Object.values(state.periods).forEach(p=>{
    p.incomes||=[];p.expenses||=[];p.payments||=[];
    p.incomes.forEach(x=>{
      const destination=account(x.account);
      if(!destination||destination.type==='credit')x.account=primary;
    });
    p.payments.forEach(x=>{
      const destination=account(x.account);
      if(typeof x.internal!=='boolean'){
        x.internal=Boolean(primary&&destination&&destination.id!==primary&&(destination.type==='credit'||destination.type==='savings'));
      }
      if(x.internal){
        if(!validTransferSource(x.sourceAccount,x.account))x.sourceAccount=primaryAssetId(x.account);
        if(!x.sourceAccount)x.internal=false;
      }else x.sourceAccount='';
    });
  });
  saveState(state);
}
function data(key=period){if(!state.periods[key])state.periods[key]={incomes:[],expenses:[],payments:[]};return state.periods[key]}
function parts(key=period){const [ym,q]=key.split('|');const [y,m]=ym.split('-').map(Number);return{ym,q:Number(q),y,m}}
function bounds(key=period){const {y,m,q}=parts(key);return{start:q===1?new Date(y,m-1,1):new Date(y,m-1,16),end:q===1?new Date(y,m-1,15):new Date(y,m,0)}}
function prevKey(key=period){const {y,m,q}=parts(key);if(q===2)return`${y}-${String(m).padStart(2,'0')}|1`;const d=new Date(y,m-2,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}|2`}
function nextKey(key=period){const {y,m,q}=parts(key);if(q===1)return`${y}-${String(m).padStart(2,'0')}|2`;const d=new Date(y,m,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}|1`}
function periodIndex(key){const {y,m,q}=parts(key);return y*24+(m-1)*2+(q-1)}
function previousStoredPeriodKey(key){
  const target=periodIndex(key);
  return Object.keys(state.periods)
    .filter(k=>k!==key&&periodIndex(k)<target)
    .sort((a,b)=>periodIndex(b)-periodIndex(a))[0]||null;
}
function allExpenses(){return Object.values(state.periods).flatMap(p=>p.expenses||[])}
function allPayments(){return Object.values(state.periods).flatMap(p=>p.payments||[])}
function balanceAt(id,date=null){
  const a=account(id);if(!a)return 0;
  const max=date?new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59):null;
  const charges=allExpenses().filter(x=>x.account===id&&(!max||(parseLocalDate(x.date)||new Date(0))<=max)).reduce((s,x)=>s+num(x.amount),0);
  const paid=allPayments().filter(x=>x.account===id&&x.paid&&x.paidDate&&(!max||parseLocalDate(x.paidDate)<=max)).reduce((s,x)=>s+num(x.amount),0);
  return Math.max(0,num(a.baseBalance)+charges-paid);
}
function accountSummaryForPeriod(a,key,seen=new Set()){
  const p=state.periods[key]||{incomes:[],expenses:[],payments:[]};
  let opening=a.type==='credit'?-Math.abs(num(a.baseBalance)):num(a.baseBalance);
  const previous=previousStoredPeriodKey(key);
  if(previous&&!seen.has(previous)){
    const nextSeen=new Set(seen);
    nextSeen.add(key);
    opening=accountSummaryForPeriod(a,previous,nextSeen).projected;
  }

  const expenseCharges=(p.expenses||[]).filter(x=>x.account===a.id).reduce((s,x)=>s+num(x.amount),0);
  const incomeInflows=(p.incomes||[]).filter(x=>x.received&&x.account===a.id).reduce((s,x)=>s+num(x.amount),0);
  const incomingTransfers=(p.payments||[]).filter(x=>x.paid&&x.internal&&x.account===a.id).reduce((s,x)=>s+num(x.amount),0);
  const outgoingTransfers=(p.payments||[]).filter(x=>x.paid&&x.internal&&x.sourceAccount===a.id).reduce((s,x)=>s+num(x.amount),0);
  const regularPayments=(p.payments||[]).filter(x=>x.paid&&!x.internal&&x.account===a.id).reduce((s,x)=>s+num(x.amount),0);

  let charges=0,payments=0,projected=opening;
  if(a.type==='credit'){
    charges=expenseCharges;
    payments=incomingTransfers+regularPayments;
    projected=Math.min(0,opening-charges+payments);
  }else{
    charges=incomeInflows+incomingTransfers;
    payments=expenseCharges+regularPayments+outgoingTransfers;
    projected=opening+charges-payments;
  }
  return{opening,charges,payments,projected};
}
function accountSummary(a){return accountSummaryForPeriod(a,period)}
function options(selected){return state.accounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}
function assetOptions(selected,exclude=''){
  const list=assetAccounts().filter(a=>a.id!==exclude);
  return`${list.length?'<option value="">Selecciona origen</option>':'<option value="">Sin cuenta origen</option>'}${list.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('')}`;
}
function amount(row){return`<div class="money-input"><span>RD$</span><input data-field="amount" data-money type="text" inputmode="decimal" autocomplete="off" value="${accountingNumber(row.amount)}"></div>`}
function bindMoneyInputs(root=document){
  root.querySelectorAll('[data-money]').forEach(i=>{
    i.onfocus=()=>{i.value=parseMoney(i.value).toFixed(2);requestAnimationFrame(()=>i.select())};
    i.onblur=()=>{if(document.body.contains(i))i.value=accountingNumber(i.value)};
  });
}

function createStatements(){
  const today=localToday();
  state.accounts.filter(a=>a.type==='credit'&&a.cutDay&&a.dueDay).forEach(card=>{
    const cut=latestCutOnOrBefore(card,today),cutIso=isoDate(cut);
    if(cut<=today&&!state.statements.some(s=>s.cardId===card.id&&s.cutDate===cutIso)){
      state.statements.push({id:uid(),cardId:card.id,cutDate:cutIso,dueDate:isoDate(dueDateForCut(cut,card.dueDay)),amount:balanceAt(card.id,cut),paid:false,paidDate:''});
    }
  });
  saveState(state);
}
function alerts(){
  const today=localToday(),out=[];
  state.accounts.filter(a=>a.type==='credit').forEach(card=>{
    if(!card.cutDay||!card.dueDay){out.push({kind:'setup',card,days:999});return}
    const unpaid=state.statements.filter(s=>s.cardId===card.id&&!s.paid).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
    if(unpaid){const d=parseLocalDate(unpaid.dueDate),days=daysBetween(today,d);if(days<=7)out.push({kind:'due',card,date:d,days,amount:unpaid.amount,id:unpaid.id})}
    const cut=nextCut(card,today),days=daysBetween(today,cut);
    if(days<=7)out.push({kind:'cut',card,date:cut,days,amount:balanceAt(card.id)});
  });
  return out.sort((a,b)=>a.days-b.days).slice(0,5);
}
function alertHtml(a){
  if(a.kind==='setup')return`<div class="notice warn"><b>Configura ${esc(a.card.name)}</b><span>Falta corte o fecha límite.</span><button data-edit="${a.card.id}">Configurar</button></div>`;
  const when=a.days<0?`${Math.abs(a.days)} días vencido`:a.days===0?'hoy':a.days===1?'mañana':`en ${a.days} días`;
  return`<div class="notice ${a.days<=1?'danger':'warn'}"><b>${esc(a.card.name)} ${a.kind==='cut'?'corta':'vence'} ${when}</b><span>${friendlyDate(a.date)} · ${money(a.amount)}</span>${a.id?`<button data-statement="${a.id}">Marcar pagado</button>`:''}</div>`;
}

function render(){
  const p=data(),{ym,q}=parts();
  const month=new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-DO',{month:'long',year:'numeric'});
  const income=p.incomes.reduce((s,x)=>s+num(x.amount),0),expenses=p.expenses.reduce((s,x)=>s+num(x.amount),0),payments=p.payments.reduce((s,x)=>s+num(x.amount),0);
  const direct=p.expenses.filter(x=>account(x.account)?.type==='cash').reduce((s,x)=>s+num(x.amount),0);
  const free=income-payments-direct;
  const notices=alerts();
  app.innerHTML=`
<main class="simple-shell">
<header><div><small>PRESUPUESTO PERSONAL</small><h1>${q===1?'1ra.':'2da.'} Quincena · ${month}</h1><p>Guardado automáticamente</p></div><div class="period"><button id="prev">←</button><input id="month" type="month" value="${ym}"><select id="half"><option value="1" ${q===1?'selected':''}>1ra.</option><option value="2" ${q===2?'selected':''}>2da.</option></select><button id="next">→</button></div></header>
<section class="notices">${notices.length?notices.map(alertHtml).join(''):'<div class="notice ok"><b>Todo bajo control</b><span>No hay cortes o pagos urgentes.</span></div>'}</section>
<section class="totals"><div><span>Ingresos</span><b>${money(income)}</b></div><div><span>Pagos / salidas</span><b>${money(payments+direct)}</b></div><div><span>Saldo disponible</span><b class="${free>=0?'good':'bad'}">${money(free)}</b></div></section>
${section('income','Ingresos','Todo lo que entra en esta quincena.',incomeTable(p.incomes,income),'+ Ingreso')}
${section('expense','Gastos necesarios para esta quincena','Elige con qué pagarás cada gasto.',expenseTable(p.expenses,expenses),'+ Gasto')}
${section('payment','Pagos','Usa “Transferencia interna” cuando el dinero sale de una cuenta tuya hacia otra.',paymentTable(p.payments,payments),'+ Pago')}
<section class="balance ${free<0?'negative':''}"><div><b>Saldo disponible después de esta quincena</b><span>Ingresos menos pagos y gastos directos</span></div><strong>${money(free)}</strong></section>
<section class="box"><div class="box-head"><div><h2>Tarjetas y cuentas</h2><p>Las cuentas y ahorros crecen en positivo; las tarjetas muestran en negativo lo que debes.</p></div><button id="addAccount">+ Cuenta</button></div>${accountsTable()}</section>
<footer><button id="copy">Copiar quincena anterior</button><button id="notify">${state.settings.browserNotifications?'Avisos activos':'Activar avisos'}</button><button id="export">Exportar</button><label>Importar<input id="import" type="file" accept=".json" hidden></label><button id="save" class="primary">Guardar</button></footer>
</main>`;
  bind();
  notifyIfNeeded();
}
function section(kind,title,subtitle,table,button){return`<section class="box"><div class="box-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button data-add="${kind}">${button}</button></div>${table}</section>`}
function incomeTable(rows,total){return`<div class="table"><table><thead><tr><th>Ingreso</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr data-kind="income" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td>${amount(r)}</td><td><input data-field="date" type="date" value="${r.date||''}"></td><td><button class="status ${r.received?'on':''}" data-toggle="received">${r.received?'Recibido':'Pendiente'}</button></td><td><button data-delete>✕</button></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>${money(total)}</td><td colspan="3"></td></tr></tfoot></table></div>`}
function expenseTable(rows,total){return`<div class="table"><table><thead><tr><th>Gasto</th><th>Monto</th><th>Método</th><th>Corte</th><th>Pago límite</th><th></th></tr></thead><tbody>${rows.map(r=>{const a=account(r.account);return`<tr data-kind="expense" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td>${amount(r)}</td><td><select data-field="account">${options(r.account)}</select></td><td>${a?.type==='credit'&&a.cutDay?`Día ${a.cutDay}`:'—'}</td><td>${a?.type==='credit'&&a.dueDay?`Día ${a.dueDay}`:'—'}</td><td><button data-delete>✕</button></td></tr>`}).join('')}</tbody><tfoot><tr><td>Total</td><td>${money(total)}</td><td colspan="4"></td></tr></tfoot></table></div>`}
function paymentTable(rows,total){return`<div class="table"><table><thead><tr><th>Pago</th><th>Monto</th><th>Destino</th><th>Fecha límite</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr data-kind="payment" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td>${amount(r)}</td><td><div style="display:grid;gap:6px"><select data-field="account">${options(r.account)}</select><select data-field="internal"><option value="false" ${!r.internal?'selected':''}>Pago normal</option><option value="true" ${r.internal?'selected':''}>Transferencia interna</option></select>${r.internal?`<small>Desde</small><select data-field="sourceAccount">${assetOptions(r.sourceAccount,r.account)}</select>`:''}</div></td><td><input data-field="due" type="date" value="${r.due||''}"></td><td><button class="status ${r.paid?'on':''}" data-toggle="paid">${r.paid?'Pagado':'Pendiente'}</button></td><td><button data-delete>✕</button></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td>${money(total)}</td><td colspan="4"></td></tr></tfoot></table></div>`}
function accountsTable(){return`<div class="table"><table class="accounts"><thead><tr><th>Cuenta</th><th>Anterior</th><th>Entradas / cargos</th><th>Salidas / pagos</th><th>Saldo</th><th>Próximo evento</th><th></th></tr></thead><tbody>${state.accounts.map(a=>{const s=accountSummary(a);let event='—';if(a.type==='credit'&&a.cutDay&&a.dueDay)event=`Corte ${friendlyDate(nextCut(a))}<small>Pago ${friendlyDate(nextDue(a))}</small>`;else if(a.type==='credit')event='<span class="warn-text">Configurar</span>';return`<tr><td><b>${esc(a.name)}</b><small>${a.type==='credit'?'Tarjeta':a.type==='savings'?'Ahorro':'Efectivo / banco'}</small></td><td>${money(s.opening)}</td><td>${money(s.charges)}</td><td>${money(s.payments)}</td><td><b>${money(s.projected)}</b></td><td>${event}</td><td><button data-edit="${a.id}">Editar</button></td></tr>`}).join('')}</tbody></table></div>`}

function bind(){
  document.querySelector('#month').onchange=e=>{period=`${e.target.value}|${document.querySelector('#half').value}`;render()};
  document.querySelector('#half').onchange=e=>{period=`${document.querySelector('#month').value}|${e.target.value}`;render()};
  document.querySelector('#prev').onclick=()=>{period=prevKey();render()};
  document.querySelector('#next').onclick=()=>{period=nextKey();render()};
  document.querySelector('#copy').onclick=copyPrevious;
  document.querySelector('#notify').onclick=enableNotifications;
  document.querySelector('#addAccount').onclick=()=>editAccount();
  document.querySelector('#save').onclick=explicitSave;
  document.querySelector('#export').onclick=exportData;
  document.querySelector('#import').onchange=importData;
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addRow(b.dataset.add));
  document.querySelectorAll('tr[data-id] input,tr[data-id] select').forEach(i=>i.onchange=()=>updateRow(i.closest('tr'),i.dataset.field,i.value));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRow(b.closest('tr')));
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggle(b.closest('tr'),b.dataset.toggle));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editAccount(b.dataset.edit));
  document.querySelectorAll('[data-statement]').forEach(b=>b.onclick=()=>markPaid(b.dataset.statement));
  bindMoneyInputs();
}
function updateRow(tr,field,value){
  const p=data(),list=tr.dataset.kind==='income'?p.incomes:tr.dataset.kind==='expense'?p.expenses:p.payments,row=list.find(x=>x.id===tr.dataset.id);
  if(!row)return;
  if(field==='amount')row[field]=parseMoney(value);
  else if(field==='internal'){
    row.internal=value==='true';
    if(row.internal){
      if(!validTransferSource(row.sourceAccount,row.account))row.sourceAccount=primaryAssetId(row.account);
      if(!row.sourceAccount){row.internal=false;alert('Crea primero una cuenta de Efectivo / banco o Ahorro para usarla como origen.');}
    }else row.sourceAccount='';
  }else{
    row[field]=value;
    if(tr.dataset.kind==='payment'&&field==='account'&&row.internal&&!validTransferSource(row.sourceAccount,row.account))row.sourceAccount=primaryAssetId(row.account);
  }
  saveState(state);createStatements();render();
}
function toggle(tr,field){const p=data(),list=tr.dataset.kind==='income'?p.incomes:p.payments,row=list.find(x=>x.id===tr.dataset.id);if(!row)return;row[field]=!row[field];if(field==='paid')row.paidDate=row.paid?isoDate(localToday()):'';saveState(state);createStatements();render()}
function deleteRow(tr){const p=data(),list=tr.dataset.kind==='income'?p.incomes:tr.dataset.kind==='expense'?p.expenses:p.payments,i=list.findIndex(x=>x.id===tr.dataset.id);if(i>=0)list.splice(i,1);saveState(state);render()}
function addRow(kind){
  const p=data(),date=isoDate(bounds().end),primary=primaryAssetId();
  if(kind==='income')p.incomes.push({id:uid(),desc:'Nuevo ingreso',amount:0,date,received:false,account:primary});
  if(kind==='expense')p.expenses.push({id:uid(),desc:'Nuevo gasto',amount:0,account:state.accounts[0]?.id||'',date});
  if(kind==='payment'){
    const destination=state.accounts[0]?.id||'';
    const destinationAccount=account(destination);
    const internal=Boolean(primary&&destinationAccount&&destinationAccount.id!==primary&&(destinationAccount.type==='credit'||destinationAccount.type==='savings'));
    p.payments.push({id:uid(),desc:'Nuevo pago',amount:0,account:destination,due:date,paid:false,paidDate:'',internal,sourceAccount:internal?primaryAssetId(destination):''});
  }
  saveState(state);render();
}
function copyPrevious(){
  const old=state.periods[prevKey()];
  if(!old)return alert('No existe una quincena anterior guardada.');
  if((data().incomes.length||data().expenses.length||data().payments.length)&&!confirm('Esta quincena ya tiene datos. ¿Reemplazar solo ingresos, gastos y pagos? Los balances se conservarán.'))return;
  const date=isoDate(bounds().end),copy=x=>JSON.parse(JSON.stringify(x));
  state.periods[period]={
    ...state.periods[period],
    incomes:old.incomes.map(x=>({...copy(x),id:uid(),date,received:false})),
    expenses:old.expenses.map(x=>({...copy(x),id:uid(),date})),
    payments:old.payments.map(x=>({...copy(x),id:uid(),due:date,paid:false,paidDate:''}))
  };
  normalize();render();
}

function editAccount(id=null){
  const existing=id?account(id):null;
  const draft=existing?{...existing}:{id:uid(),name:'',type:'credit',baseBalance:0,limit:0,cutDay:15,dueDay:10};
  const m=document.createElement('div');
  m.className='modal-bg';
  m.innerHTML=`<div class="modal">
    <h3>${id?'Editar':'Nueva'} cuenta</h3>
    <label>Nombre<input id="an" value="${esc(draft.name)}"></label>
    <label>Tipo<select id="at"><option value="credit" ${draft.type==='credit'?'selected':''}>Tarjeta</option><option value="savings" ${draft.type==='savings'?'selected':''}>Ahorro</option><option value="cash" ${draft.type==='cash'?'selected':''}>Efectivo / banco</option></select></label>
    <label>Saldo base<input id="ab" data-money type="text" inputmode="decimal" autocomplete="off" value="${accountingNumber(draft.baseBalance||0)}"></label>
    <label>Límite<input id="al" data-money type="text" inputmode="decimal" autocomplete="off" value="${accountingNumber(draft.limit||0)}"></label>
    <label>Día de corte<input id="ac" type="number" min="1" max="31" value="${draft.cutDay||''}"></label>
    <label>Día límite<input id="ad" type="number" min="1" max="31" value="${draft.dueDay||''}"></label>
    <div class="modal-actions">${id?'<button type="button" id="adel" class="delete">Eliminar</button>':'<span></span>'}<div><button type="button" id="cancel">Cancelar</button><button type="button" id="asave" class="primary">Guardar</button></div></div>
  </div>`;
  document.body.appendChild(m);
  bindMoneyInputs(m);

  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close()};
  m.querySelector('#cancel').onclick=close;

  m.querySelector('#asave').onclick=()=>{
    const saveButton=m.querySelector('#asave');
    try{
      saveButton.disabled=true;
      const type=m.querySelector('#at').value;
      const name=m.querySelector('#an').value.trim()||'Cuenta';
      const cutRaw=num(m.querySelector('#ac').value);
      const dueRaw=num(m.querySelector('#ad').value);
      const next={
        ...draft,
        name,
        type,
        baseBalance:parseMoney(m.querySelector('#ab').value),
        limit:type==='credit'?parseMoney(m.querySelector('#al').value):0,
        cutDay:type==='credit'&&cutRaw>=1&&cutRaw<=31?cutRaw:null,
        dueDay:type==='credit'&&dueRaw>=1&&dueRaw<=31?dueRaw:null
      };

      if(!Array.isArray(state.accounts))state.accounts=[];
      if(existing){
        const index=state.accounts.findIndex(x=>x.id===existing.id);
        if(index>=0)state.accounts[index]=next;
      }else{
        state.accounts=[...state.accounts,next];
      }

      normalize();
      close();
      createStatements();
      render();
    }catch(error){
      console.error('Error saving account',error);
      saveButton.disabled=false;
      alert('No se pudo guardar la cuenta. Intenta nuevamente.');
    }
  };

  if(id){
    m.querySelector('#adel').onclick=()=>{
      if(!confirm(`¿Eliminar ${draft.name}?`))return;
      state.accounts=state.accounts.filter(x=>x.id!==id);
      Object.values(state.periods).forEach(p=>{
        p.incomes.forEach(x=>{if(x.account===id)x.account=''});
        p.expenses.forEach(x=>{if(x.account===id)x.account=''});
        p.payments.forEach(x=>{if(x.account===id)x.account='';if(x.sourceAccount===id)x.sourceAccount=''});
      });
      state.statements=state.statements.filter(s=>s.cardId!==id);
      normalize();close();render();
    };
  }
}
function markPaid(id){
  const s=state.statements.find(x=>x.id===id);if(!s)return;
  s.paid=true;s.paidDate=isoDate(localToday());
  let p=data().payments.find(x=>x.account===s.cardId&&!x.paid&&Math.abs(num(x.amount)-num(s.amount))<.01);
  if(p){
    p.paid=true;p.paidDate=s.paidDate;
    if(typeof p.internal!=='boolean')p.internal=true;
    if(p.internal&&!validTransferSource(p.sourceAccount,p.account))p.sourceAccount=primaryAssetId(p.account);
  }else{
    const sourceAccount=primaryAssetId(s.cardId);
    data().payments.push({id:uid(),desc:`Pago de corte · ${account(s.cardId)?.name||'Tarjeta'}`,amount:num(s.amount),account:s.cardId,due:s.dueDate,paid:true,paidDate:s.paidDate,internal:Boolean(sourceAccount),sourceAccount});
  }
  saveState(state);render();
}
async function enableNotifications(){if(!('Notification'in window))return alert('Este navegador no soporta notificaciones.');state.settings.browserNotifications=(await Notification.requestPermission())==='granted';saveState(state);render()}
async function notifyIfNeeded(){if(!state.settings.browserNotifications||!('Notification'in window)||Notification.permission!=='granted')return;for(const a of alerts().filter(x=>x.days<=3&&x.kind!=='setup')){const key=`po:${isoDate(localToday())}:${a.kind}:${a.card.id}`;if(localStorage.getItem(key))continue;new Notification('Presupuesto Online',{body:`${a.card.name}: ${a.kind==='cut'?'corte':'pago'} ${friendlyDate(a.date)} · ${money(a.amount)}`});localStorage.setItem(key,'1')}}
function explicitSave(){saveState(state);const b=document.querySelector('#save'),old=b.textContent;b.textContent='Guardado ✓';setTimeout(()=>b.textContent=old,900)}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`presupuesto-${isoDate(localToday())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
async function importData(e){const f=e.target.files[0];if(!f)return;try{state=JSON.parse(await f.text());normalize();createStatements();render();alert('Respaldo importado.')}catch{alert('Archivo inválido.')}e.target.value=''}

normalize();
createStatements();
window.addEventListener('beforeunload',()=>saveState(state));
render();