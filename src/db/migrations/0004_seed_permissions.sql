-- Permission catalog (generated from src/lib/permissions/catalog.ts).
-- Re-running is safe: descriptions/scopes are updated in place.
INSERT INTO "permissions" ("key", "scope", "description") VALUES
  ('schools.read', 'platform', 'View school registrations'),
  ('schools.create', 'platform', 'Register schools'),
  ('schools.update', 'platform', 'Edit school registrations'),
  ('schools.activate', 'platform', 'Approve or reactivate schools'),
  ('schools.suspend', 'platform', 'Suspend, reject or archive schools'),
  ('platform_audit.read', 'platform', 'View platform audit log'),
  ('dashboard.read', 'tenant', 'View the school dashboard'),
  ('branches.read', 'tenant', 'View branches'),
  ('branches.create', 'tenant', 'Create branches'),
  ('branches.update', 'tenant', 'Edit branches'),
  ('branches.archive', 'tenant', 'Archive and restore branches'),
  ('academic_years.read', 'tenant', 'View academic years'),
  ('academic_years.manage', 'tenant', 'Manage academic years'),
  ('settings.manage', 'tenant', 'Manage school profile and settings'),
  ('users.manage', 'tenant', 'Manage users and their access'),
  ('roles.manage', 'tenant', 'Manage roles and permissions'),
  ('audit_logs.read', 'tenant', 'View the school audit log'),
  ('students.read', 'tenant', 'View students'),
  ('students.create', 'tenant', 'Admit students'),
  ('students.update', 'tenant', 'Edit students'),
  ('students.archive', 'tenant', 'Archive students'),
  ('teachers.read', 'tenant', 'View teachers'),
  ('teachers.create', 'tenant', 'Add teachers'),
  ('teachers.update', 'tenant', 'Edit teachers'),
  ('teachers.archive', 'tenant', 'Archive teachers'),
  ('classes.read', 'tenant', 'View classes'),
  ('classes.manage', 'tenant', 'Manage classes'),
  ('courses.read', 'tenant', 'View courses and subjects'),
  ('courses.manage', 'tenant', 'Manage courses and subjects'),
  ('timetable.read', 'tenant', 'View timetables'),
  ('timetable.manage', 'tenant', 'Manage timetables'),
  ('attendance.read', 'tenant', 'View attendance'),
  ('attendance.take', 'tenant', 'Take attendance'),
  ('attendance.correct', 'tenant', 'Correct attendance'),
  ('exams.read', 'tenant', 'View exams and results'),
  ('exams.manage', 'tenant', 'Set up exams'),
  ('exams.enter_marks', 'tenant', 'Enter marks'),
  ('exams.publish_results', 'tenant', 'Publish results'),
  ('exams.correct_results', 'tenant', 'Correct published results'),
  ('fees.read', 'tenant', 'View fees and payments'),
  ('fees.manage_structure', 'tenant', 'Manage fee structures and charges'),
  ('fees.record_payment', 'tenant', 'Record payments'),
  ('fees.reverse_payment', 'tenant', 'Reverse or adjust payments'),
  ('reports.read', 'tenant', 'View reports'),
  ('reports.export', 'tenant', 'Export reports')
ON CONFLICT ("key") DO UPDATE SET "scope" = EXCLUDED."scope", "description" = EXCLUDED."description";
--> statement-breakpoint
-- Platform role: Platform Super Admin
INSERT INTO "roles" ("tenant_id", "preset_key", "name", "description", "locked")
SELECT NULL, 'platform_super_admin', 'Platform Super Admin', 'Manages school registrations and platform support. No access to school records.', true
WHERE NOT EXISTS (SELECT 1 FROM "roles" WHERE "tenant_id" IS NULL AND "preset_key" = 'platform_super_admin');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p."key" FROM "roles" r CROSS JOIN (VALUES ('schools.read'), ('schools.create'), ('schools.update'), ('schools.activate'), ('schools.suspend'), ('platform_audit.read')) AS p("key")
WHERE r."tenant_id" IS NULL AND r."preset_key" = 'platform_super_admin'
ON CONFLICT DO NOTHING;
