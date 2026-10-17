# Open Questions for Product Owner

These are intentionally not blockers for initial documentation review. Confirm them before the related module reaches production.

1. **School ID format:** Should the system generate student and teacher numbers automatically? If yes, what format/prefix is preferred?
2. **Currency:** Which currency should each school use (e.g. USD or SOS)? MVP assumes one currency per school.
3. **Grading:** What grading scale and pass mark should be used? Should it vary by school/class/academic year?
4. **Attendance:** Should Excused count in the attendance denominator? How should Late count?
5. **Enrollment:** Can a student have multiple simultaneous class enrollments in one academic year?
6. **Fees:** Are fees automatically assigned at enrollment or manually assigned by finance staff?
7. **Overpayment:** Should overpayment become student credit, be rejected or require an adjustment?
8. **Payments:** Which payment methods are needed initially: cash, bank, mobile money, other?
9. **Language:** Is English acceptable for MVP, with Somali localization later?
10. **Student/parent access:** Is a separate student or parent portal required in a future phase?
11. **Registration approval:** Should new school registrations require platform approval before the school can use the system? Default assumption: yes.
12. **Uploads:** Should profile photos and school logos be included in MVP? If yes, select private/object storage and define size/type limits.
13. **Notifications:** Are in-app notifications enough initially, or are email/SMS required?
14. **Legal/privacy:** What country-specific privacy, retention and student-data requirements apply to the deployment?

Record each approved decision in `02-Product-Decisions.md` before changing the implementation.
