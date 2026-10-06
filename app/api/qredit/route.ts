import { currentClinicContext,decryptPrivate,isClinicContext } from '../../../lib/clinic-runtime';
import { canAccess,moneyMinor } from '../../../lib/ops-model';
import { qreditGet,qreditPost,qreditRecords,qreditToken } from '../../../lib/qredit';
import { z } from 'zod';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const uuid=z.string().uuid();
function ref(record:Record<string,unknown>,...keys:string[]){for(const key of keys){const v=record[key];if(typeof v==='string'&&v)return v;}return '';}
function providerError(error:unknown){return error instanceof Error&&error.message==='QREDIT_UNCONFIGURED'?'بوابة الدفع غير مهيأة بعد.': 'تعذر الاتصال ببوابة الدفع. تحقق من الإعدادات أو أعد المحاولة لاحقاً.';}
export async function POST(request:Request){
 try{
  const c=await currentClinicContext(request);if(!isClinicContext(c))return c;if(!canAccess(c.role,'billing',true))return reply({error:'غير مصرح لك بإدارة الفواتير.'},403);
  const body=z.object({action:z.enum(['checkout','status']),invoiceId:uuid.optional(),paymentId:uuid.optional()}).parse(await request.json());
  if(body.action==='checkout'){
   if(!body.invoiceId)return reply({error:'فاتورة غير صالحة.'},400);
   const invoice=await c.db.prepare("SELECT i.id,i.total,i.paid,i.status,p.full_name_enc,p.phone_enc,p.email_enc FROM invoices i JOIN patients p ON p.id=i.patient_id AND p.clinic_id=i.clinic_id WHERE i.clinic_id=? AND i.branch_id=? AND i.id=?").bind(c.clinicId,c.branchId,body.invoiceId).first<{id:string;total:number;paid:number;status:string;full_name_enc:string;phone_enc:string;email_enc:string}>();
   if(!invoice||invoice.status==='void')return reply({error:'الفاتورة غير متاحة.'},404);const amount=invoice.total-invoice.paid;if(amount<=0)return reply({error:'الفاتورة مسددة بالكامل.'},409);
   const existing=await c.db.prepare("SELECT id,checkout_url,status FROM qredit_payments WHERE clinic_id=? AND branch_id=? AND invoice_id=? AND amount=? AND status IN ('creating','pending') ORDER BY created_at DESC LIMIT 1").bind(c.clinicId,c.branchId,invoice.id,amount).first<{id:string;checkout_url:string|null;status:string}>();
   if(existing?.checkout_url)return reply({paymentId:existing.id,checkoutUrl:existing.checkout_url,status:existing.status});if(existing)return reply({error:'طلب الدفع قيد الإنشاء. أعد المحاولة بعد قليل.'},409);
   const paymentId=crypto.randomUUID(),clientReference='clinic-'+crypto.randomUUID();const cents=moneyMinor(amount/100);if(cents<1)return reply({error:'قيمة الفاتورة غير صالحة.'},409);
   await c.db.prepare("INSERT INTO qredit_payments (id,clinic_id,branch_id,invoice_id,client_reference,amount,currency,status) VALUES (?,?,?,?,?,?,'ILS','creating')").bind(paymentId,c.clinicId,c.branchId,invoice.id,clientReference,amount).run();
   try{
    const token=await qreditToken();const orderResponse=await qreditPost('/orders',{amountCents:cents,currencyCode:'ILS',clientReference,items:[{name:'Clinic service',quantity:1,unitPriceCents:cents}]},token);const order=qreditRecords(orderResponse)[0]??orderResponse;const orderReference=ref(order,'orderReference','reference');if(!orderReference)throw new Error('QREDIT_PROVIDER_ERROR');
    await c.db.prepare('UPDATE qredit_payments SET order_reference=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND clinic_id=? AND branch_id=?').bind(orderReference,paymentId,c.clinicId,c.branchId).run();
    const name=await decryptPrivate(invoice.full_name_enc),phone=await decryptPrivate(invoice.phone_enc),email=await decryptPrivate(invoice.email_enc);
    const paymentResponse=await qreditPost('/paymentRequests',{orderReference,amountCents:cents,currencyCode:'ILS',lockOrderWhenPaid:true,expiration:30,paymentChannels:[{code:'CSAB'},{code:'esadad_biller'},{code:'NC-QR'}],customerInfo:{name,...(phone?{phoneNumber:phone}:{}),...(email?{email}:{})}},token);const payment=qreditRecords(paymentResponse)[0]??paymentResponse;const paymentReference=ref(payment,'reference','paymentReference'),checkoutUrl=ref(payment,'url','checkoutUrl','paymentUrl');
    if(!paymentReference||!checkoutUrl)throw new Error('QREDIT_PROVIDER_ERROR');const checkout=new URL(checkoutUrl);if(checkout.protocol!=='https:'||!(checkout.hostname==='qredit.tech'||checkout.hostname.endsWith('.qredit.tech')))throw new Error('QREDIT_PROVIDER_ERROR');
    await c.db.prepare("UPDATE qredit_payments SET payment_reference=?,checkout_url=?,provider_status=?,status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND clinic_id=? AND branch_id=?").bind(paymentReference,checkout.toString(),ref(payment,'paymentRequestStatus','status')||'PENDING_PAYMENT',paymentId,c.clinicId,c.branchId).run();
    await c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'qredit.checkout.created','billing',?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,invoice.id).run();return reply({paymentId,checkoutUrl:checkout.toString(),status:'pending'});
   }catch(error){await c.db.prepare("UPDATE qredit_payments SET status='failed',provider_status='PROVIDER_ERROR',updated_at=CURRENT_TIMESTAMP WHERE id=? AND clinic_id=?").bind(paymentId,c.clinicId).run();return reply({error:providerError(error)},502);}
  }
  if(!body.paymentId)return reply({error:'مرجع الدفع غير صالح.'},400);
  const payment=await c.db.prepare('SELECT * FROM qredit_payments WHERE clinic_id=? AND branch_id=? AND id=?').bind(c.clinicId,c.branchId,body.paymentId).first<{id:string;invoice_id:string;amount:number;currency:string;client_reference:string;order_reference:string;payment_reference:string;status:string}>();if(!payment)return reply({error:'طلب الدفع غير موجود.'},404);
  if(payment.status==='paid')return reply({status:'paid'});if(!payment.order_reference||!payment.payment_reference)return reply({status:payment.status});
  const token=await qreditToken();const paymentData=qreditRecords(await qreditGet('/paymentRequests',{reference:payment.payment_reference},token))[0];if(!paymentData)return reply({error:'لم يصل رد حالة الدفع من البوابة.'},502);
  const pStatus=ref(paymentData,'paymentRequestStatus','status');
  if(pStatus!=='PAID'){
   const nextStatus=pStatus==='CANCELLED'?'cancelled':pStatus==='EXPIRED'?'expired':'pending';await c.db.prepare('UPDATE qredit_payments SET provider_status=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND clinic_id=? AND branch_id=? AND status!=\'paid\'').bind(pStatus||'UNKNOWN',nextStatus,payment.id,c.clinicId,c.branchId).run();return reply({status:nextStatus});
  }
  const orderData=qreditRecords(await qreditGet('/orders',{orderReference:payment.order_reference},token))[0];if(!orderData)return reply({error:'تعذر مطابقة الطلب مع الفاتورة.'},502);
  const matches=ref(paymentData,'reference','paymentReference')===payment.payment_reference&&ref(paymentData,'orderReference')===payment.order_reference&&ref(orderData,'orderReference','reference')===payment.order_reference&&ref(orderData,'clientReference')===payment.client_reference&&Number(paymentData.amountCents)===moneyMinor(payment.amount/100)&&String(paymentData.currencyCode??'')==='ILS'&&['PAID','COMPLETED'].includes(ref(orderData,'orderStatus','status'))&&Number(orderData.amountCents)===moneyMinor(payment.amount/100)&&String(orderData.currencyCode??'')==='ILS';
  if(!matches)return reply({error:'تعذر التحقق من تطابق مبلغ العملية والفاتورة.'},409);
  const ledgerId=crypto.randomUUID();const result=await c.db.batch([
   c.db.prepare("INSERT OR IGNORE INTO invoice_payments (id,clinic_id,branch_id,invoice_id,amount,method,request_key) SELECT ?,clinic_id,branch_id,id,?,'qredit',? FROM invoices WHERE clinic_id=? AND branch_id=? AND id=? AND status!='void' AND total-paid>=?").bind(ledgerId,payment.amount,'qredit:'+payment.id,c.clinicId,c.branchId,payment.invoice_id,payment.amount),
   c.db.prepare("UPDATE invoices SET paid=paid+?,status=CASE WHEN paid+?>=total THEN 'paid' ELSE 'issued' END WHERE clinic_id=? AND branch_id=? AND id=? AND EXISTS (SELECT 1 FROM invoice_payments WHERE request_key=? AND invoice_id=? AND clinic_id=? AND branch_id=?)").bind(payment.amount,payment.amount,c.clinicId,c.branchId,payment.invoice_id,'qredit:'+payment.id,payment.invoice_id,c.clinicId,c.branchId),
   c.db.prepare("UPDATE qredit_payments SET status='paid',provider_status='PAID',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND clinic_id=? AND branch_id=? AND EXISTS (SELECT 1 FROM invoice_payments WHERE request_key=? AND invoice_id=? AND clinic_id=? AND branch_id=?)").bind(payment.id,c.clinicId,c.branchId,'qredit:'+payment.id,payment.invoice_id,c.clinicId,c.branchId),
   c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'qredit.payment.verified','billing',? WHERE EXISTS (SELECT 1 FROM invoice_payments WHERE request_key=? AND clinic_id=? AND branch_id=?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,payment.invoice_id,'qredit:'+payment.id,c.clinicId,c.branchId)
  ]);return result[2].meta.changes?reply({status:'paid'}):reply({error:'تعذر تسجيل الدفعة على الفاتورة.'},409);
 }catch(error){return reply({error:providerError(error)},502);}
}
