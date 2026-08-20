import { saveState } from './store.js';

const STYLE_ID='payment-source-fix-style';

const getState=()=>globalThis.__presupuestoOnlineState;
const cashAccounts=state=>(state?.accounts||[]).filter(a=>a.type==='cash');
const accountById=(state,id)=>(state?.accounts||[]).find(a=>a.id===id);
const primaryCashId=(state,exclude='')=>cashAccounts(state).find(a=>a.id!==exclude)?.id||'';

function currentPeriodKey(){
  const ym=document.querySelector('#month')?.value;
  const half=document.querySelector('#half')?.value;
  return ym&&half?`${ym}|${half}`:'';
}

function paymentForRow(row){
  const state=getState();
  const key=currentPeriodKey();
  const payment=state?.periods?.[key]?.payments?.find(p=>p.id===row.dataset.id);
  return {state,payment};
}

function normalizePayment(state,payment){
  if(!state||!payment)return false;
  let changed=false;
  const cashIds=new Set(cashAccounts(state).map(a=>a.id));
  const primary=primaryCashId(state);

  if(payment.internal){
    const destination=accountById(state,payment.account);
    const source=accountById(state,payment.sourceAccount);

    // Corrige datos viejos donde la cuenta principal quedó guardada como destino
    // y un ahorro terminó incorrectamente como origen.
    if(destination?.type==='cash'&&source?.type!=='cash'){
      payment.sourceAccount=destination.id;
      payment.account='';
      changed=true;
    }

    if(!cashIds.has(payment.sourceAccount)||payment.sourceAccount===payment.account){
      const nextSource=primaryCashId(state,payment.account);
      if(payment.sourceAccount!==nextSource){
        payment.sourceAccount=nextSource;
        changed=true;
      }
    }

    if(payment.account===payment.sourceAccount){
      payment.account='';
      changed=true;
    }
  }else{
    // Un pago normal siempre sale de banco/efectivo.
    if(!cashIds.has(payment.account)){
      payment.account=primary;
      changed=true;
    }
    if(payment.sourceAccount){
      payment.sourceAccount='';
      changed=true;
    }
  }

  return changed;
}

function optionHtml(accounts,selected,placeholder=''){
  const first=placeholder?`<option value="">${placeholder}</option>`:'';
  return first+accounts.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${a.name}</option>`).join('');
}

function label(text){
  const el=document.createElement('small');
  el.className='payment-source-label';
  el.textContent=text;
  return el;
}

function enhanceRow(row){
  const {state,payment}=paymentForRow(row);
  if(!state||!payment)return;

  if(normalizePayment(state,payment))saveState(state);

  const cell=row.children[2];
  const wrapper=cell?.querySelector('div');
  const accountSelect=wrapper?.querySelector('select[data-field="account"]');
  const typeSelect=wrapper?.querySelector('select[data-field="internal"]');
  const sourceSelect=wrapper?.querySelector('select[data-field="sourceAccount"]');
  if(!wrapper||!accountSelect||!typeSelect)return;

  wrapper.querySelectorAll('small').forEach(s=>s.remove());

  if(payment.internal&&sourceSelect){
    const sources=cashAccounts(state).filter(a=>a.id!==payment.account);
    sourceSelect.innerHTML=optionHtml(sources,payment.sourceAccount,'Selecciona banco / efectivo');

    const destinations=(state.accounts||[]).filter(a=>a.id!==payment.sourceAccount);
    accountSelect.innerHTML=optionHtml(destinations,payment.account,'Selecciona destino');

    wrapper.replaceChildren(
      label('Desde'),
      sourceSelect,
      typeSelect,
      label('Destino'),
      accountSelect
    );
  }else{
    accountSelect.innerHTML=optionHtml(cashAccounts(state),payment.account,'Selecciona banco / efectivo');
    wrapper.replaceChildren(
      label('Desde'),
      accountSelect,
      typeSelect
    );
  }
}

function enhanceAll(){
  document.querySelectorAll('tr[data-kind="payment"]').forEach(enhanceRow);
}

function injectStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    tr[data-kind="payment"] td:nth-child(3)>div{display:grid!important;gap:6px!important}
    tr[data-kind="payment"] td:nth-child(3)>div::before,
    tr[data-kind="payment"] td:nth-child(3)>div::after{display:none!important;content:none!important}
    tr[data-kind="payment"] td:nth-child(3)>div>select{order:initial!important}
    tr[data-kind="payment"] td:nth-child(3)>div>small.payment-source-label{display:block!important;order:initial!important;color:var(--muted);font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.07em;font-weight:900;margin:3px 0 0}
    @media(max-width:760px){tr[data-kind="payment"] td:nth-child(3)::before{display:none!important}}
  `;
  document.head.appendChild(style);
}

export function installPaymentSourceFix(){
  try{
    injectStyles();
    enhanceAll();
    const refresh=()=>setTimeout(()=>{try{enhanceAll()}catch(error){console.error('Payment source refresh failed',error)}},0);

    document.addEventListener('change',event=>{
      if(event.target.closest('tr[data-kind="payment"],#month,#half'))refresh();
    });

    document.addEventListener('click',event=>{
      if(event.target.closest('[data-add],#prev,#next,#copy,[data-delete],[data-toggle],[data-statement]'))refresh();
    });
  }catch(error){
    console.error('Payment source fix failed',error);
  }
}
