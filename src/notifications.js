import { loadState } from './store.js';
import { localToday, parseLocalDate, isoDate, daysBetween, nextCut, friendlyDate, dueDateForCut } from './dates.js';

const STORAGE_KEY='presupuesto-online-dark-v2';
const NativeNotification=window.Notification;
const money=n=>new Intl.NumberFormat('es-DO',{style:'currency',currency:'DOP',minimumFractionDigits:2}).format(Number(n||0));
const num=v=>Number(v)||0;

function stateNow(){
  try{return loadState()}catch{return{accounts:[],periods:{},statements:[]}}
}
function allExpenses(state){return Object.values(state.periods||{}).flatMap(p=>p.expenses||[])}
function allPayments(state){return Object.values(state.periods||{}).flatMap(p=>p.payments||[])}
function balanceAt(state,id,date=null){
  const card=(state.accounts||[]).find(a=>a.id===id);if(!card)return 0;
  const max=date?new Date(date.getFullYear(),date.getMonth(),date.getDate(),23,59,59):null;
  const charges=allExpenses(state).filter(x=>x.account===id&&(!max||(parseLocalDate(x.date)||new Date(0))<=max)).reduce((s,x)=>s+num(x.amount),0);
  const paid=allPayments(state).filter(x=>x.account===id&&x.paid&&x.paidDate&&(!max||parseLocalDate(x.paidDate)<=max)).reduce((s,x)=>s+num(x.amount),0);
  return Math.max(0,num(card.baseBalance)+charges-paid);
}
function cardAvailable(card,balance){return card.limit?Math.max(0,num(card.limit)-balance):0}
function statementDue(card,statement){
  const cut=parseLocalDate(statement?.cutDate);
  return cut&&card?.dueDay?dueDateForCut(cut,card.dueDay):parseLocalDate(statement?.dueDate);
}
function firstUnpaid(state,card){
  return (state.statements||[])
    .filter(s=>s.cardId===card.id&&!s.paid)
    .map(s=>({statement:s,due:statementDue(card,s)}))
    .filter(x=>x.due)
    .sort((a,b)=>a.due-b.due)[0]||null;
}
function whenText(days){return days<0?`${Math.abs(days)} días vencido`:days===0?'hoy':days===1?'mañana':`en ${days} días`}
function detailFor(state,card,kind,statement=null){
  const today=localToday();
  const balance=balanceAt(state,card.id);
  const available=cardAvailable(card,balance);
  if(kind==='due'){
    const current=statement?{statement,due:statementDue(card,statement)}:firstUnpaid(state,card);
    if(!current?.due)return null;
    const cut=parseLocalDate(current.statement.cutDate);
    const days=daysBetween(today,current.due);
    return{
      date:current.due,
      days,
      amount:num(current.statement.amount),
      title:`${card.name} vence ${whenText(days)}`,
      body:`Pago ${friendlyDate(current.due)} · A pagar ${money(current.statement.amount)} · Balance ${money(balance)}${card.limit?` · Disponible ${money(available)}`:''}${cut?` · Corte ${friendlyDate(cut)}`:''}`
    };
  }
  const cut=nextCut(card,today);
  const due=card.dueDay?dueDateForCut(cut,card.dueDay):null;
  const days=daysBetween(today,cut);
  return{
    date:cut,
    days,
    amount:balance,
    title:`${card.name} corta ${whenText(days)}`,
    body:`Corte ${friendlyDate(cut)} · Balance ${money(balance)}${card.limit?` · Límite ${money(card.limit)} · Disponible ${money(available)}`:''}${due?` · Pago límite ${friendlyDate(due)}`:''}`
  };
}
function findCardFromNotice(state,notice){
  const text=notice.querySelector('b')?.textContent||'';
  return [...(state.accounts||[])]
    .filter(a=>a.type==='credit'&&text.startsWith(a.name))
    .sort((a,b)=>b.name.length-a.name.length)[0]||null;
}
function refreshVisualNotices(){
  const root=document.querySelector('.notices');if(!root)return;
  const state=stateNow();
  root.querySelectorAll('.notice').forEach(notice=>{
    const statementButton=notice.querySelector('[data-statement]');
    let card=null,kind=null,statement=null;
    if(statementButton){
      statement=(state.statements||[]).find(s=>s.id===statementButton.dataset.statement)||null;
      card=(state.accounts||[]).find(a=>a.id===statement?.cardId)||null;
      kind='due';
    }else{
      card=findCardFromNotice(state,notice);
      if(card&&(notice.querySelector('b')?.textContent||'').includes('corta'))kind='cut';
    }
    if(!card||!kind)return;
    const detail=detailFor(state,card,kind,statement);if(!detail)return;
    const title=notice.querySelector('b'),body=notice.querySelector('span');
    if(title&&title.textContent!==detail.title)title.textContent=detail.title;
    if(body&&body.textContent!==detail.body)body.textContent=detail.body;
    notice.classList.toggle('danger',detail.days<=1);
    notice.classList.toggle('warn',detail.days>1);
  });
}
function cardFingerprint(state,card){
  const balance=balanceAt(state,card.id);
  const unpaid=firstUnpaid(state,card);
  return JSON.stringify({
    name:card.name,type:card.type,cutDay:card.cutDay,dueDay:card.dueDay,limit:num(card.limit),balance,
    due:unpaid?.due?isoDate(unpaid.due):'',dueAmount:num(unpaid?.statement?.amount)
  });
}
function clearTodayKeys(cardId){
  const today=isoDate(localToday());
  [`po:${today}:cut:${cardId}`,`po:${today}:due:${cardId}`].forEach(k=>localStorage.removeItem(k));
}
function installStorageWatcher(){
  if(Storage.prototype.__cardNoticeWatcher)return;
  const previous=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    let oldState=null,newState=null;
    if(this===localStorage&&key===STORAGE_KEY){
      try{oldState=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');newState=JSON.parse(value)}catch{}
    }
    previous.call(this,key,value);
    if(oldState&&newState){
      const oldCards=new Map((oldState.accounts||[]).filter(a=>a.type==='credit').map(a=>[a.id,a]));
      (newState.accounts||[]).filter(a=>a.type==='credit').forEach(card=>{
        const old=oldCards.get(card.id);
        if(!old||cardFingerprint(oldState,old)!==cardFingerprint(newState,card))clearTodayKeys(card.id);
      });
    }
  };
  Storage.prototype.__cardNoticeWatcher=true;
}
function enhancedOptions(options={}){
  const body=String(options.body||'');
  const state=stateNow();
  const card=[...(state.accounts||[])]
    .filter(a=>a.type==='credit'&&body.startsWith(`${a.name}:`))
    .sort((a,b)=>b.name.length-a.name.length)[0];
  if(!card)return options;
  const kind=body.includes(': corte')?'cut':body.includes(': pago')?'due':null;
  if(!kind)return options;
  const detail=detailFor(state,card,kind);
  return detail?{...options,body:detail.body,tag:`presupuesto-${kind}-${card.id}`}:options;
}
export function installCardNotificationEnhancer(){
  installStorageWatcher();
  if(typeof NativeNotification!=='function'||window.__cardNotificationEnhanced)return;
  function EnhancedNotification(title,options){return new NativeNotification(title,enhancedOptions(options))}
  EnhancedNotification.prototype=NativeNotification.prototype;
  EnhancedNotification.requestPermission=(...args)=>NativeNotification.requestPermission(...args);
  Object.defineProperty(EnhancedNotification,'permission',{get:()=>NativeNotification.permission});
  try{Object.defineProperty(window,'Notification',{configurable:true,writable:true,value:EnhancedNotification})}
  catch{try{window.Notification=EnhancedNotification}catch{return}}
  window.__cardNotificationEnhanced=true;
}
export function startCardNoticeSync(){
  let scheduled=false;
  const run=()=>{scheduled=false;refreshVisualNotices()};
  const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(run)};
  refreshVisualNotices();
  const root=document.querySelector('#app');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  window.addEventListener('focus',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
}
