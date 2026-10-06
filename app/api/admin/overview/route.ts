import {currentProgramContext,isAccountContext} from '../../../../lib/clinic-runtime';
export async function GET(request:Request){
 try{
  const c=await currentProgramContext(request);if(!isAccountContext(c))return c;
  const [clinics,subscriptions,trials,audit]=await Promise.all([
   c.db.prepare(`SELECT c.id,c.name,c.primary_specialty,c.created_at,c.trial_ends_at,l.status AS license_status,l.expires_at,
    (SELECT email FROM clinic_memberships m WHERE m.clinic_id=c.id AND m.user_id=c.owner_user_id LIMIT 1) AS owner_email,
    (SELECT COUNT(*) FROM clinic_memberships m WHERE m.clinic_id=c.id AND m.active=1) AS staff_count,
    (SELECT COUNT(*) FROM clinic_branches b WHERE b.clinic_id=c.id AND b.status='active') AS branch_count
    FROM clinics c LEFT JOIN licenses l ON l.id=c.license_id ORDER BY c.created_at DESC LIMIT 500`).all(),
   c.db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN payment_status='paid' THEN amount_ils ELSE 0 END),0) AS receipts,COALESCE(SUM(CASE WHEN payment_status='pending' THEN 1 ELSE 0 END),0) AS pending FROM subscriptions").first(),
   c.db.prepare("SELECT COUNT(*) AS pending FROM trial_requests WHERE status='pending'").first(),
   c.db.prepare("SELECT a.id,a.action,a.resource_type,a.created_at,c.name AS clinic_name FROM audit_logs a LEFT JOIN clinics c ON c.id=a.clinic_id ORDER BY a.created_at DESC LIMIT 100").all()
  ]);
  return Response.json({clinics:clinics.results,subscriptions,trials,audit:audit.results},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load program administration.'},{status:503});}
}
