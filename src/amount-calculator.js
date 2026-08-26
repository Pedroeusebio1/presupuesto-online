let activeInput=null;
let overlay=null;
let observer=null;

const OPERATORS={'+':'+','-':'−','*':'×','/':'÷'};

function parseMoney(value){
  let s=String(value??'').trim().replace(/\s/g,'').replace(/RD\$/gi,'');
  if(!s)return 0;
  if(s.includes(',')&&s.includes('.'))s=s.replace(/,/g,'');
  else if(s.includes(',')){
    const parts=s.split(',');
    s=parts.length===2&&parts[1].length<=2?`${parts[0]}.${parts[1]}`:s.replace(/,/g,'');
  }
  s=s.replace(/[^0-9.-]/g,'');
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}

function accountingNumber(value){
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
}

function cleanNumber(value){
  if(!Number.isFinite(value))return 0;
  return Math.round(value*1e10)/1e10;
}

function screenValue(raw){
  const text=String(raw||'0');
  const negative=text.startsWith('-');
  const unsigned=negative?text.slice(1):text;
  const [whole='0',decimal]=unsigned.split('.');
  const grouped=Number(whole||0).toLocaleString('en-US');
  return `${negative?'-':''}${grouped}${decimal!==undefined?`.${decimal}`:''}`;
}

function calculate(a,b,operator){
  if(operator==='+')return cleanNumber(a+b);
  if(operator==='-')return cleanNumber(a-b);
  if(operator==='*')return cleanNumber(a*b);
  if(operator==='/')return b===0?null:cleanNumber(a/b);
  return b;
}

function enhanceMoneyInputs(root=document){
  root.querySelectorAll('input[data-money]:not([data-calculator-ready])').forEach(input=>{
    input.dataset.calculatorReady='true';
    const button=document.createElement('button');
    button.type='button';
    button.className='amount-calc-trigger';
    button.setAttribute('aria-label','Abrir calculadora para este monto');
    button.title='Calculadora';
    button.textContent='🧮';
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      openCalculator(input);
    });

    if(input.parentElement?.classList.contains('money-input')){
      input.parentElement.appendChild(button);
    }else{
      const wrapper=document.createElement('div');
      wrapper.className='calc-field-wrap';
      input.parentNode.insertBefore(wrapper,input);
      wrapper.append(input,button);
    }
  });
}

function closeCalculator(){
  if(!overlay)return;
  document.removeEventListener('keydown',handleKeyboard,true);
  overlay.remove();
  overlay=null;
  activeInput=null;
}

let state={display:'0',accumulator:null,pending:null,replaceDisplay:false,error:''};

function updateCalculatorScreen(){
  if(!overlay)return;
  const display=overlay.querySelector('[data-calc-display]');
  const expression=overlay.querySelector('[data-calc-expression]');
  const useButton=overlay.querySelector('[data-calc-use]');
  const error=overlay.querySelector('[data-calc-error]');
  display.textContent=screenValue(state.display);
  expression.textContent=state.pending&&state.accumulator!==null?`${screenValue(String(state.accumulator))} ${OPERATORS[state.pending]}`:'Calculadora de monto';
  error.textContent=state.error;
  const value=Number(state.display);
  useButton.textContent=`Usar RD$ ${accountingNumber(Number.isFinite(value)?value:0)}`;
}

function clearCalculator(){
  state={display:'0',accumulator:null,pending:null,replaceDisplay:false,error:''};
  updateCalculatorScreen();
}

function enterDigit(digit){
  state.error='';
  if(state.replaceDisplay||state.display==='0'){
    state.display=digit;
    state.replaceDisplay=false;
  }else if(state.display.replace('-','').replace('.','').length<14){
    state.display+=digit;
  }
  updateCalculatorScreen();
}

function enterDecimal(){
  state.error='';
  if(state.replaceDisplay){
    state.display='0.';
    state.replaceDisplay=false;
  }else if(!state.display.includes('.')){
    state.display+='.';
  }
  updateCalculatorScreen();
}

function chooseOperator(operator){
  state.error='';
  const current=Number(state.display);
  if(!Number.isFinite(current))return;

  if(state.pending&&state.accumulator!==null&&!state.replaceDisplay){
    const result=calculate(state.accumulator,current,state.pending);
    if(result===null){
      state.error='No se puede dividir entre cero.';
      updateCalculatorScreen();
      return;
    }
    state.accumulator=result;
    state.display=String(result);
  }else{
    state.accumulator=current;
  }

  state.pending=operator;
  state.replaceDisplay=true;
  updateCalculatorScreen();
}

function equals(){
  if(!state.pending||state.accumulator===null)return;
  const current=Number(state.display);
  const result=calculate(state.accumulator,current,state.pending);
  if(result===null){
    state.error='No se puede dividir entre cero.';
    updateCalculatorScreen();
    return;
  }
  state.display=String(result);
  state.accumulator=null;
  state.pending=null;
  state.replaceDisplay=true;
  state.error='';
  updateCalculatorScreen();
}

function toggleSign(){
  if(state.display==='0')return;
  state.display=state.display.startsWith('-')?state.display.slice(1):`-${state.display}`;
  updateCalculatorScreen();
}

function backspace(){
  if(state.replaceDisplay)return;
  const next=state.display.slice(0,-1);
  state.display=next&&next!=='-'?next:'0';
  updateCalculatorScreen();
}

function applyResult(){
  if(!activeInput)return closeCalculator();
  const value=Number(state.display);
  if(!Number.isFinite(value))return;
  const input=activeInput;
  input.value=accountingNumber(value);
  closeCalculator();
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function pressKey(key){
  if(/^\d$/.test(key))return enterDigit(key);
  if(key==='.')return enterDecimal();
  if(['+','-','*','/'].includes(key))return chooseOperator(key);
  if(key==='Enter'||key==='=')return equals();
  if(key==='Backspace')return backspace();
  if(key==='Escape')return closeCalculator();
  if(key==='Delete')return clearCalculator();
}

function handleKeyboard(event){
  if(!overlay)return;
  if(['Enter','Backspace','Escape','Delete','+','-','*','/','=','.',...Array.from('0123456789')].includes(event.key)){
    event.preventDefault();
    pressKey(event.key);
  }
}

function openCalculator(input){
  closeCalculator();
  activeInput=input;
  const initial=parseMoney(input.value);
  state={display:String(initial),accumulator:null,pending:null,replaceDisplay:false,error:''};

  overlay=document.createElement('div');
  overlay.className='amount-calc-backdrop';
  overlay.innerHTML=`
    <section class="amount-calculator" role="dialog" aria-modal="true" aria-label="Calculadora de monto">
      <div class="amount-calc-head">
        <div>
          <small data-calc-expression>Calculadora de monto</small>
          <strong data-calc-display>0</strong>
        </div>
        <button type="button" class="amount-calc-close" aria-label="Cerrar calculadora">✕</button>
      </div>
      <div class="amount-calc-error" data-calc-error aria-live="polite"></div>
      <div class="amount-calc-grid">
        <button type="button" data-action="clear">AC</button>
        <button type="button" data-action="sign">±</button>
        <button type="button" data-action="backspace">⌫</button>
        <button type="button" data-op="/">÷</button>
        <button type="button" data-digit="7">7</button>
        <button type="button" data-digit="8">8</button>
        <button type="button" data-digit="9">9</button>
        <button type="button" data-op="*">×</button>
        <button type="button" data-digit="4">4</button>
        <button type="button" data-digit="5">5</button>
        <button type="button" data-digit="6">6</button>
        <button type="button" data-op="-">−</button>
        <button type="button" data-digit="1">1</button>
        <button type="button" data-digit="2">2</button>
        <button type="button" data-digit="3">3</button>
        <button type="button" data-op="+">+</button>
        <button type="button" class="zero" data-digit="0">0</button>
        <button type="button" data-action="decimal">.</button>
        <button type="button" class="equals" data-action="equals">=</button>
      </div>
      <button type="button" class="amount-calc-use" data-calc-use>Usar resultado</button>
    </section>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(event.target===overlay)return closeCalculator();
    if(!button)return;
    if(button.classList.contains('amount-calc-close'))return closeCalculator();
    if(button.dataset.digit!==undefined)return enterDigit(button.dataset.digit);
    if(button.dataset.op)return chooseOperator(button.dataset.op);
    if(button.dataset.action==='decimal')return enterDecimal();
    if(button.dataset.action==='clear')return clearCalculator();
    if(button.dataset.action==='sign')return toggleSign();
    if(button.dataset.action==='backspace')return backspace();
    if(button.dataset.action==='equals')return equals();
    if(button.dataset.calcUse!==undefined)return applyResult();
  });

  document.addEventListener('keydown',handleKeyboard,true);
  updateCalculatorScreen();
  overlay.querySelector('[data-digit="7"]').focus();
}

export function installAmountCalculator(){
  enhanceMoneyInputs();
  if(observer)return;
  observer=new MutationObserver(()=>enhanceMoneyInputs());
  observer.observe(document.body,{childList:true,subtree:true});
}
