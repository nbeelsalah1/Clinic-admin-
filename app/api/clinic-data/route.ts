import { canAccess } from "../../../lib/ops-model";
import { currentAccountContext, isAccountContext, currentClinicContext, decryptPrivate, isClinicContext } from "../../../lib/clinic-runtime";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  if (message.includes("APP_DATA_KEY")) return "Secure data encryption is not configured. Contact the program administrator.";
  return message.includes("no such table") ? "The database migration has not been applied yet." : "Could not complete the database request.";
}

function localStatus(value: string) {
  return value === "waiting" ? "بالانتظار" : value === "completed" ? "مكتمل" : "قادم";
}

export async function GET(request: Request) {
  try {
    const account=await currentAccountContext(request);
    if(!isAccountContext(account))return account;
    if(account.isSuperAdmin)return Response.json({user:{role:'super_admin',isSuperAdmin:true},scope:'program'},{headers:{'Cache-Control':'no-store'}});
    const context = await currentClinicContext(request);
    if (!isClinicContext(context)) return context;
    const branches=context.role==='clinic_admin'||context.isSuperAdmin?(await context.db.prepare("SELECT id,name FROM clinic_branches WHERE clinic_id=? AND status='active' ORDER BY is_default DESC,name").bind(context.clinicId).all<{id:string;name:string}>()).results:(await context.db.prepare("SELECT b.id,b.name FROM clinic_branch_memberships bm JOIN clinic_branches b ON b.id=bm.branch_id WHERE bm.clinic_id=? AND bm.user_id=? AND bm.active=1 AND b.status='active' ORDER BY b.is_default DESC,b.name").bind(context.clinicId,context.user.userId).all<{id:string;name:string}>()).results;
    if (!canAccess(context.role,"patients")) return Response.json({ clinic:{id:context.clinicId,name:context.clinicName,trialEndsAt:context.trialEndsAt},branch:{id:context.branchId,name:context.branchName,branches},patients:[],appointments:[],counts:{patients:0},user:{role:context.role,isSuperAdmin:context.isSuperAdmin}});
    const [patientRows, appointmentRows, counts] = await Promise.all([
      context.db.prepare("SELECT * FROM patients WHERE clinic_id = ? ORDER BY created_at DESC LIMIT 200").bind(context.clinicId).all<Record<string, string>>(),
      context.db.prepare("SELECT * FROM appointments WHERE clinic_id = ? AND branch_id=? AND status != 'cancelled' ORDER BY starts_at LIMIT 200").bind(context.clinicId,context.branchId).all<Record<string, string>>(),
      context.db.prepare("SELECT COUNT(*) AS patients FROM patients WHERE clinic_id = ?").bind(context.clinicId).first<{ patients: number }>(),
    ]);
    const patients = await Promise.all((patientRows.results ?? []).map(async (row) => ({
      id: row.id,
      name: await decryptPrivate(row.full_name_enc),
      phone: await decryptPrivate(row.phone_enc),
      patientId: row.id.slice(0, 8).toUpperCase(),
      doctor: "—",
      lastVisit: row.created_at,
      status: "متابعة",
    })));
    const appointments = await Promise.all((appointmentRows.results ?? []).map(async (row) => {
      const date = new Date(row.starts_at);
      return {
        id: row.id,
        time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hebron" }).format(date),
        name: await decryptPrivate(row.patient_name_enc),
        type: row.service,
        doctor: row.doctor_name,
        tone: "blue",
        status: localStatus(row.status),
        startsAt: row.starts_at,
      };
    }));
    return Response.json({ clinic: { id: context.clinicId, name: context.clinicName, trialEndsAt: context.trialEndsAt },branch:{id:context.branchId,name:context.branchName,branches}, patients, appointments, counts: { patients: counts?.patients ?? 0, appointments: appointments.length }, user: { role: context.role, isSuperAdmin: context.isSuperAdmin } });
  } catch (error) {
    console.error("clinic-data GET failed", error);
    return Response.json({ error: safeError(error) }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const { POST } = await import('../ops/route');
  const raw = await request.json() as Record<string, unknown>;
  if (raw.type !== 'patient') return Response.json({error:'Use the appointment form with a registered patient and doctor.'},{status:400});
  const data:Record<string,unknown>={name:raw.fullName,phone:raw.phone};
  for(const key of ['email','identityNumber','address','history','allergies','medications','gender','birthDate'])if(raw[key]!==undefined)data[key]=raw[key];
  return POST(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({module:'patients',data})}));
}
export async function PATCH(request: Request) {
  const { PATCH } = await import('../ops/route');
  const raw = await request.json() as {id?:string;status?:string};
  return PATCH(new Request(request.url,{method:'PATCH',headers:request.headers,body:JSON.stringify({module:'appointments',action:'status',...raw})}));
}
