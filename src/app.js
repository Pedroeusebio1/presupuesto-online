import { loadState, saveState, demoState, clone, uid, STORAGE_KEY } from './store.js';
import { localToday, parseLocalDate, isoDate, daysBetween, nextCut, nextDue, friendlyDate, latestCutOnOrBefore, dueDateForCut } from './dates.js';

const app = document.querySelector('#app');
let state = loadState();
const nowForPeriod = localToday();
let period = `${nowForPeriod.getFullYear()}-${String(nowForPeriod.getMonth()+1).padStart(2,'0')}|${nowForPeriod.getDate()<=15?'1':'2'}`;

const money = n => new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2}).format(Number(n||0));
const num = v => Number(v)||0;
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const account = id => state.accounts.find(a => a.id === id);

function periodData(){
  if(!state.periods[period]) state.periods[period] = { incomes:[], expenses:[], payments:[] };
  return state.periods[period];
}

function allExpenses(){ return Object.values(state.periods).flatMap(p=>p.expenses||[]); }
function allPayments(){ return Object.values(state.periods).flatMap(p=>p.payments||[]); }

function cardBalanceAt(cardId, date=null){
  const card = account(cardId);
  if(!card) return 0;
  const maxDate = date ? new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59) : null;
  const charges = allExpenses().filter(x=>x.account===cardId && (!maxDate || (parseLocalDate(x.date)||new Date(0))<=maxDate)).reduce((s,x)=>s+num(x.amount),0);
  const payments = allPayments().filter(x=>x.account===cardId && x.paid && x.paidDate && (!maxDate || parseLocalDate(x.paidDate)<=maxDate)).reduce((s,x)=>s+num(x.amount),0);
  return Math.max(0, num(card.baseBalance)+charges-payments);
}

function autoCreateStatements(){
  const today = localToday();
  state.accounts.filter(a=>a.type==='credit' && a.cutDay && a.dueDay).forEach(card=>{
    const cut = latestCutOnOrBefore(card,today);
    const cutIso = isoDate(cut);
    if(cut <= today && !state.statements.some(s=>s.cardId===card.id && s.cutDate===cutIso)){
      state.statements.push({
        id:uid(), cardId:card.id, cutDate:cutIso,
        dueDate:isoDate(dueDateForCut(cut,card.dueDay)),
        amount:cardBalanceAt(card.id,cut), paid:false, paidDate:''
      });
    }
  });
  saveState(state);
}

autoCreateStatements();

function alerts(){
  const today=localToday();
  const out=[];
  state.accounts.filter(a=>a.type==='credit').forEach(card=>{
    if(!card.cutDay || !card.dueDay){
      out.push({type:'setup',priority:'medium',card,days:99,date:today,amount:0});
      return;
    }
    const cut=nextCut(card,today), due=nextDue(card,today);
    const cutDays=daysBetween(today,cut), dueDays=daysBetween(today,due);
    const unpaid = state.statements.filter(s=>s.cardId===card.id && !s.paid).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
    if(unpaid){
      const dd=daysBetween(today,parseLocalDate(unpaid.dueDate));
      if(dd<=7) out.push({type:'due',priority:dd<=1?'high':'medium',card,days:dd,date:parseLocalDate(unpaid.dueDate),amount:unpaid.amount,statementId:unpaid.id});
    } else if(dueDays<=3){
      out.push({type:'due-review',priority:dueDays<=1?'high':'medium',card,days:dueDays,date:due,amount:cardBalanceAt(card.id)});
    }
    if(cutDays<=3) out.push({type:'cut',priority:'medium',card,days:cutDays,date:cut,amount:cardBalanceAt(card.id)});
  });
  return out.sort((a,b)=>a.days-b.days);
}

async function maybeNotify(){
  if(!state.settings.browserNotifications || !('Notification' in window) || Notification.permission!=='granted') return;
  const today=isoDate(localToday());
  for(const a of alerts().filter(x=>x.days<=3)){
    const key=`notify:${today}:${a.type}:${a.card.id}:${isoDate(a.date)}`;
    if(localStorage.getItem(key)) continue;
    const title = a.type==='cut' ? `Corte próximo: ${a.card.name}` : `Pago próximo: ${a.card.name}`;
    const body = a.type==='cut'
      ? `Corta ${friendlyDate(a.date)}. Balance estimado ${money(a.amount)}.`
      : `Vence ${friendlyDate(a.date)}. ${a.amount ? `Monto del corte ${money(a.amount)}.` : 'Revisa el estado de cuenta.'}`;
    new Notification(title,{body});
    localStorage.setItem(key,'1');
  }
}

function accountOptions(selected){
  return state.accounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${esc(a.name)}</option>`).join('');
}

function render(){
  const p=periodData();
  const [ym,q]=period.split('|');
  const monthText=new Date(`${ym}-01T12:00:00`).toLocaleDateString('es-DO',{month:'long',year:'numeric'});
  const income=p.incomes.reduce((s,x)=>s+num(x.amount),0);
  const payments=p.payments.reduce((s,x)=>s+num(x.amount),0);
  const expenses=p.expenses.reduce((s,x)=>s+num(x.amount),0);
  const free=income-payments;
  const alertList=alerts();
  const totalDebt=state.accounts.filter(a=>a.type==='credit').reduce((s,a)=>s+cardBalanceAt(a.id),0);
  const savings=state.accounts.filter(a=>a.type==='savings').reduce((s,a)=>s+num(a.baseBalance)+allPayments().filter(x=>x.account===a.id && x.paid).reduce((t,x)=>t+num(x.amount),0),0);

  app.innerHTML=`
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">Presupuesto <span>Online</span><small>Quincenas + tarjetas + alertas</small></div>
      <nav class="nav">
        <a href="#overview">Resumen</a><a href="#alerts">Alertas</a><a href="#income">Ingresos</a><a href="#expenses">Gastos</a><a href="#payments">Pagos</a><a href="#accounts">Cuentas y cortes</a>
      </nav>
      <div class="sidebar-note"><strong>Regla de oro</strong><br>Un gasto en tarjeta aumenta deuda. El efectivo solo baja cuando registras el pago de la tarjeta.</div>
    </aside>
    <main class="main">
      <section id="overview" class="topbar">
        <div><h1>${q==='1'?'1ra':'2da'} quincena · ${monthText}</h1><div class="subtitle">Tu flujo, tus tarjetas y tus próximos cortes en una sola vista.</div></div>
        <div class="controls">
          <input id="month" class="control" type="month" value="${ym}">
          <select id="half" class="control"><option value="1" ${q==='1'?'selected':''}>1ra</option><option value="2" ${q==='2'?'selected':''}>2da</option></select>
          <button class="btn" id="notifyBtn">${state.settings.browserNotifications?'Notificaciones activas':'Activar avisos'}</button>
        </div>
      </section>

      <section class="grid kpis">
        <div class="card"><div class="kpi-label">Ingresos</div><div class="kpi-value">${money(income)}</div><div class="kpi-sub">Entradas planificadas</div></div>
        <div class="card"><div class="kpi-label">Pagos / salidas</div><div class="kpi-value">${money(payments)}</div><div class="kpi-sub">Compromisos de efectivo</div></div>
        <div class="card"><div class="kpi-label">Saldo libre</div><div class="kpi-value ${free>=0?'good':'bad'}">${money(free)}</div><div class="kpi-sub">Ingresos menos pagos</div></div>
        <div class="card"><div class="kpi-label">Deuda tarjetas</div><div class="kpi-value ${totalDebt>0?'warning':''}">${money(totalDebt)}</div><div class="kpi-sub">Balance estimado actual</div></div>
      </section>

      <section class="panel" id="alerts">
        <div class="panel-head"><div><h2>Próximos cortes y pagos</h2><p>Se resaltan automáticamente los eventos cercanos.</p></div></div>
        <div class="alerts">${alertList.length?alertList.map(a=>alertHtml(a)).join(''):'<div class="empty">No tienes cortes o pagos urgentes en los próximos días.</div>'}</div>
      </section>

      <section class="panel" id="income">
        <div class="panel-head"><div><h2>Ingresos</h2><p>Todo lo que entra en esta quincena.</p></div><button class="btn" data-add="income">+ Ingreso</button></div>
        ${tableIncome(p.incomes)}
      </section>

      <section class="panel" id="expenses">
        <div class="panel-head"><div><h2>Gastos de la quincena</h2><p>Registra qué consumes y con qué método de pago.</p></div><button class="btn" data-add="expense">+ Gasto</button></div>
        ${tableExpenses(p.expenses)}
      </section>

      <section class="panel" id="payments">
        <div class="panel-head"><div><h2>Pagos y movimientos de efectivo</h2><p>Pagos de tarjetas, ahorro, moto, familia y demás salidas.</p></div><button class="btn" data-add="payment">+ Pago</button></div>
        ${tablePayments(p.payments)}
      </section>

      <section class="grid split" id="accounts">
        <div class="panel"><div class="panel-head"><div><h2>Account Overview</h2><p>Balance, utilización, próximo corte y próxima fecha límite.</p></div><button class="btn" id="addAccount">+ Cuenta</button></div><div class="accounts">${accountsHtml()}</div></div>
        <div class="panel"><div class="panel-head"><div><h2>Resumen financiero</h2><p>Vista consolidada.</p></div></div><div class="summary">
          <div class="summary-row"><span>Ingresos quincena</span><strong>${money(income)}</strong></div>
          <div class="summary-row"><span>Gastos nuevos</span><strong>${money(expenses)}</strong></div>
          <div class="summary-row"><span>Pagos programados</span><strong>${money(payments)}</strong></div>
          <div class="summary-row"><span>Deuda total tarjetas</span><strong>${money(totalDebt)}</strong></div>
          <div class="summary-row"><span>Ahorro acumulado</span><strong>${money(savings)}</strong></div>
        </div></div>
      </section>

      <section class="panel"><div class="panel-head"><div><h2>Respaldo</h2><p>Los datos se guardan en este navegador. Exporta un respaldo antes de cambiar de equipo.</p></div></div><div class="footer-actions">
        <button class="btn" id="exportBtn">Exportar JSON</button><label class="btn">Importar JSON<input type="file" id="importFile" accept=".json" hidden></label><button class="btn danger" id="resetBtn">Restablecer demo</button>
      </div></section>
    </main>
  </div>`;
  bind();
  maybeNotify();
}

function alertHtml(a){
  if(a.type==='setup') return `<div class="alert medium"><div><div class="alert-title">Configura fechas · ${esc(a.card.name)}</div><div class="alert-meta">Falta el día de corte o la fecha límite de pago para poder avisarte.</div></div><button class="btn" data-edit-account="${a.card.id}">Configurar</button></div>`;
  const label = a.type==='cut'?'Corte':a.type==='due'?'Pago de corte':'Revisar pago';
  const dayText = a.days<0?`${Math.abs(a.days)} días vencido`:a.days===0?'Hoy':a.days===1?'Mañana':`En ${a.days} días`;
  const extra = a.type==='cut' ? `Balance estimado ${money(a.amount)}` : a.amount ? `Monto ${money(a.amount)}` : 'Revisa el estado de cuenta';
  return `<div class="alert ${a.priority}"><div><div class="alert-title">${label} · ${esc(a.card.name)}</div><div class="alert-meta">${friendlyDate(a.date)} · ${extra}</div></div><div><div class="alert-days ${a.priority==='high'?'bad':'warning'}">${dayText}</div>${a.statementId?`<button class="btn" style="margin-top:6px;padding:6px 8px;font-size:10px" data-paid-statement="${a.statementId}">Marcar pagado</button>`:''}</div></div>`;
}

function tableIncome(rows){
  return `<div class="table-wrap"><table><thead><tr><th>Descripción</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr data-kind="income" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td><input data-field="amount" type="number" step="0.01" value="${r.amount}"></td><td><input data-field="date" type="date" value="${r.date||''}"></td><td><button class="status ${r.received?'active':''}" data-toggle="received">${r.received?'Recibido':'Pendiente'}</button></td><td><button class="icon-btn" data-delete>✕</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Sin ingresos.</td></tr>'}</tbody></table></div>`;
}
function tableExpenses(rows){
  return `<div class="table-wrap"><table><thead><tr><th>Descripción</th><th>Monto</th><th>Método</th><th>Fecha</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr data-kind="expense" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td><input data-field="amount" type="number" step="0.01" value="${r.amount}"></td><td><select data-field="account">${accountOptions(r.account)}</select></td><td><input data-field="date" type="date" value="${r.date||''}"></td><td><button class="icon-btn" data-delete>✕</button></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Sin gastos.</td></tr>'}</tbody></table></div>`;
}
function tablePayments(rows){
  return `<div class="table-wrap"><table><thead><tr><th>Descripción</th><th>Monto</th><th>Cuenta destino</th><th>Fecha límite</th><th>Pagado</th><th></th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr data-kind="payment" data-id="${r.id}"><td><input data-field="desc" value="${esc(r.desc)}"></td><td><input data-field="amount" type="number" step="0.01" value="${r.amount}"></td><td><select data-field="account">${accountOptions(r.account)}</select></td><td><input data-field="due" type="date" value="${r.due||''}"></td><td><button class="status ${r.paid?'active':''}" data-toggle="paid">${r.paid?'Pagado':'Pendiente'}</button></td><td><button class="icon-btn" data-delete>✕</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Sin pagos.</td></tr>'}</tbody></table></div>`;
}

function accountsHtml(){
  const today=localToday();
  return state.accounts.map(a=>{
    if(a.type==='credit'){
      const balance=cardBalanceAt(a.id), usage=a.limit?Math.min(100,balance/a.limit*100):0;
      const cycle = a.cutDay && a.dueDay ? (()=>{const cut=nextCut(a,today), due=nextDue(a,today); return `<span class="pill">Corta día ${a.cutDay} · ${friendlyDate(cut)}</span><span class="pill">Paga día ${a.dueDay} · ${friendlyDate(due)}</span>`;})() : `<span class="pill warning">Configura corte y pago</span>`;
      return `<article class="account"><div class="account-head"><div><div class="account-name">${esc(a.name)}</div><div class="account-type">Tarjeta de crédito</div></div><button class="icon-btn" data-edit-account="${a.id}">Editar</button></div><div class="account-grid"><div class="metric"><small>Balance estimado</small><strong>${money(balance)}</strong></div><div class="metric"><small>Límite</small><strong>${money(a.limit)}</strong></div><div class="metric"><small>Disponible</small><strong>${money(Math.max(0,a.limit-balance))}</strong></div><div class="metric"><small>Utilización</small><strong>${usage.toFixed(1)}%</strong></div></div><div class="progress"><span style="width:${usage}%"></span></div><div class="cycle">${cycle}</div></article>`;
    }
    const paid=allPayments().filter(x=>x.account===a.id && x.paid).reduce((s,x)=>s+num(x.amount),0);
    const balance=a.type==='savings'?num(a.baseBalance)+paid:num(a.baseBalance)-paid;
    return `<article class="account"><div class="account-head"><div><div class="account-name">${esc(a.name)}</div><div class="account-type">${a.type==='savings'?'Ahorro':'Efectivo / débito'}</div></div><button class="icon-btn" data-edit-account="${a.id}">Editar</button></div><div class="account-grid"><div class="metric"><small>Balance base</small><strong>${money(a.baseBalance)}</strong></div><div class="metric"><small>Movimientos pagados</small><strong>${money(paid)}</strong></div><div class="metric"><small>Balance estimado</small><strong>${money(balance)}</strong></div></div></article>`;
  }).join('');
}

function bind(){
  document.querySelector('#month').addEventListener('change',e=>{ period=`${e.target.value}|${document.querySelector('#half').value}`; render(); });
  document.querySelector('#half').addEventListener('change',e=>{ period=`${document.querySelector('#month').value}|${e.target.value}`; render(); });
  document.querySelector('#notifyBtn').addEventListener('click', enableNotifications);
  document.querySelector('#addAccount').addEventListener('click', ()=>openAccountModal());
  document.querySelector('#exportBtn').addEventListener('click', exportData);
  document.querySelector('#importFile').addEventListener('change', importData);
  document.querySelector('#resetBtn').addEventListener('click', resetData);
  document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>addRow(b.dataset.add)));
  document.querySelectorAll('tr[data-id] input,tr[data-id] select').forEach(el=>{
    el.addEventListener('change',()=>updateRow(el.closest('tr'),el.dataset.field,el.value));
  });
  document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteRow(b.closest('tr'))));
  document.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>toggleRow(b.closest('tr'),b.dataset.toggle)));
  document.querySelectorAll('[data-edit-account]').forEach(b=>b.addEventListener('click',()=>openAccountModal(b.dataset.editAccount)));
  document.querySelectorAll('[data-paid-statement]').forEach(b=>b.addEventListener('click',()=>markStatementPaid(b.dataset.paidStatement)));
}

function updateRow(tr,field,value){
  const p=periodData(); const list=tr.dataset.kind==='income'?p.incomes:tr.dataset.kind==='expense'?p.expenses:p.payments;
  const row=list.find(x=>x.id===tr.dataset.id); if(!row)return;
  row[field]=field==='amount'?num(value):value; saveState(state); render();
}
function toggleRow(tr,field){
  const p=periodData(); const list=tr.dataset.kind==='income'?p.incomes:p.payments; const row=list.find(x=>x.id===tr.dataset.id); if(!row)return;
  row[field]=!row[field]; if(field==='paid') row.paidDate=row.paid?isoDate(localToday()):''; saveState(state); autoCreateStatements(); render();
}
function deleteRow(tr){
  const p=periodData(); const list=tr.dataset.kind==='income'?p.incomes:tr.dataset.kind==='expense'?p.expenses:p.payments;
  const i=list.findIndex(x=>x.id===tr.dataset.id); if(i>=0) list.splice(i,1); saveState(state); render();
}
function addRow(kind){
  const p=periodData();
  if(kind==='income') p.incomes.push({id:uid(),desc:'Nuevo ingreso',amount:0,date:isoDate(localToday()),received:false});
  if(kind==='expense') p.expenses.push({id:uid(),desc:'Nuevo gasto',amount:0,account:state.accounts[0]?.id||'',date:isoDate(localToday())});
  if(kind==='payment') p.payments.push({id:uid(),desc:'Nuevo pago',amount:0,account:state.accounts[0]?.id||'',due:isoDate(localToday()),paid:false,paidDate:''});
  saveState(state); render();
}

function openAccountModal(id=null){
  const a=id?account(id):{id:uid(),name:'',type:'credit',baseBalance:0,limit:0,cutDay:15,dueDay:10};
  const modal=document.createElement('div'); modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><h3>${id?'Editar':'Nueva'} cuenta</h3><div class="form-grid">
    <div class="field full"><label>Nombre</label><input id="mName" value="${esc(a.name)}"></div>
    <div class="field"><label>Tipo</label><select id="mType"><option value="credit" ${a.type==='credit'?'selected':''}>Tarjeta de crédito</option><option value="savings" ${a.type==='savings'?'selected':''}>Ahorro</option><option value="cash" ${a.type==='cash'?'selected':''}>Efectivo / débito</option></select></div>
    <div class="field"><label>Balance base</label><input id="mBase" type="number" step="0.01" value="${a.baseBalance||0}"></div>
    <div class="field"><label>Límite</label><input id="mLimit" type="number" step="0.01" value="${a.limit||0}"></div>
    <div class="field"><label>Día de corte</label><input id="mCut" type="number" min="1" max="28" placeholder="Ej. 15" value="${a.cutDay||''}"></div>
    <div class="field"><label>Día límite de pago</label><input id="mDue" type="number" min="1" max="28" placeholder="Ej. 10" value="${a.dueDay||''}"></div>
  </div><div class="modal-actions"><button class="btn" id="mCancel">Cancelar</button><button class="btn primary" id="mSave">Guardar</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#mCancel').onclick=()=>modal.remove();
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove()});
  modal.querySelector('#mSave').onclick=()=>{
    const type=modal.querySelector('#mType').value;
    const next={...a,name:modal.querySelector('#mName').value.trim()||'Cuenta',type,baseBalance:num(modal.querySelector('#mBase').value),limit:type==='credit'?num(modal.querySelector('#mLimit').value):0,cutDay:type==='credit'?num(modal.querySelector('#mCut').value):null,dueDay:type==='credit'?num(modal.querySelector('#mDue').value):null};
    if(id) Object.assign(a,next); else state.accounts.push(next);
    saveState(state); modal.remove(); autoCreateStatements(); render();
  };
}

async function enableNotifications(){
  if(!('Notification' in window)){ alert('Este navegador no soporta notificaciones web.'); return; }
  const perm=await Notification.requestPermission();
  state.settings.browserNotifications=perm==='granted'; saveState(state); render();
}

function markStatementPaid(id){
  const s=state.statements.find(x=>x.id===id); if(!s)return;
  const paidDate=isoDate(localToday());
  s.paid=true; s.paidDate=paidDate;
  const p=periodData();
  let payment=p.payments.find(x=>x.account===s.cardId && !x.paid && Math.abs(num(x.amount)-num(s.amount))<0.01);
  if(payment){ payment.paid=true; payment.paidDate=paidDate; }
  else if(num(s.amount)>0){ p.payments.push({id:uid(),desc:`Pago de corte · ${account(s.cardId)?.name||'Tarjeta'}`,amount:num(s.amount),account:s.cardId,due:s.dueDate,paid:true,paidDate}); }
  saveState(state); render();
}

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=`presupuesto-${isoDate(localToday())}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
async function importData(e){
  const f=e.target.files[0]; if(!f)return;
  try{ state=JSON.parse(await f.text()); saveState(state); autoCreateStatements(); render(); alert('Respaldo importado.'); }catch{ alert('Archivo inválido.'); }
  e.target.value='';
}
function resetData(){
  if(!confirm('¿Borrar los datos locales y restaurar la demo?')) return;
  localStorage.removeItem(STORAGE_KEY); state=clone(demoState); saveState(state); autoCreateStatements(); render();
}

if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
render();
