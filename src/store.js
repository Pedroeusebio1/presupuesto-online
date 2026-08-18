export const STORAGE_KEY = 'presupuesto-online-dark-v2';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const demoState = {
  settings: { notificationDays: [7, 3, 1], browserNotifications: false },
  accounts: [
    { id:'scotia-rd', name:'ScotiaBank RD$', type:'credit', baseBalance:0, limit:93500, cutDay:15, dueDay:10 },
    { id:'reservas-rd', name:'Banreservas RD$', type:'credit', baseBalance:9739.61, limit:100000, cutDay:null, dueDay:null },
    { id:'banesco-rd', name:'Banesco RD$', type:'credit', baseBalance:13772.92, limit:97000, cutDay:20, dueDay:11 },
    { id:'ahorro-casa', name:'Ahorro Casa', type:'savings', baseBalance:0, limit:0, cutDay:null, dueDay:null },
    { id:'cash', name:'Cuenta principal / Efectivo', type:'cash', baseBalance:0, limit:0, cutDay:null, dueDay:null }
  ],
  statements: [],
  periods: {
    '2026-08|2': {
      incomes: [
        { id:uid(), desc:'Salario Quincenal', amount:41008.85, date:'2026-08-30', received:false },
        { id:uid(), desc:'Ahorros RD$', amount:5000, date:'2026-08-30', received:false },
        { id:uid(), desc:'Electricidad de Sindy', amount:5273.71, date:'2026-08-30', received:false }
      ],
      expenses: [
        { id:uid(), desc:'SmartFit', amount:1690, account:'scotia-rd', date:'2026-08-18' },
        { id:uid(), desc:'Altice', amount:1955.01, account:'banesco-rd', date:'2026-08-18' }
      ],
      payments: [
        { id:uid(), desc:'Pago ScotiaBank RD$', amount:1690, account:'scotia-rd', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Pago Banreservas RD$', amount:9739.61, account:'reservas-rd', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Pago Banesco RD$', amount:13772.92, account:'banesco-rd', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Barbería', amount:500, account:'cash', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Moto', amount:10000, account:'cash', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Mami', amount:5000, account:'cash', due:'2026-08-31', paid:false, paidDate:'' },
        { id:uid(), desc:'Ahorro Casa', amount:10000, account:'ahorro-casa', due:'2026-08-31', paid:false, paidDate:'' }
      ]
    }
  }
};

export function clone(value){ return JSON.parse(JSON.stringify(value)); }

export function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : clone(demoState);
  } catch {
    return clone(demoState);
  }
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
