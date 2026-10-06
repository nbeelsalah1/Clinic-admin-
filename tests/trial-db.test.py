"""Exercise the production SQL with SQLite to check trial race and conversion boundaries."""
import pathlib, sqlite3, re
root=pathlib.Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
for migration in sorted((root/'drizzle').glob('*.sql')): db.executescript(migration.read_text())
source=(root/'app/api/admin/trials/route.ts').read_text()
queries=re.findall(r'ctx\.db\.prepare\("([^"]+)"\)',source)
def sql(prefix): return next(q for q in queries if q.startswith(prefix))
db.execute("INSERT INTO trial_requests (id,user_id,email_hash,email_enc,clinic_name) VALUES ('trial','user','email-hash','cipher','Clinic')")
try:
 db.execute("INSERT INTO trial_requests (id,user_id,email_hash,email_enc,clinic_name) VALUES ('duplicate','new-user','email-hash','cipher','Clinic')")
 raise AssertionError('same verified email allowed a second trial')
except sqlite3.IntegrityError: pass
def approve(clinic):
 with db:
  db.execute(sql('INSERT INTO clinics'),(clinic,'Clinic','user','2030-01-01T12:00:00Z','trial'))
  db.execute(sql('INSERT INTO clinic_memberships'),('member-'+clinic,clinic,'user','user@example.com',clinic,'user'))
  db.execute(sql("UPDATE trial_requests SET status = 'approved'"),(clinic,'2029-12-02T12:00:00Z','2030-01-01T12:00:00Z','admin','trial',clinic))
approve('winner')
approve('loser')
assert db.execute('SELECT COUNT(*) FROM clinics').fetchone()[0]==1
assert db.execute('SELECT COUNT(*) FROM clinic_memberships').fetchone()[0]==1
assert db.execute('SELECT clinic_id FROM trial_requests').fetchone()[0]=='winner'
changed=db.execute(sql("UPDATE trial_requests SET status = 'rejected'"),('admin','trial')).rowcount
assert changed==0, 'a stale rejection overwrote approval'
db.execute("INSERT INTO subscriptions (id,clinic_name,contact_email,plan,term,amount_ils,payment_status,created_by) VALUES ('paid','Clinic','user@example.com','starter','monthly',49,'paid','admin')")
db.execute("INSERT INTO licenses (id,subscription_id,key_hash,key_hint,status,clinic_id,expires_at) VALUES ('license','paid','keyhash','hint','active','winner','2031-01-01T00:00:00Z')")
db.execute("UPDATE clinics SET license_id = 'license' WHERE id = 'winner'")
activation=(root/'app/api/license/activate/route.ts').read_text()
conversion=next(q for q in re.findall(r'env\.DB\.prepare\("([^"]+)"\)',activation) if q.startswith('UPDATE trial_requests'))
db.execute(conversion,('winner',))
assert db.execute('SELECT status FROM trial_requests').fetchone()[0]=='converted'
assert db.execute('SELECT COUNT(*) FROM clinics').fetchone()[0]==1
assert db.execute('SELECT clinic_id FROM clinic_memberships').fetchone()[0]=='winner'
print('Migrations, trial uniqueness, duplicate-review safety, and paid conversion pass.')
