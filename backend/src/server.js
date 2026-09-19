import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { buildLevelProfile, generateRegistrationNumber } from './services/registration.js';
import { assignQuizPaper } from './services/paperAssignment.js';
import { encryptSensitive } from './services/crypto.js';
import { createToken, hashPassword, readToken, verifyPassword } from './services/auth.js';
import db, { getSetting, setSetting } from './db.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const plans = [{ months: 1, amount: 200 }, { months: 3, amount: 500 }, { months: 6, amount: 1000 }, { months: 12, amount: 2000 }];
const now = () => new Date().toISOString();
const addMonths = (date, months) => { const value = new Date(date); value.setMonth(value.getMonth() + Number(months)); return value.toISOString(); };
const parseProfile = row => ({ level: row.level, stream: row.stream, field: row.field, programName: row.program_name, year: row.year, semesterRange: row.semester_range, status: row.status, nursingType: row.nursing_type, programDuration: row.program_duration, programType: row.program_type });
const paymentFor = studentId => db.prepare("SELECT * FROM payments WHERE student_id=? AND status='Paid' ORDER BY cycle_end DESC LIMIT 1").get(studentId);
function syncStudentStatus(studentId) {
  const payment = paymentFor(studentId);
  const status = payment && new Date(payment.cycle_end) >= new Date() ? 'Active' : 'Disable';
  db.prepare('UPDATE students SET registration_status=? WHERE id=?').run(status, studentId);
  return { status, payment };
}
function serializeStudent(row) {
  if (!row) return null;
  const access = syncStudentStatus(row.id);
  return { id: row.id, fullName: row.full_name, fatherName: row.father_name, mobile: row.mobile, email: row.email, gender: row.gender, city: row.city,
    tehsil: row.tehsil, schoolName: row.school_name, levelProfile: parseProfile(row), assignedPaper: row.assigned_paper, registrationNumber: row.registration_number,
    registrationStatus: access.status, blocked: Boolean(row.blocked), paidThrough: access.payment?.cycle_end || null, createdAt: row.created_at };
}
function auth(requiredRole) {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const session = readToken(token);
    if (!session || (requiredRole && session.role !== requiredRole)) return res.status(401).json({ error: 'Authentication required' });
    req.session = session; next();
  };
}
function notify(studentId, type, title, message, channel = 'Website') {
  db.prepare('INSERT INTO notifications(student_id,type,title,message,channel,created_at) VALUES(?,?,?,?,?,?)').run(studentId || null, type, title, message, channel, now());
}
function seed() {
  let student = db.prepare("SELECT * FROM students WHERE email='areeba@example.com'").get();
  if (!student) {
    const profile = buildLevelProfile({ level: '9th', stream: 'Biology' });
    const result = db.prepare(`INSERT INTO students(full_name,father_name,mobile,email,gender,city,tehsil,school_name,cnic_encrypted,password_hash,level,stream,level_profile_json,assigned_paper,registration_number,registration_status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('Areeba Khan','Muhammad Khan','03001234567','areeba@example.com','Female','Sargodha','Sargodha','Danistan Model School',encryptSensitive('35202-1234567-8'),hashPassword('Student123!'),profile.level,profile.stream,JSON.stringify(profile),assignQuizPaper(profile),generateRegistrationNumber({ gender:'Female', city:'Sargodha', serial:1 }),'Active',now());
    student = db.prepare('SELECT * FROM students WHERE id=?').get(result.lastInsertRowid);
  }
  if (!student.password_hash) db.prepare('UPDATE students SET password_hash=?, level=?, stream=?, level_profile_json=?, assigned_paper=? WHERE id=?').run(hashPassword('Student123!'),'9th','Biology',JSON.stringify(buildLevelProfile({ level:'9th', stream:'Biology' })), '9th-Biology', student.id);
  student = db.prepare('SELECT * FROM students WHERE id=?').get(student.id);
  if (!paymentFor(student.id)) db.prepare('INSERT INTO payments(student_id,amount,months,paid_at,cycle_end,status,reference) VALUES(?,?,?,?,?,?,?)').run(student.id,200,1,now(),addMonths(now(),1),'Paid','DEMO-PAYMENT');
  let quiz = db.prepare("SELECT * FROM quizzes WHERE title='Biology Foundation Challenge'").get();
  if (!quiz) {
    const scheduled = new Date(Date.now() - 10 * 60000).toISOString();
    const q = db.prepare('INSERT INTO quizzes(title,description,level,stream,scheduled_at,duration_minutes,fee,prize_pool,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('Biology Foundation Challenge','A working demo quiz for 9th Biology students.','9th','Biology',scheduled,45,200,50000,'Scheduled',now());
    quiz = db.prepare('SELECT * FROM quizzes WHERE id=?').get(q.lastInsertRowid);
  }
  const questionCount = db.prepare('SELECT COUNT(*) count FROM questions WHERE quiz_id=?').get(quiz.id).count;
  if (!questionCount) {
    const insert = db.prepare(`INSERT INTO questions(quiz_id,subject,chapter,difficulty,language_type,question_en,question_ur,option_a_en,option_a_ur,option_b_en,option_b_ur,option_c_en,option_c_ur,option_d_en,option_d_ur,correct_option,explanation_en,explanation_ur,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const data = [
      ['Which organelle is known as the powerhouse of the cell?','سیل کا پاور ہاؤس کس عضو کو کہا جاتا ہے؟','Nucleus','مرکزہ','Mitochondria','مائٹوکانڈریا','Ribosome','رائبوسوم','Chloroplast','کلوروپلاسٹ','B','Mitochondria release usable energy from food.'],
      ['What is the basic structural unit of life?','زندگی کی بنیادی ساختی اکائی کیا ہے؟','Tissue','بافت','Cell','خلیہ','Organ','عضو','Atom','ایٹم','B','All living organisms are made of cells.'],
      ['Which process moves water through a selectively permeable membrane?','نیم نفوذ پذیر جھلی سے پانی کی حرکت کا عمل کون سا ہے؟','Diffusion','انتشار','Osmosis','اسموسس','Respiration','تنفس','Transpiration','نتح','B','Osmosis is the movement of water across a selectively permeable membrane.'],
      ['Which pigment absorbs light for photosynthesis?','ضیائی تالیف کے لیے روشنی کون سا رنگ دار مادہ جذب کرتا ہے؟','Hemoglobin','ہیموگلوبن','Melanin','میلانن','Chlorophyll','کلوروفل','Keratin','کیراٹن','C','Chlorophyll captures light energy in plant cells.'],
      ['Where is genetic material mainly stored in a eukaryotic cell?','یوکریاوٹک خلیے میں جینیاتی مادہ بنیادی طور پر کہاں محفوظ ہوتا ہے؟','Cell wall','خلیاتی دیوار','Nucleus','مرکزہ','Vacuole','ویکیول','Cytoplasm','سائٹوپلازم','B','The nucleus contains most of a eukaryotic cell DNA.']
    ];
    for (const q of data) insert.run(quiz.id,'Biology','Cell structure','Medium','Bilingual',q[0],q[1],q[2],q[3],q[4],q[5],q[6],q[7],q[8],q[9],q[10],q[11],null,now());
  }
  if (!db.prepare('SELECT 1 FROM content LIMIT 1').get()) {
    const month = new Date().toISOString().slice(0,7);
    db.prepare('INSERT INTO content(month_key,title,type,level,stream,subject,chapter,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(month,'Cell Structure Notes','Notes','9th','Biology','Biology','Cell structure','Cell membrane, organelles, transport and metabolism revision notes.',now());
    db.prepare('INSERT INTO content(month_key,title,type,level,stream,subject,chapter,body,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(month,'Biology MCQ Practice','MCQ','9th','Biology','Biology','Cell structure','Practice set linked to the current syllabus.',now());
  }
}
seed();

app.get('/api/health', (_req,res) => res.json({ ok:true, service:'danistan-network', serverTime:now() }));
app.get('/api/public', (_req,res) => {
  const quiz = db.prepare("SELECT * FROM quizzes WHERE status!='Archived' ORDER BY scheduled_at DESC LIMIT 1").get();
  const stats = { students: db.prepare('SELECT COUNT(*) count FROM students').get().count, quizzes: db.prepare("SELECT COUNT(*) count FROM quizzes WHERE status!='Archived'").get().count, books: Number(getSetting('books_distributed','4200')), schools: Number(getSetting('schools_visited','38')) };
  res.json({ settings:Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(x=>[x.key,x.value])), plans, quiz, stats });
});
app.get('/api/plans', (_req,res) => res.json(plans));
app.post('/api/auth/signup', (req,res) => {
  const { fullName,fatherName,cnic,mobile,email,gender,city,tehsil,schoolName,password,levelProfile={} } = req.body || {};
  if (![fullName,cnic,mobile,email,gender,city,schoolName,password,levelProfile.level].every(Boolean)) return res.status(400).json({ error:'Please complete all required signup fields.' });
  if (String(password).length < 8) return res.status(400).json({ error:'Password must be at least 8 characters.' });
  if (db.prepare('SELECT 1 FROM students WHERE lower(email)=lower(?) OR mobile=?').get(email,mobile)) return res.status(409).json({ error:'Email or mobile number is already registered.' });
  const structured = buildLevelProfile(levelProfile); const serial = Number(db.prepare('SELECT COALESCE(MAX(id),0)+1 serial FROM students').get().serial);
  const registrationNumber = generateRegistrationNumber({ gender,city,serial }); const assignedPaper=assignQuizPaper(structured);
  const result=db.prepare(`INSERT INTO students(full_name,father_name,mobile,email,gender,city,tehsil,school_name,cnic_encrypted,password_hash,level,stream,field,program_name,year,semester_range,status,nursing_type,program_duration,program_type,level_profile_json,assigned_paper,registration_number,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(fullName,fatherName||null,mobile,email,gender,city,tehsil||null,schoolName,encryptSensitive(cnic),hashPassword(password),structured.level,structured.stream,structured.field,structured.programName,structured.year,structured.semesterRange,structured.status,structured.nursingType,structured.programDuration,structured.programType,JSON.stringify(structured),assignedPaper,registrationNumber,now());
  const student=serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(result.lastInsertRowid));
  notify(student.id,'Welcome','Welcome to Danistan Network',`Your registration number is ${registrationNumber}.`);
  res.status(201).json({ token:createToken({role:'student',studentId:student.id}), student });
});
app.post('/api/auth/login', (req,res) => {
  const { login,password }=req.body||{}; const row=db.prepare('SELECT * FROM students WHERE lower(email)=lower(?) OR mobile=? OR registration_number=?').get(login,login,login);
  if (!row || !verifyPassword(password,row.password_hash)) return res.status(401).json({ error:'Invalid login or password.' });
  if (row.blocked) return res.status(403).json({ error:'This account has been blocked.' });
  res.json({ token:createToken({role:'student',studentId:row.id}), student:serializeStudent(row) });
});
app.post('/api/auth/admin', (req,res) => {
  const { email,password }=req.body||{}; const adminEmail=process.env.ADMIN_EMAIL||'admin@danistan.network'; const adminPassword=process.env.ADMIN_PASSWORD||'Admin123!';
  if (email!==adminEmail || password!==adminPassword) return res.status(401).json({error:'Invalid admin credentials.'});
  res.json({token:createToken({role:'admin'},12),admin:{email:adminEmail,name:'Administrator'}});
});
app.get('/api/me',auth('student'),(req,res)=>res.json(serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId))));
app.put('/api/me',auth('student'),(req,res)=>{ const {fullName,fatherName,mobile,email,city,tehsil,schoolName}=req.body||{}; db.prepare('UPDATE students SET full_name=?,father_name=?,mobile=?,email=?,city=?,tehsil=?,school_name=? WHERE id=?').run(fullName,fatherName||null,mobile,email,city,tehsil||null,schoolName,req.session.studentId); res.json(serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId))); });
app.put('/api/me/password',auth('student'),(req,res)=>{ const row=db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId); if(!verifyPassword(req.body.currentPassword,row.password_hash)) return res.status(400).json({error:'Current password is incorrect.'}); if(String(req.body.newPassword||'').length<8)return res.status(400).json({error:'New password must be at least 8 characters.'}); db.prepare('UPDATE students SET password_hash=? WHERE id=?').run(hashPassword(req.body.newPassword),row.id); res.json({ok:true}); });
app.get('/api/me/dashboard',auth('student'),(req,res)=>{ const student=serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId)); const quizzes=db.prepare("SELECT * FROM quizzes WHERE status!='Archived' AND (level=? OR level='General') AND (stream IS NULL OR stream='' OR stream=?) ORDER BY scheduled_at").all(student.levelProfile.level,student.levelProfile.stream); const notifications=db.prepare('SELECT * FROM notifications WHERE student_id IS NULL OR student_id=? ORDER BY created_at DESC LIMIT 5').all(student.id); const results=db.prepare('SELECT r.*,q.title FROM results r JOIN quizzes q ON q.id=r.quiz_id WHERE r.student_id=? AND r.published=1 ORDER BY r.submitted_at DESC').all(student.id); res.json({student,plans,quizzes,notifications,results,serverTime:now()}); });
app.post('/api/me/payments',auth('student'),(req,res)=>{ const plan=plans.find(x=>x.months===Number(req.body.months)); if(!plan)return res.status(400).json({error:'Invalid plan.'}); const existing=paymentFor(req.session.studentId); const start=existing&&new Date(existing.cycle_end)>new Date()?existing.cycle_end:now(); const cycleEnd=addMonths(start,plan.months); const reference=req.body.reference||`SIM-${Date.now()}`; const result=db.prepare('INSERT INTO payments(student_id,amount,months,paid_at,cycle_end,status,reference) VALUES(?,?,?,?,?,?,?)').run(req.session.studentId,plan.amount,plan.months,now(),cycleEnd,'Paid',reference); syncStudentStatus(req.session.studentId); notify(req.session.studentId,'Payment Confirmation','Payment confirmed',`Your ${plan.months}-month access is active until ${new Date(cycleEnd).toLocaleDateString('en-PK')}.`); res.status(201).json(db.prepare('SELECT * FROM payments WHERE id=?').get(result.lastInsertRowid)); });
app.get('/api/me/content',auth('student'),(req,res)=>{ const student=serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId)); const rows=db.prepare("SELECT * FROM content WHERE (level IS NULL OR level='' OR level=?) AND (stream IS NULL OR stream='' OR stream=?) ORDER BY month_key DESC,id DESC").all(student.levelProfile.level,student.levelProfile.stream); res.json(rows); });
app.get('/api/me/notifications',auth('student'),(req,res)=>res.json(db.prepare('SELECT * FROM notifications WHERE student_id IS NULL OR student_id=? ORDER BY created_at DESC').all(req.session.studentId)));
app.put('/api/me/notifications/:id/read',auth('student'),(req,res)=>{db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND (student_id IS NULL OR student_id=?)').run(now(),Number(req.params.id),req.session.studentId);res.json({ok:true});});
app.get('/api/me/results',auth('student'),(req,res)=>res.json(db.prepare('SELECT r.*,q.title,q.description FROM results r JOIN quizzes q ON q.id=r.quiz_id WHERE r.student_id=? AND r.published=1 ORDER BY r.submitted_at DESC').all(req.session.studentId)));
app.get('/api/quizzes',auth(),(req,res)=>res.json(db.prepare("SELECT q.*,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id) question_count FROM quizzes q WHERE q.status!='Archived' ORDER BY q.scheduled_at DESC").all()));
app.post('/api/attempts/start',auth('student'),(req,res)=>{ const quiz=db.prepare('SELECT * FROM quizzes WHERE id=?').get(Number(req.body.quizId)); if(!quiz)return res.status(404).json({error:'Quiz not found.'}); const student=serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(req.session.studentId)); if(student.registrationStatus!=='Active')return res.status(403).json({error:'A paid membership is required.'}); if(new Date(quiz.scheduled_at)>new Date())return res.status(403).json({error:'This quiz has not started yet.'}); let attempt=db.prepare('SELECT * FROM attempts WHERE student_id=? AND quiz_id=?').get(student.id,quiz.id); if(attempt?.status==='Submitted')return res.status(409).json({error:'This quiz has already been submitted.'}); const deviceId=req.body.deviceId||'browser'; if(attempt?.device_id&&attempt.device_id!==deviceId)return res.status(409).json({error:'This registration is already active on another device.'}); if(!attempt){ const token=crypto.randomUUID(); const result=db.prepare('INSERT INTO attempts(student_id,quiz_id,token,started_at,status,device_id) VALUES(?,?,?,?,?,?)').run(student.id,quiz.id,token,now(),'In progress',deviceId); attempt=db.prepare('SELECT * FROM attempts WHERE id=?').get(result.lastInsertRowid); } else db.prepare("UPDATE attempts SET status='In progress',device_id=? WHERE id=?").run(deviceId,attempt.id);
  const questions=db.prepare('SELECT id,subject,chapter,difficulty,language_type,question_en,question_ur,option_a_en,option_a_ur,option_b_en,option_b_ur,option_c_en,option_c_ur,option_d_en,option_d_ur FROM questions WHERE quiz_id=? ORDER BY ((id * ?)%97)').all(quiz.id,student.id+11); const answers=db.prepare('SELECT question_id,answer FROM attempt_answers WHERE attempt_id=?').all(attempt.id); res.json({attempt,quiz,questions,answers,serverTime:now()}); });
app.put('/api/attempts/:id/answer',auth('student'),(req,res)=>{ const attempt=db.prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(Number(req.params.id),req.session.studentId); if(!attempt||attempt.status==='Submitted')return res.status(409).json({error:'Attempt is not active.'}); const question=db.prepare('SELECT * FROM questions WHERE id=? AND quiz_id=?').get(Number(req.body.questionId),attempt.quiz_id); if(!question)return res.status(404).json({error:'Question not found.'}); const answer=String(req.body.answer||'').toUpperCase(); db.prepare('INSERT INTO attempt_answers(attempt_id,question_id,answer,is_correct,saved_at) VALUES(?,?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer,is_correct=excluded.is_correct,saved_at=excluded.saved_at').run(attempt.id,question.id,answer,answer===question.correct_option?1:0,now()); res.json({saved:true}); });
app.post('/api/attempts/:id/warning',auth('student'),(req,res)=>{ const a=db.prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(Number(req.params.id),req.session.studentId); if(!a)return res.status(404).json({error:'Attempt not found.'}); db.prepare('UPDATE attempts SET warnings=warnings+1 WHERE id=?').run(a.id); const warnings=a.warnings+1; res.json({warnings,autoSubmit:warnings>=3}); });
app.post('/api/attempts/:id/submit',auth('student'),(req,res)=>{ const attempt=db.prepare('SELECT * FROM attempts WHERE id=? AND student_id=?').get(Number(req.params.id),req.session.studentId); if(!attempt)return res.status(404).json({error:'Attempt not found.'}); if(attempt.status==='Submitted')return res.json(db.prepare('SELECT * FROM results WHERE attempt_id=?').get(attempt.id)); const totals=db.prepare('SELECT COALESCE(SUM(q.marks),0) total,COALESCE(SUM(CASE WHEN a.is_correct=1 THEN q.marks ELSE 0 END),0) score FROM questions q LEFT JOIN attempt_answers a ON a.question_id=q.id AND a.attempt_id=? WHERE q.quiz_id=?').get(attempt.id,attempt.quiz_id); const percentage=totals.total?Math.round(totals.score*10000/totals.total)/100:0; db.prepare("UPDATE attempts SET status='Submitted',submitted_at=?,score=?,percentage=? WHERE id=?").run(now(),totals.score,percentage,attempt.id); let result=db.prepare('SELECT * FROM results WHERE attempt_id=?').get(attempt.id); if(!result){const r=db.prepare('INSERT INTO results(attempt_id,student_id,quiz_id,score,percentage,published,submitted_at) VALUES(?,?,?,?,?,?,?)').run(attempt.id,attempt.student_id,attempt.quiz_id,totals.score,percentage,0,now());result=db.prepare('SELECT * FROM results WHERE id=?').get(r.lastInsertRowid);} res.json(result); });

app.get('/api/admin/stats',auth('admin'),(_req,res)=>{ const payments=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(amount),0) revenue FROM payments WHERE status='Paid'").get(); res.json({students:db.prepare('SELECT COUNT(*) count FROM students').get().count,quizzes:db.prepare("SELECT COUNT(*) count FROM quizzes WHERE status!='Archived'").get().count,payments:payments.count,revenue:payments.revenue,pendingResults:db.prepare('SELECT COUNT(*) count FROM results WHERE published=0').get().count}); });
app.get('/api/admin/students',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT * FROM students ORDER BY created_at DESC').all().map(serializeStudent)));
app.put('/api/admin/students/:id',auth('admin'),(req,res)=>{const row=db.prepare('SELECT * FROM students WHERE id=?').get(Number(req.params.id));if(!row)return res.status(404).json({error:'Student not found.'});const b=req.body;db.prepare('UPDATE students SET full_name=?,mobile=?,email=?,school_name=?,city=?,tehsil=?,blocked=? WHERE id=?').run(b.fullName??row.full_name,b.mobile??row.mobile,b.email??row.email,b.schoolName??row.school_name,b.city??row.city,b.tehsil??row.tehsil,b.blocked===undefined?row.blocked:Number(Boolean(b.blocked)),row.id);res.json(serializeStudent(db.prepare('SELECT * FROM students WHERE id=?').get(row.id)));});
app.get('/api/admin/quizzes',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT q.*,(SELECT COUNT(*) FROM questions WHERE quiz_id=q.id) question_count FROM quizzes q ORDER BY created_at DESC').all()));
app.post('/api/admin/quizzes',auth('admin'),(req,res)=>{const {title,description,level,stream,scheduledAt,durationMinutes=45,fee=200,prizePool=0,status='Scheduled'}=req.body||{};if(!title||!level||!scheduledAt)return res.status(400).json({error:'Title, level and schedule are required.'});const result=db.prepare('INSERT INTO quizzes(title,description,level,stream,scheduled_at,duration_minutes,fee,prize_pool,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(title,description||null,level,stream||null,scheduledAt,durationMinutes,fee,prizePool,status,now());notify(null,'New Quiz Announcement','New quiz announced',`${title} has been scheduled.`);res.status(201).json(db.prepare('SELECT * FROM quizzes WHERE id=?').get(result.lastInsertRowid));});
app.put('/api/admin/quizzes/:id',auth('admin'),(req,res)=>{const x=db.prepare('SELECT * FROM quizzes WHERE id=?').get(Number(req.params.id));if(!x)return res.status(404).json({error:'Quiz not found.'});const b=req.body;db.prepare('UPDATE quizzes SET title=?,description=?,level=?,stream=?,scheduled_at=?,duration_minutes=?,fee=?,prize_pool=?,status=? WHERE id=?').run(b.title??x.title,b.description??x.description,b.level??x.level,b.stream??x.stream,b.scheduledAt??x.scheduled_at,b.durationMinutes??x.duration_minutes,b.fee??x.fee,b.prizePool??x.prize_pool,b.status??x.status,x.id);res.json(db.prepare('SELECT * FROM quizzes WHERE id=?').get(x.id));});
app.delete('/api/admin/quizzes/:id',auth('admin'),(req,res)=>{db.prepare("UPDATE quizzes SET status='Archived' WHERE id=?").run(Number(req.params.id));res.status(204).end();});
app.get('/api/admin/questions',auth('admin'),(req,res)=>res.json(db.prepare('SELECT * FROM questions WHERE (? IS NULL OR quiz_id=?) ORDER BY id DESC').all(req.query.quizId?Number(req.query.quizId):null,req.query.quizId?Number(req.query.quizId):null)));
app.post('/api/admin/questions',auth('admin'),(req,res)=>{const b=req.body||{};if(!b.questionEn||!b.optionAEn||!b.optionBEn||!b.optionCEn||!b.optionDEn||!b.correctOption)return res.status(400).json({error:'Question, four options and correct option are required.'});const result=db.prepare(`INSERT INTO questions(quiz_id,subject,chapter,difficulty,language_type,question_en,question_ur,option_a_en,option_a_ur,option_b_en,option_b_ur,option_c_en,option_c_ur,option_d_en,option_d_ur,correct_option,explanation_en,explanation_ur,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.quizId||null,b.subject||null,b.chapter||null,b.difficulty||'Medium',b.languageType||'English',b.questionEn,b.questionUr||null,b.optionAEn,b.optionAUr||null,b.optionBEn,b.optionBUr||null,b.optionCEn,b.optionCUr||null,b.optionDEn,b.optionDUr||null,String(b.correctOption).toUpperCase(),b.explanationEn||null,b.explanationUr||null,now());res.status(201).json(db.prepare('SELECT * FROM questions WHERE id=?').get(result.lastInsertRowid));});
app.put('/api/admin/questions/:id',auth('admin'),(req,res)=>{const x=db.prepare('SELECT * FROM questions WHERE id=?').get(Number(req.params.id));if(!x)return res.status(404).json({error:'Question not found.'});const b=req.body;const map={quizId:'quiz_id',subject:'subject',chapter:'chapter',difficulty:'difficulty',languageType:'language_type',questionEn:'question_en',questionUr:'question_ur',optionAEn:'option_a_en',optionAUr:'option_a_ur',optionBEn:'option_b_en',optionBUr:'option_b_ur',optionCEn:'option_c_en',optionCUr:'option_c_ur',optionDEn:'option_d_en',optionDUr:'option_d_ur',correctOption:'correct_option',explanationEn:'explanation_en',explanationUr:'explanation_ur'};for(const [key,col] of Object.entries(map))if(b[key]!==undefined)db.prepare(`UPDATE questions SET ${col}=? WHERE id=?`).run(b[key],x.id);res.json(db.prepare('SELECT * FROM questions WHERE id=?').get(x.id));});
app.delete('/api/admin/questions/:id',auth('admin'),(req,res)=>{db.prepare('DELETE FROM questions WHERE id=?').run(Number(req.params.id));res.status(204).end();});
app.get('/api/admin/payments',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT p.*,s.full_name,s.registration_number FROM payments p JOIN students s ON s.id=p.student_id ORDER BY p.paid_at DESC').all()));
app.get('/api/admin/results',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT r.*,s.full_name,s.school_name,s.registration_number,q.title FROM results r JOIN students s ON s.id=r.student_id JOIN quizzes q ON q.id=r.quiz_id ORDER BY r.submitted_at DESC').all()));
app.put('/api/admin/results/:id/publish',auth('admin'),(req,res)=>{const published=req.body.published===false?0:1;db.prepare('UPDATE results SET published=? WHERE id=?').run(published,Number(req.params.id));const result=db.prepare('SELECT * FROM results WHERE id=?').get(Number(req.params.id));if(result&&published)notify(result.student_id,'Result Published','Result published','Your quiz result is ready to view.','Website,Email,SMS');res.json(result);});
app.post('/api/admin/results/recheck/:questionId',auth('admin'),(req,res)=>{const q=db.prepare('SELECT * FROM questions WHERE id=?').get(Number(req.params.questionId));if(!q)return res.status(404).json({error:'Question not found.'});const correct=String(req.body.correctOption||q.correct_option).toUpperCase();db.prepare('UPDATE questions SET correct_option=? WHERE id=?').run(correct,q.id);db.prepare('UPDATE attempt_answers SET is_correct=CASE WHEN answer=? THEN 1 ELSE 0 END WHERE question_id=?').run(correct,q.id);const attempts=db.prepare('SELECT DISTINCT attempt_id FROM attempt_answers WHERE question_id=?').all(q.id);for(const {attempt_id} of attempts){const a=db.prepare('SELECT * FROM attempts WHERE id=?').get(attempt_id);const t=db.prepare('SELECT COALESCE(SUM(q.marks),0) total,COALESCE(SUM(CASE WHEN aa.is_correct=1 THEN q.marks ELSE 0 END),0) score FROM questions q LEFT JOIN attempt_answers aa ON aa.question_id=q.id AND aa.attempt_id=? WHERE q.quiz_id=?').get(a.id,a.quiz_id);const p=t.total?Math.round(t.score*10000/t.total)/100:0;db.prepare('UPDATE attempts SET score=?,percentage=? WHERE id=?').run(t.score,p,a.id);db.prepare('UPDATE results SET score=?,percentage=? WHERE attempt_id=?').run(t.score,p,a.id);}res.json({rechecked:attempts.length});});
app.get('/api/admin/notifications',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT n.*,s.full_name FROM notifications n LEFT JOIN students s ON s.id=n.student_id ORDER BY n.created_at DESC').all()));
app.post('/api/admin/notifications',auth('admin'),(req,res)=>{const {studentId,type='Announcement',title,message,channel='Website'}=req.body||{};if(!title||!message)return res.status(400).json({error:'Title and message are required.'});notify(studentId||null,type,title,message,channel);res.status(201).json({ok:true});});
app.get('/api/admin/content',auth('admin'),(_req,res)=>res.json(db.prepare('SELECT * FROM content ORDER BY month_key DESC,id DESC').all()));
app.post('/api/admin/content',auth('admin'),(req,res)=>{const b=req.body||{};if(!b.monthKey||!b.title||!b.type)return res.status(400).json({error:'Month, title and type are required.'});const r=db.prepare('INSERT INTO content(month_key,title,type,level,stream,subject,chapter,body,file_url,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(b.monthKey,b.title,b.type,b.level||null,b.stream||null,b.subject||null,b.chapter||null,b.body||null,b.fileUrl||null,now());res.status(201).json(db.prepare('SELECT * FROM content WHERE id=?').get(r.lastInsertRowid));});
app.delete('/api/admin/content/:id',auth('admin'),(req,res)=>{db.prepare('DELETE FROM content WHERE id=?').run(Number(req.params.id));res.status(204).end();});
app.get('/api/admin/settings',auth('admin'),(_req,res)=>res.json(Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(x=>[x.key,x.value]))));
app.put('/api/admin/settings',auth('admin'),(req,res)=>{for(const [key,value] of Object.entries(req.body||{}))setSetting(key,value);res.json(Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(x=>[x.key,x.value])));});

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'The server could not complete this request.'});});
const port=process.env.PORT||4000;
app.listen(port,()=>console.log(`Danistan API listening on http://localhost:${port}`));
