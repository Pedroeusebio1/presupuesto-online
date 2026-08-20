const STYLE_ID='payment-flow-ui-styles';

function makeLabel(text){
  const label=document.createElement('small');
  label.className='payment-flow-label';
  label.textContent=text;
  return label;
}

function injectStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    tr[data-kind="payment"] td.payment-flow-cell::before{display:none!important}
    .payment-flow{display:grid!important;gap:6px!important}
    .payment-flow-label{display:block;color:var(--muted);font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.07em;font-weight:900;margin:3px 0 0}
  `;
  document.head.appendChild(style);
}

function enhancePaymentRows(root=document){
  const rows=root.querySelectorAll?.('tr[data-kind="payment"]')||[];
  rows.forEach(row=>{
    const cell=row.children[2];
    if(!cell)return;
    const wrapper=cell.querySelector('div');
    if(!wrapper)return;

    const accountSelect=wrapper.querySelector('select[data-field="account"]');
    const typeSelect=wrapper.querySelector('select[data-field="internal"]');
    const sourceSelect=wrapper.querySelector('select[data-field="sourceAccount"]');
    if(!accountSelect||!typeSelect)return;

    const mode=typeSelect.value==='true'?'internal':'normal';
    if(wrapper.dataset.paymentFlowEnhanced===mode)return;

    cell.classList.add('payment-flow-cell');
    wrapper.classList.add('payment-flow');

    Array.from(wrapper.querySelectorAll('small')).forEach(el=>el.remove());

    if(mode==='internal'&&sourceSelect){
      wrapper.replaceChildren(
        makeLabel('Desde'),
        sourceSelect,
        typeSelect,
        makeLabel('Destino'),
        accountSelect
      );
    }else{
      wrapper.replaceChildren(
        makeLabel('Desde'),
        accountSelect,
        typeSelect
      );
    }

    wrapper.dataset.paymentFlowEnhanced=mode;
  });

  const firstRow=root.querySelector?.('tr[data-kind="payment"]');
  const table=firstRow?.closest('table');
  const accountHeader=table?.querySelector('thead th:nth-child(3)');
  if(accountHeader)accountHeader.textContent='Desde / Destino';
}

export function installPaymentUiEnhancer(){
  injectStyles();
  enhancePaymentRows();
  const observer=new MutationObserver(()=>enhancePaymentRows());
  observer.observe(document.body,{childList:true,subtree:true});
  return observer;
}
