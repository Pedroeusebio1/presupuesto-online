import { saveState, uid } from './store.js';

const isObject=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

function numberValue(value){
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  let s=String(value??'').trim().replace(/\s/g,'').replace(/RD\$/gi,'');
  if(!s)return 0;
  if(s.includes(',')&&s.includes('.')){
    const lastComma=s.lastIndexOf(','),lastDot=s.lastIndexOf('.');
    if(lastComma>lastDot)s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(s.includes(',')){
    const parts=s.split(',');
    s=parts.length===2&&parts[1].length<=2?`${parts[0].replace(/\./g,'')}.${parts[1]}`:s.replace(/,/g,'');
  }
  s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}

function cleanDay(value){
  const n=Math.trunc(numberValue(value));
  return n>=1&&n<=31?n:null;
}

function cleanDate(value){
  const s=String(value??'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}

function normalizeType(value){
  const s=String(value??'').trim().toLowerCase();
  if(s==='savings'||s.includes('ahorro'))return 'savings';
  if(s==='cash'||s.includes('efectivo')||s.includes('banco'))return 'cash';
  return 'credit';
}

function extractState(raw){
  if(!isObject(raw))throw new Error('El JSON no contiene un objeto válido.');
  if(isObject(raw.data)&&(Array.isArray(raw.data.accounts)||isObject(raw.data.periods)))return raw.data;
  if(isObject(raw.state)&&(Array.isArray(raw.state.accounts)||isObject(raw.state.periods)))return raw.state;
  return raw;
}

function periodScore(key){
  const match=/^(\d{4})-(\d{2})\|(1|2)$/.exec(key);
  if(!match)return -1;
  return Number(match[1])*24+(Number(match[2])-1)*2+(Number(match[3])-1);
}

function sortedPeriodKeys(periods){
  return Object.keys(periods||{}).filter(k=>periodScore(k)>=0).sort((a,b)=>periodScore(a)-periodScore(b));
}

function latestPeriodKey(periods){
  return sortedPeriodKeys(periods).at(-1)||'';
}

function describePeriod(key){
  const match=/^(\d{4})-(\d{2})\|(1|2)$/.exec(key);
  if(!match)return key;
  const year=Number(match[1]),month=Number(match[2]),half=match[3];
  const monthName=new Date(year,month-1,1).toLocaleDateString('es-DO',{month:'short',year:'numeric'});
  return `${half==='1'?'1ra.':'2da.'} ${monthName}`;
}

export function migrateBudgetBackup(raw){
  const source=extractState(raw);
  const sourceAccounts=Array.isArray(source.accounts)?source.accounts:[];
  if(!sourceAccounts.length&&!isObject(source.periods))throw new Error('No encontré cuentas ni quincenas dentro del respaldo.');

  const accounts=sourceAccounts.filter(isObject).map(a=>{
    const type=normalizeType(a.type);
    const balance=numberValue(a.baseBalance??a.opening??a.balance??0);
    return{
      id:String(a.id||uid()),
      name:String(a.name||a.title||'Cuenta'),
      type,
      baseBalance:type==='credit'?Math.abs(balance):balance,
      limit:type==='credit'?Math.abs(numberValue(a.limit??a.creditLimit??0)):0,
      cutDay:type==='credit'?cleanDay(a.cutDay??a.cutoffDay):null,
      dueDay:type==='credit'?cleanDay(a.dueDay??a.paymentDay):null
    };
  });

  const accountById=new Map(accounts.map(a=>[a.id,a]));
  const assetAccounts=accounts.filter(a=>a.type==='cash'||a.type==='savings');
  const primaryAsset=assetAccounts.find(a=>a.type==='cash')||assetAccounts[0]||null;
  const primaryExcept=id=>assetAccounts.find(a=>a.type==='cash'&&a.id!==id)||assetAccounts.find(a=>a.id!==id)||null;
  const validAccount=id=>Boolean(id&&accountById.has(String(id)));

  const periods={};
  const sourcePeriods=isObject(source.periods)?source.periods:{};
  Object.entries(sourcePeriods).forEach(([key,p])=>{
    if(!isObject(p)||periodScore(key)<0)return;

    const incomes=(Array.isArray(p.incomes)?p.incomes:[]).filter(isObject).map(row=>{
      let destination=row.account??row.accountId??'';
      destination=validAccount(destination)?String(destination):'';
      if(!destination||accountById.get(destination)?.type==='credit')destination=primaryAsset?.id||'';
      return{
        id:String(row.id||uid()),
        desc:String(row.desc??row.description??row.name??'Ingreso'),
        amount:numberValue(row.amount),
        date:cleanDate(row.date),
        received:Boolean(row.received),
        account:destination
      };
    });

    const expenses=(Array.isArray(p.expenses)?p.expenses:[]).filter(isObject).map(row=>{
      const candidate=row.account??row.accountId??row.methodId??'';
      return{
        id:String(row.id||uid()),
        desc:String(row.desc??row.description??row.name??'Gasto'),
        amount:numberValue(row.amount),
        account:validAccount(candidate)?String(candidate):'',
        date:cleanDate(row.date??row.cutDate??row.cutoff)
      };
    });

    const payments=(Array.isArray(p.payments)?p.payments:[]).filter(isObject).map(row=>{
      const candidate=row.account??row.targetId??row.accountId??'';
      const destination=validAccount(candidate)?String(candidate):'';
      const destinationAccount=accountById.get(destination);
      let internal=typeof row.internal==='boolean'
        ? row.internal
        : Boolean(primaryAsset&&destinationAccount&&destinationAccount.id!==primaryAsset.id&&(destinationAccount.type==='credit'||destinationAccount.type==='savings'));
      let sourceAccount=validAccount(row.sourceAccount)&&accountById.get(String(row.sourceAccount))?.type!=='credit'
        ? String(row.sourceAccount)
        : '';
      if(internal&&(!sourceAccount||sourceAccount===destination))sourceAccount=primaryExcept(destination)?.id||'';
      if(internal&&!sourceAccount)internal=false;
      if(!internal)sourceAccount='';
      return{
        id:String(row.id||uid()),
        desc:String(row.desc??row.description??row.name??'Pago'),
        amount:numberValue(row.amount),
        account:destination,
        due:cleanDate(row.due??row.dueDate??row.date),
        paid:Boolean(row.paid),
        paidDate:cleanDate(row.paidDate),
        internal,
        sourceAccount
      };
    });

    periods[key]={incomes,expenses,payments};
  });

  const statements=(Array.isArray(source.statements)?source.statements:[]).filter(isObject).map(s=>({
    id:String(s.id||uid()),
    cardId:String(s.cardId??s.accountId??''),
    cutDate:cleanDate(s.cutDate),
    dueDate:cleanDate(s.dueDate??s.due),
    amount:Math.abs(numberValue(s.amount)),
    paid:Boolean(s.paid),
    paidDate:cleanDate(s.paidDate)
  })).filter(s=>validAccount(s.cardId)&&accountById.get(s.cardId)?.type==='credit');

  const sourceSettings=isObject(source.settings)?source.settings:{};
  const notificationDays=Array.isArray(sourceSettings.notificationDays)
    ? sourceSettings.notificationDays.map(numberValue).filter(n=>n>=0&&n<=60)
    : [7,3,1];

  if(!Object.keys(periods).length)throw new Error('El respaldo no contiene ninguna quincena válida.');

  return{
    schemaVersion:4,
    settings:{
      ...sourceSettings,
      notificationDays:notificationDays.length?notificationDays:[7,3,1],
      browserNotifications:Boolean(sourceSettings.browserNotifications)
    },
    accounts,
    statements,
    periods
  };
}

function replaceObjectContents(target,next){
  Object.keys(target).forEach(key=>delete target[key]);
  Object.assign(target,next);
}

function showImportedPeriod(next){
  const target=latestPeriodKey(next.periods);
  if(!target)return '';
  const month=document.querySelector('#month');
  const half=document.querySelector('#half');
  if(!month||!half)return target;

  const [ym,q]=target.split('|');
  month.value=ym;
  half.value=q;
  half.dispatchEvent(new Event('change',{bubbles:true}));
  return target;
}

function countMovements(periods){
  return Object.values(periods).reduce((total,p)=>total+(p.incomes?.length||0)+(p.expenses?.length||0)+(p.payments?.length||0),0);
}

async function importBackup(file,input){
  const raw=JSON.parse(await file.text());
  const migrated=migrateBudgetBackup(raw);
  const active=globalThis.__presupuestoOnlineState;
  if(!isObject(active))throw new Error('No pude acceder al estado activo de la aplicación.');

  const keys=sortedPeriodKeys(migrated.periods);
  const expectedMovements=countMovements(migrated.periods);

  replaceObjectContents(active,migrated);
  saveState(active);

  const stored=JSON.parse(localStorage.getItem('presupuesto-online-dark-v2')||'{}');
  const storedKeys=sortedPeriodKeys(stored.periods||{});
  const storedMovements=countMovements(stored.periods||{});
  if(storedKeys.length!==keys.length||storedMovements!==expectedMovements){
    throw new Error('La verificación del respaldo falló. No se guardaron todas las quincenas.');
  }

  input.value='';
  const opened=showImportedPeriod(migrated);

  const list=keys.map(describePeriod).join(' · ');
  const single=keys.length===1
    ? `\n\nImportante: este archivo solamente contiene una quincena (${describePeriod(keys[0])}).`
    : `\n\nQuincenas importadas: ${list}`;

  alert(`Respaldo importado COMPLETO.\n${migrated.accounts.length} cuentas · ${keys.length} quincenas · ${expectedMovements} movimientos.\nAbriendo ${describePeriod(opened)}.${single}`);
}

export function installImportFix(){
  if(document.documentElement.dataset.importFixInstalled==='1')return;
  document.documentElement.dataset.importFixInstalled='1';

  document.addEventListener('change',async event=>{
    const input=event.target;
    if(!(input instanceof HTMLInputElement)||input.id!=='import'||input.type!=='file')return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const file=input.files?.[0];
    if(!file)return;

    try{
      await importBackup(file,input);
    }catch(error){
      console.error('JSON import failed',error);
      input.value='';
      alert(`No se pudo importar el respaldo.\n${error?.message||'El archivo JSON no tiene un formato compatible.'}`);
    }
  },true);
}
