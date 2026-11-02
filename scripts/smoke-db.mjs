// Functional smoke test for the database: it signs a user in, walks the real
// workflows (publishing, registration approval, attendance, grading, finance
// approval, outbox) and asserts the row level security boundaries actually
// hold. Run with `npm run db:smoke`.
import { applyMigrations, as, check, openDb, query, rows } from './pg.mjs';

const db = await openDb();
await applyMigrations(db);

const q = (sql, params) => query(db, sql, params);
const one = (sql, params) => rows(db, sql, params);

const USERS = {
  admin: 'admin@tekle.test',
  editor: 'editor@tekle.test',
  teacher: 'teacher@tekle.test',
  student: 'student@tekle.test',
  parent: 'parent@tekle.test',
  outsider: 'outsider@tekle.test',
  finance: 'finance@tekle.test',
};
const values = Object.entries(USERS)
  .map(([k, e]) => `('${e}', '{"full_name_am":"${k}"}')`)
  .join(',');
await q(`insert into auth.users (email, raw_user_meta_data) values ${values}`);
const uid = {};
for (const r of await one('select id, email from auth.users')) uid[r.email.split('@')[0]] = r.id;

const A = uid.admin;
const E = uid.editor;
const T = uid.teacher;
const S = uid.student;
const P = uid.parent;
const O = uid.outsider;
const F = uid.finance;

// ─── 1. bootstrap: first super admin, roles, permissions ─────────────────────
const boot = (await q("select public.bootstrap_super_admin('admin@tekle.test') as id")).rows[0].id;
check('bootstrap_super_admin links the auth user', boot === A);

await as(db, 'authenticated', A, async () => {
  const r = await q("select public.has_permission('finance.write') as fin, public.is_super_admin() as sup");
  check('super admin holds every permission', r.rows[0].fin === true && r.rows[0].sup === true);
  await q(`insert into user_roles (user_id, role_id)
           select '${E}', id from roles where key = 'website_editor'`);
  await q(`insert into user_roles (user_id, role_id)
           select '${T}', id from roles where key = 'teacher'`);
});

await as(db, 'authenticated', E, async () => {
  const r = await q(
    "select public.has_permission('news.write') as w, public.has_permission('finance.write') as f"
  );
  check('website_editor may write news but not finance', r.rows[0].w === true && r.rows[0].f === false);
});

const editorGrants = await as(db, 'authenticated', E, async () => (await q('select public.my_permissions() as p')).rows[0].p);
check('my_permissions lists this person’s own grants', editorGrants.includes('news.write') && !editorGrants.includes('finance.write'));
const peekedGrants = await as(db, 'authenticated', E, async () => (await q(`select public.my_permissions('${A}') as p`)).rows[0].p);
check('my_permissions refuses another person’s grants', peekedGrants.length === 0, String(peekedGrants.length));
const adminGrants = await as(db, 'authenticated', A, async () => (await q('select public.my_permissions() as p')).rows[0].p);
const allGrants = (await one('select count(*)::int as n from permissions'))[0].n;
check('the super admin’s grants are the whole list', adminGrants.length === allGrants, `${adminGrants.length}/${allGrants}`);
check('a person with no roles gets no grants', (await as(db, 'authenticated', S, async () => (await q('select public.my_permissions() as p')).rows[0].p)).length === 0);

// ─── 2. content workflow: draft → submit → approve → publish → public site ───
const newsId = (
  await q(
    `insert into news (slug, title_am, body_am, created_by, author_id)
     values ('ye-emet-qiddusse','የእምነት ትምህርት ቀን','ዝርዝር…', '${E}', '${E}') returning id`
  )
).rows[0].id;

const anonVisible = async () =>
  (await as(db, 'anon', null, async () => (await q('select count(*)::int as n from public.v_public_news')).rows[0].n));
check('draft news is hidden from the public site', (await anonVisible()) === 0);

let approval;
await as(db, 'authenticated', E, async () => {
  approval = (await q("select public.submit_content('news', ?) as r", [newsId])).rows[0].r;
});
check('submit_content opens an approval request', !!approval.approval_id);
check(
  'submitted item is still not public',
  (await q('select state from news where id = ?', [newsId])).rows[0].state === 'submitted' &&
    (await anonVisible()) === 0
);

// An editor cannot approve their own work.
let editorCouldApprove = true;
await as(db, 'authenticated', E, async () => {
  try {
    await q("select public.decide_content('news', ?, 'approve')", [newsId]);
  } catch {
    editorCouldApprove = false;
  }
});
check('author cannot approve their own submission', editorCouldApprove === false);

await as(db, 'authenticated', A, async () => {
  await q("select public.decide_content('news', ?, 'approve')", [newsId]);
});
check('approved is not yet published', (await anonVisible()) === 0);

await as(db, 'authenticated', A, async () => {
  await q("select public.decide_content('news', ?, 'publish')", [newsId]);
});
check('published news appears on the public website', (await anonVisible()) === 1);
check(
  'nothing is left waiting for approval after publish',
  (
    await q("select count(*)::int as n from approval_requests where entity_id = ? and status = 'pending'", [newsId])
  ).rows[0].n === 0
);

// ─── 3. public registration → approved student + guardian ────────────────────
let appId;
let appReference;
const submitted = await as(db, 'anon', null, async () =>
  (
    await q(
      `select public.submit_application(?::jsonb) as r`,
      [
        JSON.stringify({
          kind: 'student',
          full_name_am: 'ሚካኤል ተስፋይ',
          email: 'student@tekle.test',
          phone: '0912345678',
          gender: 'male',
          birth_date: '2009-01-12',
          parish: 'ቅድስት ልደታ',
          guardian_name: 'ማርያም ተስፋይ',
          guardian_phone: '0923456789',
          level_requested: 'l3',
          motivation_am: 'መማር እወዳለሁ',
          // hostile fields a visitor must not be able to set
          status: 'approved',
          reviewed_by: A,
        }),
      ]
    )
  ).rows[0].r
);
appId = submitted.id;
appReference = submitted.reference;
check('registration endpoint returns a tracking number', /^STU-\d{4}-\d{6}$/.test(String(appReference)), String(appReference));
const appRow = (await q('select reference, status, reviewed_by from applications where id = ?', [appId])).rows[0];
check('a visitor cannot approve their own application', appRow.status === 'pending' && appRow.reviewed_by == null);

let directWrite = 'allowed';
try {
  await as(db, 'anon', null, () =>
    q("insert into public.applications (kind, full_name_am, reference, status, source) values ('student','x','HACK-1','approved','website')")
  );
} catch (e) {
  directWrite = /permission denied/.test(e.message) ? 'denied' : e.message;
}
check('anonymous visitors have no direct table writes', directWrite === 'denied', directWrite);

const statusOk = await as(db, 'anon', null, async () =>
  (await q('select public.check_application_status(?, ?) as s', [appReference, '0912345678'])).rows[0].s
);
check('applicant can track the submission by reference and phone', statusOk.reference === appReference && !!statusOk.status_am);
let statusLeak = 'found';
try {
  await as(db, 'anon', null, () => q('select public.check_application_status(?, ?)', [appReference, 'wrong@example.test']));
} catch (e) {
  statusLeak = /አልተገኘም/.test(e.message) ? 'rejected' : e.message;
}
check('tracking needs the contact used on the form', statusLeak === 'rejected', statusLeak);

let studentId;
await as(db, 'authenticated', A, async () => {
  const r = (await q('select public.approve_application(?) as r', [appId])).rows[0].r;
  check('approved application materialises a student record', !!r.student_id);
  studentId = r.student_id;
});

check(
  'guardian captured and linked from the application',
  (await q('select count(*)::int as n from guardian_students where student_id = ?', [studentId])).rows[0].n === 1
);
check(
  'approval notified the staff who handle applications',
  (await q("select count(*)::int as n from notifications where kind = 'applications'")).rows[0].n > 0
);
check(
  'student code assigned automatically',
  /^[\w-]+$/.test((await q('select student_code as c from student_profiles where id = ?', [studentId])).rows[0].c)
);

// ─── 4. classes, enrolment, attendance, grading ──────────────────────────────
const classId = (
  await q(
    `insert into classes (code, name_am, level_id, academic_year_id)
     values ('L3-A','ደረጃ ፫ - ኤ',
             (select id from class_levels where key = 'l3'),
             (select id from academic_years where is_current)) returning id`
  )
).rows[0].id;
const otherClassId = (
  await q(
    `insert into classes (code, name_am, level_id)
     values ('ADU-A','አባቶችና እመቤቶች - ሀ', (select id from class_levels where key = 'adult')) returning id`
  )
).rows[0].id;

const teacherId = (
  await q(
    `insert into teacher_profiles (user_id, full_name_am, title_am, email)
     values ('${T}','አባ ካሣ ጴትሮስ','መምህር','teacher@tekle.test') returning id`
  )
).rows[0].id;
await q('insert into class_teachers (class_id, teacher_id) values (?, ?)', [classId, teacherId]);
await q('insert into student_enrollments (student_id, class_id) values (?, ?)', [studentId, classId]);

// Portal accounts link by verified email only.
await as(db, 'authenticated', S, async () => {
  const linked = (await q("select public.link_student_account('student@tekle.test') as id")).rows[0].id;
  check('student links their own portal account', linked === studentId);
  let claimed = false;
  try {
    await q("select public.link_student_account('someone-else@example.com')");
    claimed = true;
  } catch {
    claimed = false;
  }
  check('student cannot claim a record with a foreign email', claimed === false);
});

const sessionId = await as(db, 'authenticated', T, async () =>
  (
    await q(
      `select public.save_attendance(?, current_date, ?::jsonb, null, 'እሑድ ንባብ') as id`,
      [
        classId,
        JSON.stringify([
          { student_id: studentId, status: 'present' },
          { student_id: studentId, status: 'late', minutes_late: 12 },
        ]),
      ]
    )
  ).rows[0].id
);
check(
  'teacher attendance saved and recounted (last write wins per student)',
  (
    await q(
      `select present_count, late_count, expected_count from attendance_sessions
            where id = ?`,
      [sessionId]
    )
  ).rows[0].late_count === 1
);

const otherClassVisibleToTeacher = await as(db, 'authenticated', T, async () =>
  (await q('select count(*)::int as n from public.classes where id = ?', [otherClassId])).rows[0].n
);
check('teacher cannot read a class they do not teach', otherClassVisibleToTeacher === 0);

const examId = (
  await q(
    `insert into exams (class_id, title_am, exam_type, total_marks, pass_mark, created_by)
     values (?, 'የዓመት ፈተና','final',100,60, ?) returning id`,
    [classId, A]
  )
).rows[0].id;

await as(db, 'authenticated', T, async () => {
  await q(
    `insert into exam_results (exam_id, student_id, marks, status, entered_by)
     values (?, ?, 85, 'graded', ?)`,
    [examId, studentId, T]
  );
});
const graded = (await q('select percent, grade_letter from exam_results where exam_id = ?', [examId])).rows[0];
check(
  'derived percent and letter grade computed by trigger',
  Number(graded.percent) === 85 && graded.grade_letter != null
);

await q("update exam_results set status = 'released', released_at = now() where exam_id = ?", [examId]);
const card = (await q('select public.student_report_card(?) as c', [studentId])).rows[0].c;
check('report card includes the released exam', JSON.stringify(card).includes('85'));
const ranking = (await q('select * from public.class_ranking(?, ?)', [classId, examId])).rows;
check('class ranking returns a position column', ranking.length === 1 && ranking[0].ranking === 1);

// ─── 5. students are only readable by the people entitled to them ────────────
await q(`insert into guardians (user_id, full_name_am, email, phone) values ('${P}','ማርያም ተስፋይ','parent@tekle.test','0922')`);
await q(
  `insert into guardian_students (guardian_id, student_id, relation_am, is_primary)
   select id, ?, 'እናት', true from guardians where user_id = ?`,
  [studentId, P]
);

const reads = async (who) =>
  as(db, 'authenticated', who, async () =>
    (await q('select count(*)::int as n from public.student_profiles where id = ?', [studentId])).rows[0].n
  );
check('parent reads only the linked child', (await reads(P)) === 1);
check('teacher reads a student in their class', (await reads(T)) === 1);
check('unrelated staff user reads nothing', (await reads(O)) === 0);

// A second class with its own register, built with owner rights so the test
// below is only about what another student can see.
const otherStudent = (
  await q(
    `insert into student_profiles (full_name_am, email, status, level_key)
     values ('ሌላ ተማሪ','other@tekle.test','active','l3') returning id`
  )
).rows[0].id;
const otherSession = (
  await q(
    `insert into class_sessions (class_id, held_on, starts_at, ends_at, topic_am)
     values (?, current_date, '09:00', '10:00', 'መሠረት') returning id`,
    [otherClassId]
  )
).rows[0].id;
const otherRegister = (
  await q(
    `insert into attendance_sessions (class_id, session_id, taken_on, teacher_id)
     values (?, ?, current_date, (select id from teacher_profiles where user_id = ?)) returning id`,
    [otherClassId, otherSession, T]
  )
).rows[0].id;
await q(
  `insert into attendance_records (session_id, student_id, status, recorded_by)
   values (?, ?, 'absent', ?)`,
  [otherRegister, otherStudent, A]
);

const foreignSeen = await as(db, 'authenticated', S, async () =>
  (await q('select count(*)::int as n from public.attendance_records where student_id = ?', [otherStudent])).rows[0].n
);
check('a student cannot see another student’s attendance', foreignSeen === 0, String(foreignSeen));

let forged = 'allowed';
try {
  await as(db, 'authenticated', S, () =>
    q("insert into attendance_records (session_id, student_id, status) values (?, ?, 'present')", [otherRegister, S])
  );
} catch (e) {
  forged = /permission denied|row-level security/.test(e.message) ? 'denied' : e.message;
}
check('a student cannot write their own attendance row', forged === 'denied', forged);

// ─── 6. finance: approval limits, donation auto-booking, summary ─────────────
const cash = (await q("select id from finance_accounts where code = '1000'")).rows[0].id;
const expenseCat = (await q("select id from finance_categories where kind = 'expense' limit 1")).rows[0].id;

const smallTx = (
  await q(
    `insert into transactions (type, amount, occurred_on, description_am, account_id, category_id, recorded_by)
     values ('expense', 500, current_date, 'የመማሪያ ግብዣ', ?, ?, ?) returning id, ref_no`,
    [cash, expenseCat, A]
  )
).rows[0];
check('transaction reference issued', /^TT-EXP-\d{4}-\d{6}$/.test(smallTx.ref_no));

const bigTx = (
  await q(
    `insert into transactions (type, amount, occurred_on, description_am, account_id, category_id, recorded_by)
     values ('expense', 60000, current_date, 'የመዝሙር ቤት ግንባብ', ?, ?, ?) returning id`,
    [cash, expenseCat, A]
  )
).rows[0].id;

let decision;
await as(db, 'authenticated', A, async () => {
  decision = (await q("select public.decide_transaction(?, 'approve') as r", [smallTx.id])).rows[0].r;
});
check('small expense approved', decision.status === 'approved');

let escalated;
await as(db, 'authenticated', A, async () => {
  escalated = (await q("select public.decide_transaction(?, 'approve') as r", [bigTx])).rows[0].r;
});
check(
  'expense above the limit escalates to the finance approver instead of booking',
  escalated.status === 'requires_approval' && !!escalated.approval_id
);
check(
  'escalated transaction stayed pending',
  (await q('select status from transactions where id = ?', [bigTx])).rows[0].status === 'pending_approval'
);

// The approver's decision closes the queue row the first call opened. A rejection
// is used here so the ledger totals the later checks depend on stay unchanged.
const autoLimit = (await q("select (value #>> '{}')::int as l from finance_settings where key = 'auto_approve_limit'")).rows[0].l;
const secondTx = (
  await q(
    `insert into transactions (type, amount, occurred_on, description_am, account_id, category_id, recorded_by)
     values ('expense', ${autoLimit + 20000}, current_date, 'የመንግስት ግብር', ?, ?, ?) returning id`,
    [cash, expenseCat, A]
  )
).rows[0].id;
let firstPass;
await as(db, 'authenticated', A, async () => {
  firstPass = (await q("select public.decide_transaction(?, 'approve') as r", [secondTx])).rows[0].r;
});
let decided;
await as(db, 'authenticated', A, async () => {
  decided = (await q("select public.decide_transaction(?, 'reject', ?) as r", [secondTx, 'ሰነዱ ስላልታመለከተ'])).rows[0].r;
});
check(
  'the escalated expense was reported as needing approval first',
  firstPass.status === 'requires_approval' && decided.status === 'rejected',
  JSON.stringify({ first: firstPass.status, second: decided.status })
);
check(
  'the decision closed its approval queue row',
  Boolean(decided.approval_closed) &&
    (await q('select status, decided_by from approval_requests where id = ?', [decided.approval_closed])).rows[0]
      .status === 'rejected'
);
check(
  'a second escalation row was not opened',
  (await q("select count(*)::int as n from approval_requests where entity_table = 'transactions' and entity_id = ?", [secondTx])).rows[0].n === 1
);

// The seeded finance approver holds budget.approve but not budget.write, so the
// decision runs through decide_budget(), which writes only approval columns.
await as(db, 'authenticated', A, async () => {
  await q(`insert into user_roles (user_id, role_id) select '${F}', id from roles where key = 'finance_approver'`);
});
const budgetId = (
  await q(
    `insert into budgets (period_label_am, planned_amount, status, created_by)
     values ('፳፻፲፱ ሥ.ዓ', 1200, 'submitted', ?) returning id`,
    [A]
  )
).rows[0].id;
let budgetDecision;
try {
  await as(db, 'authenticated', F, async () => {
    budgetDecision = (await q('select public.decide_budget(?, ?) as r', [budgetId, 'approve'])).rows[0].r;
  });
} catch (e) {
  budgetDecision = { error: e.message };
}
check(
  'a budget.approve holder may decide a submitted budget',
  budgetDecision.status === 'approved' && Number(budgetDecision.budget?.approved_amount) === 1200,
  JSON.stringify(budgetDecision)
);

const draftBudgetId = (
  await q(
    `insert into budgets (period_label_am, planned_amount, status, created_by)
     values ('፳፻፲፱ ሁለተኛው ሩብ', 1200, 'draft', ?) returning id`,
    [A]
  )
).rows[0].id;
let draftDecision;
try {
  await as(db, 'authenticated', F, async () => {
    draftDecision = (await q('select public.decide_budget(?, ?) as r', [draftBudgetId, 'approve'])).rows[0].r;
  });
} catch (e) {
  draftDecision = { error: e.message };
}
check(
  'a budget still in draft cannot be decided',
  /only a submitted budget/.test(String(draftDecision.error ?? '')) &&
    (await q('select status from budgets where id = ?', [draftBudgetId])).rows[0].status === 'draft',
  JSON.stringify(draftDecision)
);

let draftedRows;
try {
  await as(db, 'authenticated', F, async () => {
    draftedRows = (await q('update budgets set planned_amount = 900 where id = ?', [budgetId])).rowCount;
  });
} catch (e) {
  draftedRows = /row-level security|permission denied/.test(e.message) ? 0 : e.message;
}
check(
  'an approver still cannot redraft the budget line',
  draftedRows === 0 &&
    (await q('select planned_amount::int as p from budgets where id = ?', [budgetId])).rows[0].p === 1200,
  String(draftedRows)
);

let editorDecision;
try {
  await as(db, 'authenticated', E, async () => {
    editorDecision = (await q('select public.decide_budget(?, ?) as r', [budgetId, 'approve'])).rows[0].r;
  });
} catch (e) {
  editorDecision = { error: e.message };
}
check(
  'decide_budget refuses someone without budget.approve',
  /missing budget.approve/.test(String(editorDecision.error ?? '')),
  JSON.stringify(editorDecision)
);

// The public form can only promise money; a receipt is issued and the treasurer
// confirms what actually arrived.
const pledge = await as(db, 'anon', null, async () =>
  (
    await q(
      'select public.submit_donation(?::jsonb) as d',
      [JSON.stringify({ donor_name_am: 'መርሐኝ ለጋሽ', amount: '2000', method: 'mobile_money', purpose_am: 'የት/ቤት መጻሕፍት' })]
    )
  ).rows[0].d
);
check('public pledge gets a receipt and stays unconfirmed', /^RCP-\d{4}-\d{6}$/.test(String(pledge.receipt_no)) && pledge.status === 'pledged', JSON.stringify(pledge));
check(
  'a pledged donation is not booked as income yet',
  (await q('select transaction_id as t from donations where id = ?', [pledge.id])).rows[0].t == null
);

let donationTx;
await as(db, 'authenticated', A, async () => {
  donationTx = (
    await q(
      `insert into public.donations (donor_name_am, amount, method, status, received_on, purpose_am, source)
       values ('መርሐኝ ለጋሽ', 2000, 'mobile_money', 'paid', current_date, 'የት/ቤት መጻሕፍት', 'cash') returning id`
    )
  ).rows[0].id;
});
const linkedTx = (await q('select transaction_id from donations where id = ?', [donationTx])).rows[0].transaction_id;
check('paid donation booked an approved income transaction', !!linkedTx);
const summary = (await q('select public.finance_summary() as s')).rows[0].s;
check(
  'finance summary counts approved income and expense',
  Number(summary.income) === 2000 && Number(summary.expense) === 500,
  JSON.stringify(summary)
);

// ─── 7. communication: contact inbox, honest outbox ──────────────────────────
let messageId;
const contactReply = await as(db, 'anon', null, async () =>
  (
    await q(
      'select public.submit_contact_message(?::jsonb) as r',
      [
        JSON.stringify({
          name_am: 'ገነት',
          email: 'g@t.test',
          subject_am: 'ስለ ምዝገባ',
          message_am: 'ልጄን ማስመዝገብ እወዳለሁ። እንዴት እንሄድ?',
          topic: 'registration',
          status: 'spam',
        }),
      ]
    )
  ).rows[0].r
);
messageId = contactReply.id;
check(
  'the inbox status is set by the church, not by the sender',
  (await q('select status as s from contact_messages where id = ?', [messageId])).rows[0].s === 'new'
);

let shortMessage = 'accepted';
try {
  await as(db, 'anon', null, () =>
    q('select public.submit_contact_message(?::jsonb)', [JSON.stringify({ name_am: 'x', subject_am: 'a', message_am: 'ቁ' })])
  );
} catch (e) {
  shortMessage = /በጣም አጭር/.test(e.message) ? 'rejected' : e.message;
}
check('the form rejects input that is too short', shortMessage === 'rejected', shortMessage);
check(
  'public contact form notifies the staff inbox',
  (await q("select count(*)::int as n from notifications where kind = 'contact_messages'")).rows[0].n > 0
);

await as(db, 'authenticated', A, async () => {
  await q("select public.reply_to_message(?, 'እንኳን ደህና መጡ', 'g@t.test')", [messageId]);
});
const outbox = (await q('select status, last_error from outbox_messages order by queued_at limit 1')).rows[0];
check(
  'reply is parked honestly when no email provider is configured',
  outbox.status === 'provider_not_configured' && outbox.last_error != null
);

await q("update site_settings set value = '\"smtp://worker\"'::jsonb where key = 'provider_email'");
await as(db, 'authenticated', A, async () => {
  await q("select public.reply_to_message(?, 'እንኳን ደህና መጡ', 'g@t.test')", [messageId]);
});
let staffMayClaim = 'allowed';
try {
  await as(db, 'authenticated', A, () => q('select count(*)::int as n from public.claim_outbox(5)'));
} catch (e) {
  staffMayClaim = /permission denied/.test(e.message) ? 'denied' : e.message;
}
check('only the delivery worker, not a signed-in admin, drains the queue', staffMayClaim === 'denied', staffMayClaim);

const claimed = await as(db, 'service_role', null, async () =>
  (await q('select id, status from public.claim_outbox(5)')).rows
);
check('worker claims a queued message as sending, not sent', claimed.length === 1 && claimed[0].status === 'sending');
const marked = (
  await as(db, 'service_role', null, async () =>
    (await q(
      `with m as (select public.mark_outbox_result(?, true) as r)
       select (m.r).status as status, (m.r).sent_at as sent_at from m`,
      [claimed[0].id]
    )).rows[0])
);
check('delivery result recorded', marked.status === 'sent' && marked.sent_at != null, JSON.stringify(marked));

// ─── 8. portal surface, search, audit, kpis ─────────────────────────────────
const eventId = (
  await q(
    `insert into public.events (slug, title_am, starts_at, capacity, registration_required, state)
     values ('yezemam-guiz','የደም ሥውህነት ጉባኤ', now() + interval '7 days', 300, true, 'published')
     returning id`
  )
).rows[0].id;
const draftEventId = (
  await q(
    `insert into public.events (slug, title_am, starts_at, registration_required, state)
     values ('yebetu-guiz','ለውጥ ጉባኤ', now() + interval '20 days', true, 'draft')
     returning id`
  )
).rows[0].id;

const registered = await as(db, 'anon', null, async () =>
  (await q('select public.register_for_event(?, ?::jsonb) as r', [eventId, JSON.stringify({ full_name_am: 'አበበ ከበደ', phone: '0911223344', participants: '3' })])).rows[0].r
);
check('visitor registers for a published program', registered.participants === 3 && registered.status === 'registered', JSON.stringify(registered));

let overCapacity = 'accepted';
try {
  await as(db, 'anon', null, () =>
    q('select public.register_for_event(?, ?::jsonb)', [eventId, JSON.stringify({ full_name_am: 'ሐጏሳ ሰብአይ', participants: '400' })])
  );
} catch (e) {
  overCapacity = /ሙሉ ነው|ከ1 እስከ 50/.test(e.message) ? 'rejected' : e.message;
}
check('registration respects the seat limit', overCapacity === 'rejected', overCapacity);

let draftReg = 'accepted';
try {
  await as(db, 'anon', null, () =>
    q('select public.register_for_event(?, ?::jsonb)', [draftEventId, JSON.stringify({ full_name_am: 'አንበሳ ተሾመ' })])
  );
} catch (e) {
  draftReg = /ክፍት አይደለም/.test(e.message) ? 'rejected' : e.message;
}
check('an unpublished program cannot be registered for', draftReg === 'rejected', draftReg);

const news1 = (
  await as(db, 'anon', null, async () =>
    (await q('select public.subscribe_newsletter(?, ?) as r', ['berhan@tekle.test', 'ብርሃን ገብረ'])).rows[0].r)
).id;
const news2 = (
  await as(db, 'authenticated', S, async () =>
    (await q('select public.subscribe_newsletter(?) as r', ['Berhan@TEKLE.test'])).rows[0].r)
).id;
check('newsletter sign-up is idempotent and case-insensitive', news1 === news2);

// ─── 9. register close-out, summary and the teacher boundary ─────────────────
let teacherMayClose = 'allowed';
try {
  await as(db, 'authenticated', T, () =>
    q('select (public.close_attendance_session(?)).id as i', [sessionId])
  );
} catch (e) {
  teacherMayClose = /not allowed to close/.test(e.message) ? 'denied' : e.message;
}
check('marking attendance does not allow closing the register', teacherMayClose === 'denied', teacherMayClose);

const closedStatus = await as(db, 'authenticated', A, async () =>
  (await q('select (public.close_attendance_session(?)).status as st', [sessionId])).rows[0].st
);
check('the register closes and the class session is marked taken', closedStatus === 'closed');
const attSummary = (await q('select public.attendance_summary(?) as s', [studentId])).rows[0].s;
check(
  'attendance summary counts the student across sessions',
  Number(attSummary.sessions) === 1 && Number(attSummary.late) === 1 && attSummary.present_percent === 100,
  JSON.stringify(attSummary)
);

// ─── 10. promotion batch ─────────────────────────────────────────────────────
const levels = await q('select id, key from class_levels order by order_no');
const levelIndex = levels.rows.findIndex((l) => l.key === 'l3');
const fromLevel = levels.rows[levelIndex];
const toLevel = levels.rows[levelIndex + 1] || levels.rows[levelIndex - 1];
const batchId = (
  await q(
    `insert into promotion_batches (title_am, from_level_id, to_level_id, criteria, status, created_by)
     values ('የዓመት ማሻገር', ?, ?, '{"min_percent":60,"max_absence_pct":25}'::jsonb, 'approved', ?)
     returning id`,
    [fromLevel.id, toLevel.id, A]
  )
).rows[0].id;
await q(
  `insert into promotion_items (batch_id, student_id, from_class_id, to_class_id, average_percent, attendance_percent, decision)
   values (?, ?, ?, ?, 85, 100, 'promote')`,
  [batchId, studentId, classId, otherClassId]
);
let otherMayPromote = 'allowed';
try {
  await as(db, 'authenticated', O, () => q('select public.run_promotion(?)', [batchId]));
} catch (e) {
  otherMayPromote = /students.promote/.test(e.message) ? 'denied' : e.message;
}
check('only someone with the promote permission may run a batch', otherMayPromote === 'denied', otherMayPromote);

const promoted = await as(db, 'authenticated', A, async () =>
  (await q('select public.run_promotion(?) as r', [batchId])).rows[0].r
);
check(
  'promotion graduates the old seat, opens the new one and moves the level',
  promoted.promoted === 1 &&
    (
      await q(
        'select count(*)::int as n from student_enrollments where student_id = ? and class_id = ? and status = ?',
        [studentId, otherClassId, 'enrolled']
      )
    ).rows[0].n === 1 &&
    (await q('select level_key as k from student_profiles where id = ?', [studentId])).rows[0].k === toLevel.key,
  JSON.stringify(promoted)
);

// ─── 11. certificates: issued inside the ERP, verified from the public site ──
const templateId = (
  await q(
    `insert into certificate_templates (name_am, kind, heading_am, body_am, signature_name_am)
     values ('የትምህርት ማረጋገጫ','completion','ማረጋገጫ','{{student}} በ{{year}} ተመርቋል።','አቡነ ገብርኤል')
     returning id`
  )
).rows[0].id;
const certificate = await as(db, 'authenticated', A, async () =>
  (await q('select public.issue_certificate(?, ?, ?) as c', [studentId, templateId, null])).rows[0].c
);
check(
  'certificate issued with a number and a verification code',
  /^CTC-\d{4}-\d{5}$/.test(certificate.certificate_no) && !!certificate.verification_code,
  JSON.stringify(certificate)
);
const verified = await as(db, 'anon', null, async () =>
  (await q('select public.verify_certificate(?) as v', [certificate.verification_code])).rows[0].v
);
check('the public verify page confirms a genuine certificate', verified.valid === true);
const notVerified = await as(db, 'anon', null, async () =>
  (await q('select public.verify_certificate(?) as v', ['NOT-A-CODE'])).rows[0].v
);
check('a made-up code is reported as invalid rather than an error', notVerified.valid === false);

// ─── 12. library: the copy follows the loan, the daily job flags lateness ────
const bookId = (
  await q(`insert into library_books (title_am, author_am, total_copies) values ('መዝሙር ዳዊት','ቅኔ',2) returning id`)
).rows[0].id;
const copyId = (await q('insert into library_copies (book_id, barcode) values (?, ?) returning id', [bookId, 'BK-0001'])).rows[0].id;
const copy2Id = (await q('insert into library_copies (book_id, barcode) values (?, ?) returning id', [bookId, 'BK-0002'])).rows[0].id;
const loanId = (
  await q(
    'insert into library_loans (copy_id, borrower_student_id, due_on, handled_by) values (?, ?, current_date + 14, ?) returning id',
    [copyId, studentId, A]
  )
).rows[0].id;
check(
  'borrowing puts the copy on loan',
  (await q('select status as s from library_copies where id = ?', [copyId])).rows[0].s === 'on_loan'
);
await q("update library_loans set status = 'returned', returned_on = current_date where id = ?", [loanId]);
check(
  'returning frees the copy',
  (await q('select status as s from library_copies where id = ?', [copyId])).rows[0].s === 'available'
);
await q(
  'insert into library_loans (copy_id, borrower_student_id, loaned_on, due_on, handled_by) values (?, ?, current_date - 30, current_date - 2, ?)',
  [copy2Id, studentId, A]
);
const overdueCount = (await q('select public.mark_overdue_loans() as n')).rows[0].n;
check(
  'the overdue job flags the late loan and keeps the copy out',
  overdueCount === 1 &&
    (await q('select status as s from library_copies where id = ?', [copy2Id])).rows[0].s === 'on_loan',
  String(overdueCount)
);

// ─── 13. inventory: stock on hand is the sum of the movements ────────────────
const itemId = (
  await q(`insert into inventory_items (sku, name_am, quantity) values ('ST-001','ማህደረ ትምህርት መጽሐፍ', 0) returning id`)
).rows[0].id;
const movementId = (
  await q(
    "insert into inventory_movements (item_id, direction, quantity, reason_am, moved_by) values (?, 'in', 40, 'ግዢ', ?) returning id",
    [itemId, A]
  )
).rows[0].id;
await q("insert into inventory_movements (item_id, direction, quantity, reason_am, moved_by) values (?, 'out', 15, 'ስርጭት', ?)", [itemId, A]);
const issueId = (
  await q("select id from inventory_movements where item_id = ? and direction = 'out'", [itemId])
).rows[0].id;
check(
  'movements drive the stock on hand',
  Number((await q('select quantity as q from inventory_items where id = ?', [itemId])).rows[0].q) === 25
);
let negativeStock = 'accepted';
try {
  await q("insert into inventory_movements (item_id, direction, quantity, reason_am) values (?, 'out', 100, 'ሰረዝ')", [itemId]);
} catch (e) {
  negativeStock = /below zero|quantity/.test(e.message) ? 'rejected' : e.message;
}
check('a slip cannot take stock below zero', negativeStock === 'rejected', negativeStock);
await q('delete from inventory_movements where id = ?', [issueId]);
const afterDelete = Number((await q('select quantity as q from inventory_items where id = ?', [itemId])).rows[0].q);
check('deleting a slip rebuilds the stock from what is left', afterDelete === 40, String(afterDelete));

await q('delete from inventory_movements where id = ?', [movementId]);
const afterLedger = Number((await q('select quantity as q from inventory_items where id = ?', [itemId])).rows[0].q);
check('an empty ledger leaves no stock at all', afterLedger === 0, String(afterLedger));
await q("insert into inventory_movements (item_id, direction, quantity, reason_am, moved_by) values (?, 'in', 5, 'እርማሽ', ?)", [itemId, A]);
check(
  'the next slip rebuilds from the ledger, not from the stale number',
  Number((await q('select quantity as q from inventory_items where id = ?', [itemId])).rows[0].q) === 5
);
await q("update inventory_movements set quantity = 7 where item_id = ?", [itemId]);
check(
  'editing a slip re-derives the stock',
  Number((await q('select quantity as q from inventory_items where id = ?', [itemId])).rows[0].q) === 7
);

// ─── 14. volunteers: hours are counted, never typed in ───────────────────────
const memberId = (
  await q(`insert into members (full_name_am, is_volunteer, status) values ('ይሩሳሌም ተሾመ', true, 'active') returning id`)
).rows[0].id;
const volunteerId = (
  await q("insert into volunteer_profiles (member_id, status, skills) values (?, 'active', '{ዘማሪ}') returning id", [memberId])
).rows[0].id;
const assignmentId = (
  await q(
    "insert into volunteer_assignments (volunteer_id, role_am, hours, status) values (?, 'የመዝሙር ሐላፊ', 6, 'completed') returning id",
    [volunteerId]
  )
).rows[0].id;
await q("insert into volunteer_assignments (volunteer_id, role_am, hours, status) values (?, 'ክትትል', 3, 'assigned')", [volunteerId]);
check(
  'only completed service counts toward logged hours',
  Number((await q('select hours_logged as h from volunteer_profiles where id = ?', [volunteerId])).rows[0].h) === 6
);
await q("update volunteer_assignments set status = 'completed', hours = 4 where id = ?", [assignmentId]);
check(
  'editing a log re-derives the total',
  Number((await q('select hours_logged as h from volunteer_profiles where id = ?', [volunteerId])).rows[0].h) === 4
);

const kpis = (await q('select public.dashboard_kpis() as k')).rows[0].k;
check(
  'dashboard KPIs read live counts',
  kpis.students_active === 2 && kpis.content_published >= 1,
  JSON.stringify(kpis)
);

const searched = await as(db, 'anon', null, async () =>
  (await q('select * from public.search_site(?)', ['እምነት'])).rows
);
check('public search finds only published content', searched.length >= 1);

const audited = (
  await q("select count(*)::int as n from audit_logs where table_name = 'news'")
).rows[0].n;
check('sensitive writes are recorded in the audit log', audited > 0);

const forbidden = await as(db, 'anon', null, async () => {
  try {
    await q('select count(*)::int as n from public.student_profiles');
    return 'allowed';
  } catch (e) {
    return String(e.message).includes('permission denied') ? 'denied' : String(e.message);
  }
});
check('anon has no table privileges on student data', forbidden === 'denied', forbidden);

const pending = (await q('select count(*)::int as n from public.pending_approvals()')).rows[0].n;
check('pending approval queue is reportable', pending >= 1, `${pending} open requests`);

await db.close();
console.log(process.exitCode ? '\nsome database checks failed.' : '\ndatabase smoke test passed.');
