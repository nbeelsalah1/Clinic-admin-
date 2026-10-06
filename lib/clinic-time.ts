const zone='Asia/Hebron';
export function clinicDate(value:Date|string|number=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const get=(key:string)=>parts.find(p=>p.type===key)!.value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function clinicDayStart(day:string){
 const target=Date.parse(day+'T00:00:00Z');let instant=target;
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  const local=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));instant+=target-local;
 }
 return new Date(instant).toISOString();
}
export function followingDay(day:string){return new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);}
export function clinicLocalDateTime(value:Date|string|number){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));const get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function clinicTimeToISO(value:string){
 if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new Error('Enter a valid Palestine clinic date and time');
 const target=Date.parse(value+':00Z');let instant=target;for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));const get=(key:string)=>Number(parts.find(p=>p.type===key)!.value);
  instant+=target-Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
 }return new Date(instant).toISOString();
}
