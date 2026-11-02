// Runs the pure frontend logic in node, the way scripts/smoke-db.mjs runs the
// database: real assertions, no browser, nothing mocked.
//   npm run lib:check
function check(name, ok, detail = '') {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
  return ok;
}

const {
  toEthiopian,
  fromEthiopian,
  formatEthiopian,
  toGeEz,
  weekdayIndex,
  isEthLeapYear,
  ethMonthLength,
  ethYearLength,
  addDays,
  ETH_MONTHS,
  ETH_WEEKDAYS,
} = await import('../src/lib/ethiopian.ts');
const { fasika, genna, timket, devotionFor, fastSpan, fastLength } = await import('../src/lib/liturgical.ts');
const { br, num, pct, phoneAm, initials, fileSize, relativeAm, toCsv } = await import('../src/lib/format.ts');
const { friendlyError, isRlsDenied } = await import('../src/lib/errors.ts');
const { amText, ethPhone, ethEmail, slugField, amountField, isoDate } = await import('../src/lib/validation.ts');
const { ALL_PERMISSION_KEYS, homeFor, moduleOf, PORTAL_ROLES, rolesWith } = await import('../src/lib/permissions.ts');

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (s) => new Date(`${s}T00:00:00`);

// ─── 1. calendar anchors, each one verifiable against a published date ───────
const newYears = [
  [2016, '2023-09-12'],
  [2017, '2024-09-11'],
  [2018, '2025-09-11'],
  [2019, '2026-09-11'],
  [2020, '2027-09-12'],
];
for (const [ey, greg] of newYears) {
  check(`1 መስከረም ${ey} ዓ.ም. = ${greg}`, iso(fromEthiopian({ year: ey, month: 1, day: 1 })) === greg);
}
check('New Year alternates 11/12 September with the Ethiopian leap day', isEthLeapYear(2019) && !isEthLeapYear(2020));
check('ጳጉሜ has six days only in an Ethiopian leap year', ethMonthLength(2019, 13) === 6 && ethMonthLength(2020, 13) === 5);
check('the anchor day 1 መስከረም ፳፻፲፱ reads as a ዓርብ', ETH_WEEKDAYS[weekdayIndex(day('2026-09-11'))] === 'ዓርብ');
check('today renders the way the parish writes it', formatEthiopian(day('2026-11-02')) === '፳፫ ሰኞ ጥቅምት ፳፻፲፱', formatEthiopian(day('2026-11-02')));

// ─── 2. round trip: no day is lost in either direction ──────────────────────
let broken = 0;
let invalid = 0;
const scanFrom = day('2000-01-01');
const scanSpan = 41 * 366;
for (let i = 0; i <= scanSpan; i += 1) {
  const g = new Date(scanFrom.getFullYear(), scanFrom.getMonth(), scanFrom.getDate() + i);
  if (g.getFullYear() > 2040) break;
  const e = toEthiopian(g);
  if (e.day < 1 || e.day > ethMonthLength(e.year, e.month)) {
    invalid += 1;
    continue;
  }
  if (iso(fromEthiopian(e)) !== iso(g)) broken += 1;
}
check('every Gregorian day 2000–2040 maps to a valid Ethiopian day and back', broken === 0 && invalid === 0, `${broken} broken, ${invalid} invalid`);

const ethDays = [2015, 2016, 2017, 2018, 2019, 2020].reduce((sum, y) => sum + ethYearLength(y), 0);
check('Ethiopian year lengths add up over six years (two leap years)', ethDays === 365 * 6 + 2, String(ethDays));

// ─── 3. Ge'ez numerals ──────────────────────────────────────────────────────
const geezCases = [
  [1, '፩'],
  [9, '፱'],
  [10, '፲'],
  [24, '፳፬'],
  [30, '፴'],
  [31, '፴፩'],
  [100, '፻'],
  [101, '፻፩'],
  [200, '፪፻'],
  [1000, '፲፻'],
  [2019, '፳፻፲፱'],
  [20250, '፪፼፪፻፶'],
];
for (const [n, want] of geezCases) {
  check(`ge'ez ${n} = ${want}`, toGeEz(n) === want, toGeEz(n));
}

// ─── 4. Fasika and the movable year ─────────────────────────────────────────
const fasikaCases = [
  [2015, '2023-04-16'],
  [2016, '2024-05-05'],
  [2017, '2025-04-20'],
  [2018, '2026-04-12'],
  [2019, '2027-05-02'],
];
for (const [ey, greg] of fasikaCases) {
  check(`ፋሲካ ${ey} ዓ.ም. = ${greg}`, iso(fasika(ey)) === greg, iso(fasika(ey)));
}
check('Fasika is always a Sunday', [2000, 2005, 2011, 2016, 2019, 2020, 2021].every((y) => fasika(y).getDay() === 0));

// The Bahire Hasab counts the fasts from Pascha. 2017 ዓ.ም. is the published
// check: ጾመ ነቢያት on Yekatit 3 (10 February 2025) and Clean Monday on 17 February.
check('ጾመ ነቢያት ፳፻፺፩ = Yekatit 3 (10–12 February 2025)', iso(fastSpan('nineveh', 2017)[0]) === '2025-02-10' && iso(fastSpan('nineveh', 2017)[1]) === '2025-02-12');
check('ዓቢይ ጾም ፳፻፺፩ = Clean Monday 17 February to Holy Saturday 19 April 2025', iso(fastSpan('great', 2017)[0]) === '2025-02-17' && iso(fastSpan('great', 2017)[1]) === '2025-04-19');
check('the 2019 ዓ.ም. fasts shift with its later Pascha', iso(fastSpan('great', 2019)[0]) === '2027-03-01' && iso(fastSpan('great', 2019)[1]) === '2027-05-01' && iso(fastSpan('nineveh', 2019)[0]) === '2027-02-22');
check('ጾመ ነቢያት is three days and ዓቢይ ጾም sixty-two', fastLength('nineveh', 2019) === 3 && fastLength('great', 2019) === 62, `${fastLength('nineveh', 2019)}, ${fastLength('great', 2019)}`);
check('both Lenten fasts open on a Monday', [2015, 2017, 2019, 2020].every((y) => fastSpan('great', y)[0].getDay() === 1 && fastSpan('nineveh', y)[0].getDay() === 1));
check('ዓቢይ ጾም closes on Holy Saturday, the day before ፋሲካ', [2015, 2017, 2019].every((y) => iso(fastSpan('great', y)[1]) === iso(addDays(fasika(y), -1))));
check('ጾመ ግንባታ ends on ርእሰ ልደት, the day before ልደት', [2018, 2019, 2020].every((y) => iso(fastSpan('nativity', y)[1]) === iso(addDays(genna(y), -1))) && fastLength('nativity', 2019) === 55);

// Fixed feasts: Genna is 7 January except in the year after an Ethiopian leap year.
check('ልደት ፳፻፲፱ = Jan 7', iso(genna(2019)) === '2027-01-07');
check('ጥምቀት ፳፻፲፱ = Jan 19', iso(timket(2019)) === '2027-01-19');
check('ልደት shifts to Jan 8 in the year after the leap year', iso(genna(2020)) === '2028-01-08');
check('ጥምቀት shifts to Jan 20 in the same year', iso(timket(2020)) === '2028-01-20');
check('ምስቀል = Sept 27', iso(fromEthiopian({ year: 2019, month: 1, day: 17 })) === '2026-09-27');
check('እንቁጣጣሽ and ምስቀል are named on their days', devotionFor(day('2026-09-11')).feasts.some((f) => f.key === 'enkutatash') && devotionFor(day('2026-09-27')).feasts.some((f) => f.key === 'meskel'));

const d = devotionFor(day('2027-05-02'));
check('Fasika Sunday reads as a feast and not a fast', d.isFeast && !d.isFastDay, JSON.stringify(d.feasts));
const wedInLent = devotionFor(day('2027-03-17'));
check('a Wednesday inside Great Lent reports one fast, not two', wedInLent.fast?.key === 'great' && wedInLent.isFastDay, wedInLent.seasonAm);
const wedInNineveh = devotionFor(day('2027-02-24'));
check('the Wednesday of Nineveh reports the three-day fast by name', wedInNineveh.fast?.key === 'nineveh' && wedInNineveh.seasonAm === 'ጾመ ነቢያት', wedInNineveh.seasonAm);
const friAfterFasika = devotionFor(day('2027-05-07'));
check('no Wednesday/Friday fast during the fifty days of Fasika', !friAfterFasika.isFastDay, friAfterFasika.seasonAm);
const fri = devotionFor(day('2026-11-06'));
check('an ordinary Friday is a fast day', fri.isFastDay && fri.fastKind === 'week', fri.fast?.nameAm ?? '');
const holySaturday = devotionFor(day('2027-05-01'));
check('Holy Saturday sits in the Passion week season', holySaturday.seasonAm === 'ልቅ ዓርብ ሳምንት', holySaturday.seasonAm);
check('ግንባታ fast is named before ልደት', devotionFor(day('2026-12-20')).fastKind === 'nativity');

// ─── 5. money, phones, sizes ────────────────────────────────────────────────
check('money renders with ብር first', br(1250.5) === 'ብር 1,250.5' && br('1250') === 'ብር 1,250' && br(null) === 'ብር 0', br(1250.5));
check('money keeps cents when asked', br(99.999, { cents: true }) === 'ብር 100.00', br(99.999, { cents: true }));
check('thousands group', num('1234567.8') === '1,234,567.8');
check('percent drops a useless .0', pct(80) === '80%' && pct(78.5) === '78.5%');
check('local and international phones normalise the same way', phoneAm('0911234567') === '+251 911 234 567' && phoneAm('+251911234567') === '+251 911 234 567', phoneAm('0911234567'));
check('a short phone is shown as typed, not padded', phoneAm('1234') === '1234');
check('two-name initials, Amharic-aware', initials('አበበ ተስፋዬ') === 'አተ' && initials('') === 'ቤ');
check('file sizes speak Amharic', fileSize(2048) === '2.0 ኪሎ ባይት', fileSize(2048));
check('relative time reads naturally', relativeAm(new Date(Date.now() - 86400000)) === 'ትናንት');

// ─── 6. CSV must not mangle Amharic or commas ───────────────────────────────
const csv = toCsv([{ ስም: 'አበበ, ተስፋዬ', መጠን: 100 }, { ስም: 'ሐገስ "ኃይሌ"', መጠን: null }]);
check('csv quotes separators and escapes quotes', csv.includes('"አበበ, ተስፋዬ"') && csv.includes('"ሐገስ ""ኃይሌ"""'), csv.split('\n')[2]);
check('csv starts with a BOM so Excel reads Amharic', csv.charCodeAt(0) === 0xfeff);
check('an empty export is empty rather than a stray BOM', toCsv([]) === '');

// ─── 7. every database failure gets an Amharic sentence ─────────────────────
check('a row-level security denial is explained', friendlyError({ code: '42501', message: 'permission denied for table students' }).includes('መብት'));
check('a duplicate key is explained', friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "students_code_key"' }).includes('አይደገምም'));
check('a bare SQLSTATE still gets a sentence', friendlyError({ code: '23505', message: 'unique violation' }).includes('ቀድሞ'));
check('an expired session tells the person to sign in', friendlyError({ code: 'PGRST301', message: 'JWT expired' }).includes('ይግቡ'));
check('Amharic raised by the database passes straight through', friendlyError({ code: 'P0001', message: 'እባክዎ ስልክ ቁጥር ይሙሉ' }) === 'እባክዎ ስልክ ቁጥር ይሙሉ');
check('a network failure is described as a network failure', friendlyError({ code: '', message: 'Failed to fetch' }).includes('ኢንተርኔት'));
check('unknown failures still say something', friendlyError({}).includes('ችግር'));
check('RLS detection matches the denial', isRlsDenied({ code: '42501', message: '' }) && isRlsDenied({ message: 'new row violates row-level security policy' }));

// ─── 8. client-side rules mirror the database CHECKs ────────────────────────
check('a missing required field is refused in Amharic', !amText('ስም').safeParse('').success && amText('ስም').safeParse('አ').success);
check('a too-long field is refused with the limit named', amText('መልእክት', { max: 10 }).safeParse('አ።ሕዝብከማኝ።የወረደ').success === false);
check('an optional field accepts empty', amText('ማስታወሻ', { required: false }).safeParse('').success);
check('phone accepts the shapes a parishioner types', ['0911234567', '+251911234567', '091 12 34 56 7'].every((v) => ethPhone().safeParse(v).success));
check('phone refuses a short number', !ethPhone().safeParse('0911').success);
check('email is lower-cased and validated', ethEmail().safeParse('Abebe@TEKLE.TEST').data === 'abebe@tekle.test' && !ethEmail().safeParse('nope').success);
check('slug refuses Amharic, matching the database constraint', !slugField().safeParse('ዜና-2019').success && slugField().safeParse('news-2019').success);
check('amount refuses an over-limit pledge like the RPC does', !amountField().safeParse('20000000').success && amountField().safeParse('500').success);
check('amount refuses text', !amountField().safeParse('መቶ').success);
check('iso date refuses a non-date', !isoDate().safeParse('2026-13-40').success && isoDate().safeParse('2026-01-04').success);

// ─── 9. permissions: generated from the migrations, not retyped ─────────────
check('permission keys are the closed module.action list', ALL_PERMISSION_KEYS.length > 40 && ALL_PERMISSION_KEYS.every((k) => /^[a-z_]+\.[a-z_]+$/.test(k)), String(ALL_PERMISSION_KEYS.length));
check('moduleOf splits the key the way the sidebar groups it', moduleOf('finance.approve') === 'finance');
check('the seeded grants are readable', rolesWith('students.promote').includes('super_admin') && rolesWith('students.promote').includes('registrar'));
check('a super admin lands on the dashboard', homeFor(['super_admin'], ['system.read']) === '/erp/dashboard');
check('a teacher lands in the teacher portal', homeFor(['teacher'], ['attendance.mark']) === '/erp/portal/teacher');
check('a parent with no ERP rights gets the parent portal', homeFor(['parent'], ['attendance.read']) === '/erp/portal/parent');
check('a website editor lands on the CMS', homeFor(['website_editor'], ['website.read']) === '/erp/website/homepage');
check('the four portals are the ones the specification names', PORTAL_ROLES.join(',') === 'student,parent,teacher,department_head');

console.log(process.exitCode ? '\nsome library checks FAILED' : `\nall library checks passed (${ETH_MONTHS.length} months)`);
