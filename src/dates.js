export function localToday(){
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseLocalDate(value){
  if (!value) return null;
  const [y,m,d] = value.split('-').map(Number);
  return new Date(y,m-1,d);
}

export function isoDate(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

export function daysBetween(from, to){
  const ms = new Date(to.getFullYear(),to.getMonth(),to.getDate()) - new Date(from.getFullYear(),from.getMonth(),from.getDate());
  return Math.round(ms/86400000);
}

function safeDate(year, monthIndex, day){
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(Number(day)||1, 1), lastDay));
}

export function nextOccurrence(day, from=localToday()){
  let d = safeDate(from.getFullYear(), from.getMonth(), day);
  if (d < from) d = safeDate(from.getFullYear(), from.getMonth()+1, day);
  return d;
}

export function dueDateForCut(cutDate, dueDay){
  let due = safeDate(cutDate.getFullYear(), cutDate.getMonth(), dueDay);
  if (due <= cutDate) due = safeDate(cutDate.getFullYear(), cutDate.getMonth()+1, dueDay);
  return due;
}

export function latestCutOnOrBefore(card, today=localToday()){
  let d = safeDate(today.getFullYear(), today.getMonth(), card.cutDay);
  if (d > today) d = safeDate(today.getFullYear(), today.getMonth()-1, card.cutDay);
  return d;
}

export function nextCut(card, today=localToday()){
  return nextOccurrence(card.cutDay, today);
}

export function nextDue(card, today=localToday()){
  const upcomingCut = nextCut(card, today);
  return dueDateForCut(upcomingCut, card.dueDay);
}

export function friendlyDate(date){
  return date.toLocaleDateString('es-DO',{day:'2-digit',month:'short',year:'numeric'});
}
