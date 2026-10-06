import { createHash, createHmac } from 'node:crypto';
import { env } from 'cloudflare:workers';

const API_BASE='https://api.qredit.tech/gw-checkout/api/v1';
type QreditObject=Record<string,unknown>;
function credentials(){return env;}

function flatten(value:unknown,out:string[]=[]):string[]{
 if(value===null||value===undefined)return out;
 if(Array.isArray(value)){for(const item of value)flatten(item,out);return out;}
 if(typeof value==='object'){for(const item of Object.values(value as Record<string,unknown>))flatten(item,out);return out;}
 const s=typeof value==='boolean'?String(value):String(value);if(s!=='')out.push(s);return out;
}
function signature(body:QreditObject,secret:string,msgId:string,token?:string){
 const values=flatten(body);if(token)values.push(token);values.sort((a,b)=>a<b?-1:a>b?1:0);
 const key=createHash('md5').update(secret+msgId,'utf8').digest();
 return createHmac('sha512',key).update(values.join(''),'utf8').digest('hex').toUpperCase();
}
async function request(path:string,payload:QreditObject,token?:string):Promise<QreditObject>{
 const env=credentials();const apiKey=env?.QREDIT_API_KEY,secret=env?.QREDIT_SECRET_KEY;if(!apiKey||!secret)throw new Error('QREDIT_UNCONFIGURED');
 const msgId=crypto.randomUUID().replaceAll('-','');const body={...payload,msgId};
 const headers:Record<string,string>={'Accept':'application/json','Content-Type':'application/json','Accept-Language':'EN','Client-Type':'TP','Client-Version':'ccc1.0.0','Authorization':'HmacSHA512_O '+signature(body,secret,msgId,token)};
 if(token)headers['X-Auth-Token']=token;
 const response=await fetch(API_BASE+path,{method:'POST',headers,body:JSON.stringify(path==='/auth/token'?{...body,apiKey}:body),redirect:'error',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null) as QreditObject|null;if(!response.ok||!data||data.status===false)throw new Error('QREDIT_PROVIDER_ERROR');return data;
}
export async function qreditToken(){const env=credentials();if(!env?.QREDIT_API_KEY||!env.QREDIT_SECRET_KEY)throw new Error('QREDIT_UNCONFIGURED');const res=await request('/auth/token',{apiKey:env.QREDIT_API_KEY});const token=typeof res.access_token==='string'?res.access_token:'';if(!token)throw new Error('QREDIT_PROVIDER_ERROR');return token;}
export async function qreditPost(path:string,body:QreditObject,token:string){return request(path,body,token);}
export async function qreditGet(path:string,query:QreditObject,token:string){
 const env=credentials();const apiKey=env?.QREDIT_API_KEY,secret=env?.QREDIT_SECRET_KEY;if(!apiKey||!secret)throw new Error('QREDIT_UNCONFIGURED');
 const msgId=crypto.randomUUID().replaceAll('-','');const body={...query,msgId};const values=flatten(body);values.push(token);values.sort((a,b)=>a<b?-1:a>b?1:0);
 const key=createHash('md5').update(secret+msgId,'utf8').digest();const sign=createHmac('sha512',key).update(values.join(''),'utf8').digest('hex').toUpperCase();
 const params=new URLSearchParams(Object.entries(body).map(([k,v])=>[k,String(v)]));const headers={'Accept':'application/json','Accept-Language':'EN','Client-Type':'TP','Client-Version':'ccc1.0.0','X-Auth-Token':token,'Authorization':'HmacSHA512_O '+sign};
 const response=await fetch(API_BASE+path+'?'+params.toString(),{headers,redirect:'error',signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null) as QreditObject|null;if(!response.ok||!data||data.status===false)throw new Error('QREDIT_PROVIDER_ERROR');return data;
}
export function qreditRecords(result:QreditObject):QreditObject[]{const records=result.records;return Array.isArray(records)?records.filter((r):r is QreditObject=>!!r&&typeof r==='object'):[];}
