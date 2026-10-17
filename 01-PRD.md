# Product Requirements Document (PRD)
## School Management System (SMS)

- **Nooca dokumentiga:** 1.0 — Draft for review
- **Xaaladda:** Qorshe; coding lama bilaabin
- **Stack:** Next.js + Node.js + Neon PostgreSQL
- **Isticmaalka:** Web application responsive ah, si fiican uga shaqeeya desktop, tablet iyo mobile

## 1. Dulmar
School Management System waa application maamulka dugsiyada oo isku keenaya xogta ardayda, macallimiinta, fasallada, koorsooyinka/maaddooyinka, lacagaha dugsiga, imtixaannada, xaadirinta, warbixinnada, jadwalka iyo dejimaha. Interface-ku waa inuu ahaadaa mid nadiif ah, casri ah, si fudud loo fahmi karo, degdeg ah, oo la isticmaali karo iyada oo aan tababar badan loo baahnayn.

Nidaamku wuxuu yeelanayaa qaab **SaaS multi-tenant** ah: dugsiyo kala duwan ayaa isticmaali kara hal application, xogta dugsi kastana waa inay si adag uga go'daa xogta dugsiyada kale. Dugsi kasta wuxuu yeelan karaa laamo (branches), wuxuuna maamuli karaa shaqadiisa maalinlaha ah. Platform-level administrator wuxuu maamuli karaa tenant-yada iyo dejimaha guud ee SaaS-ka.

## 2. Dhibaatada la xallinayo
- Xogta ardayda iyo macallimiinta oo ku kala firdhisan buugaag ama spreadsheets.
- Raadraaca lacagaha iyo lacagaha harsan oo adag.
- Xaadirin iyo imtixaan natiijooyinkooda oo aan si fudud loo soo saari karin.
- Maamulaha oo aan hal dashboard uga arki karin xogta muhiimka ah.
- Laamaha dugsiga oo u baahan inay wadaagaan nidaam laakiin xogtooda iyo hawlahooda la kala xakameeyo.

## 3. Yoolalka
1. In xogta muhiimka ah lagu maamulo hal meel.
2. In la helo dashboard leh tirokoobyo sax ah oo la cusboonaysiin karo.
3. In users-ka loo oggolaado oo keliya hawlaha ku habboon doorkooda iyo laantooda.
4. In la yareeyo khaladaadka xog-gelinta iyadoo la adeegsanayo validation iyo duplicate checks.
5. In la soo saari karo reports la shaandhayn karo, lana daabici karo ama CSV ahaan loo dhoofin karo.
6. In nidaamku noqdo mid la ballaarin karo, ammaan ah, lana tijaabiyay.

## 4. Waxyaabaha ku jira scope-ka

### 4.1 Modules-ka aasaasiga ah
- Dashboard
- Classes
- Students
- Teachers
- Courses / Subjects
- School Fees
- Exams
- Attendance
- Reports
- Timetable
- System Settings:
  - Academic Years
  - Branches
  - School Registrations
  - Profile and school details
  - Users, roles and permissions
  - General preferences

### 4.2 Waxyaabaha taageeraya
- Login/logout iyo password reset
- User and role management
- Search, filters, pagination
- Audit log
- Notifications gudaha application-ka (marxaladda aasaasiga ah)
- Import/export CSV marka module-ku u baahdo
- Responsive design
- Error, loading, empty, success states
- Database migrations iyo seed data development ah

## 5. Waxyaabaha aan ku jirin MVP-ga
Waxyaabahan lama dhisayo ilaa si gaar ah loo ansixiyo:
- Mobile native app (Android/iOS); web-ka ayaa mobile-friendly noqonaya
- Online payment gateway
- SMS/WhatsApp lacag-bixin ama fariimo
- Parent portal ama student portal
- E-learning/LMS
- Transport, library, hostel, inventory
- Payroll iyo HR buuxa
- Biometric attendance
- Automated AI grading
- Integration la leh government systems

## 6. Noocyada users-ka
1. **Platform Super Admin:** maamula tenants/dugsiyada ku jira SaaS-ka, platform-level status iyo support.
2. **School Owner / School Admin:** maamula dugsigiisa, laamihiisa, users-kiisa iyo xogta guud.
3. **Branch Admin:** maamula hawlaha iyo xogta laanta loo xilsaaray.
4. **Teacher:** arki kara fasallada/maaddooyinka loo xilsaaray; geliya xaadirinta iyo natiijooyinka haddii loo oggolaado.
5. **Finance Officer:** maamula school fees, receipts, balances iyo finance reports.
6. **Registrar / Academic Officer:** maamula ardayda, fasallada, courses iyo academic-year operations.
7. **Read-only / Auditor:** arki kara oo keliya xogta loo oggolaaday, waxna kama beddeli karo.

Roles-ku waa inay ku xiran yihiin permissions cad. Magacyadani waa role presets; nidaamku waa inuu awood u yeeshaa in permissions la habeeyo.

## 7. Functional requirements

### 7.1 Dashboard
- Muujiyo tirooyinka ardayda firfircoon, macallimiinta, fasallada, lacagaha la ururiyey, lacagaha harsan, attendance rate iyo imtixaannada soo socda.
- Taariikh, academic year iyo branch filters.
- Charts iyo recent activities.
- Quick actions: Add Student, Add Teacher, Record Payment, Take Attendance, Create Exam.
- Tirokoobyadu waa inay ka yimaadaan database-ka, ma aha tirooyin hardcoded ah.
- Dashboard-ka user kastaa wuxuu arkaa oo keliya xogta permissions-kiisa.

### 7.2 Classes
- Abuur, eeg, wax ka beddel, archive fasal.
- Fields: class name/code, academic year, branch, capacity (optional), class teacher (optional), status.
- Ka hortag class code/name duplicate ah isla branch iyo academic year.
- Ardayda fasalka ku jira iyo maaddooyinka loo xilsaaray ha laga arki karo class detail.

### 7.3 Students
- Student number/ID gaar ah oo joogto ah.
- Magaca oo buuxa, gender (optional per school policy), date of birth (optional), contact, address, guardian/contact, admission date, branch, class, academic year, status, profile photo (optional).
- Search by student number/name/contact; filters by class, branch, academic year, status.
- Create/edit/view/archive; archive kama tirtirayo taariikhda lacagaha, xaadirinta ama natiijooyinka.
- Duplicate warning ku salaysan student number iyo xogta aqoonsiga ee la doortay.
- Student profile wuxuu leeyahay tabs: Overview, Academic, Attendance, Fees, Exams, History.
- Xogta xasaasiga ah waxaa arki kara roles loo oggolaaday oo keliya.

### 7.4 Teachers
- Teacher ID, full name, contact, email (optional), address (optional), hire date, branch assignment, subjects/classes assigned, status, profile photo (optional).
- CRUD iyo archive.
- Teacher detail wuxuu muujinayaa assignments iyo hawlaha uu fasax u leeyahay.
- Teacher ma arki karo xogta finance-ka ardayda ilaa permission gaar ah la siiyo.

### 7.5 Courses / Subjects
- Samee maaddo/course leh code, name, description (optional), status.
- Course waxaa lagu xiriirin karaa fasallo iyo academic year.
- Maaree teacher assignment iyo course/class relationship.
- Ka hortag duplicate course code gudaha tenant-ka.
- Course deletion-ku waa in la xaddido haddii records taariikhi ahi ku xiran yihiin; isticmaal archive.

### 7.6 School Fees
- Fee structure per academic year/class, fee type, amount, due date (optional), branch applicability.
- Student fee account/charges.
- Record payment: amount, date, payment method (cash/bank/mobile/other), reference, receipt number, recorded by, notes.
- Xisaabi total charged, total paid, balance due.
- Partial payments waa la oggol yahay.
- Receipt la daabici karo.
- Payments lama hard-delete-gareyn karo; correction/refund waxaa lagu sameeyaa reversal/adjustment record leh reason, user iyo timestamp.
- Finance permissions ayaa xaddidaya aragtida iyo wax-ka-beddelka lacagaha.
- Currency waa school setting; hal currency ayaa loo isticmaalaa gudaha school-ka MVP-ga.

### 7.7 Exams
- Create exam: name, exam type, academic year, branch, class, start/end date, status.
- Subjects/courses iyo marks allocation.
- Student marks entry; validate score range iyo total.
- Calculate totals, percentage, grade/pass status iyadoo grading scale la dejin karo.
- Publish results action oo role-gated ah.
- Draft results ma muuqdaan users aan loo oggolayn.
- Mark correction wuxuu kaydiyaa audit trail iyo sababta.
- MVP-ga wuxuu taageerayaa natiijooyin/marks management; online exam delivery ma aha scope-ka.

### 7.8 Attendance
- Attendance session by date, branch, class and optionally subject.
- Status: Present, Absent, Late, Excused.
- Teacher wuxuu geli karaa xaadirinta fasallada loo xilsaaray.
- Prevent duplicate attendance record for same student/session.
- Attendance summary per student/class/date range.
- Correction waxay u baahan tahay permission, waxaana lagu qoraa audit log.
- Attendance rate formula iyo treatment-ka Excused waxaa lagu dejinayaa product decision ka hor release.

### 7.9 Reports
- Student list and admission report
- Class roster
- Teacher list
- Attendance report
- Exam results / performance report
- Fees collected, outstanding balances, payments by period
- Branch and academic-year comparisons, haddii user-ku leeyahay permission
- Filters: date range, academic year, branch, class, status
- Print-friendly view iyo CSV export.
- Export permissions waa inay ka duwanaan karaan view permissions.
- Reports waa inay ku dabaqaan tenant/branch access filters.

### 7.10 Timetable
- Create timetable per branch, class, academic year and weekday.
- Fields: day, start time, end time, class, course, teacher, room (optional).
- Prevent invalid time ranges and overlapping assignments for the same teacher/class.
- Show weekly timetable with readable grid and mobile-friendly list view.
- Conflicts must be shown clearly before saving.

### 7.11 System Settings
**Academic Years**
- Name, start date, end date, status (planned/current/closed).
- Hal academic year oo current ah per school, haddii school-ku doorto xeerkaas.
- Xogtii hore waa inay sii jirtaa marka year la xiro.

**Branches**
- Branch name/code, address/contact, status.
- School Admin wuxuu abuuri karaa oo maamuli karaa branches.
- Branch Admin wuxuu geli karaa laantiisa oo keliya.
- Branches leh records lama hard-delete-gareyn karo; waa la archive-gareyn karaa.

**School Registrations**
- School/tenant registration details: legal/display name, school code, contact, address, logo (optional), status, created date, subscription/status fields for platform administration.
- Platform Super Admin wuxuu ansixin karaa, hakad gelin karaa ama dib u hawlgelin karaa school registration.
- School Admin wuxuu maamuli karaa xogta dugsigiisa, laakiin ma beddeli karo platform-level status.
- MVP-ga subscription billing lacag-bixin dhab ah ma samaynayo.

**Other settings**
- School profile/logo, timezone, currency, grading scale, attendance policy, receipt prefix, date format.
- User management, role/permission setup.
- Notification preferences (basic).

## 8. Non-functional requirements
- Security: authorization server-side, password hashing, secure sessions, rate limiting on auth, CSRF protection where applicable, input validation.
- Tenant isolation: tenant_id must be enforced on every tenant-owned data access.
- Branch isolation: branch-scoped users cannot read or modify another branch's records.
- Performance: common list pages should remain responsive with pagination and indexed queries; define measurable targets in acceptance criteria.
- Accessibility: keyboard navigation, visible focus, labels, contrast, semantic controls.
- Reliability: migrations, backups and documented restore process.
- Maintainability: TypeScript strict mode, modular code, reusable components, tests.
- Privacy: collect only necessary data; avoid exposing student/guardian contact information in public URLs or logs.
- Localization: initial UI language English; structure should allow Somali localization later.
- Auditability: record important actions such as payments, permissions, marks publication, status changes and user management.

## 9. Success metrics
- A school administrator can create a school profile, branch, academic year, class and student without developer help.
- A finance officer can record a payment and print a receipt.
- An authorized teacher can record attendance for an assigned class only.
- Reports match underlying records and respect permissions.
- Automated tests prove tenant and branch isolation.
- No critical/high security issues remain at release.
- All MVP acceptance criteria pass.

## 10. Assumptions
- System is multi-tenant SaaS, with separate school tenants and optional branches per school.
- MVP is a responsive web application.
- Initial UI language is English; Somali can be added in a later phase.
- School fees use one configured currency per school in MVP.
- Online payment gateway is excluded.
- Claude Code must implement in small, reviewable tasks, not as one large generation.

## 11. Risks
- Tenant isolation bugs can expose one school's data to another; test this from the first data module.
- Custom authentication increases security responsibility; use proven password hashing and secure cookie/session practices.
- Financial records cannot be casually deleted; build reversal/audit behavior early.
- Academic rules differ by school; make grading and attendance policies configurable where practical.
- Overloading early tasks with all modules increases defects; use the task roadmap.
