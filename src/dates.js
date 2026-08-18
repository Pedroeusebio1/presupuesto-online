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

export function nextOccurrence(day, from=localToday()){
  let d = new Date(from.getFullYear(), from.getMonth(), day);
  if (d < from) d = new Date(from.getFullYear(), from.getMonth()+1, day);
  return d;
}

export function dueDateForCut(cutDate, dueDay){
  let due = new Date(cutDate.getFullYear(), cutDate.getMonth(), dueDay);
  if (due <= cutDate) due = new Date(cutDate.getFullYear(), cutDate.getMonth()+1, dueDay);
  return due;
}

export function latestCutOnOrBefore(card, today=localToday()){
  let d = new Date(today.getFullYear(), today.getMonth(), card.cutDay);
  if (d > today) d = new Date(today.getFullYear(), today.getMonth()-1, card.cutDay);
  return d;
}

export function nextCut(card, today=localToday()){
  return nextOccurrence(card.cutDay, today);
}

export function nextDue(card, today=localToday()){
  const recentCut = latestCutOnOrBefore(card, today);
  let due = dueDateForCut(recentCut, card.dueDay);
  if (due < today) {
    const upcomingCut = nextCut(card, today);
    due = dueDateForCut(upcomingCut, card.dueDay);
  }
  return due;
}

export function friendlyDate(date){
  return date.toLocaleDateString('es-DO',{day:'2-digit',month:'short',year:'numeric'});
}
