-- School Staff (2026-10-17): permissions, School Admin grants and starter work types.
INSERT INTO "permissions" ("key", "scope", "description") VALUES
  ('staff.read', 'tenant', 'View school staff'),
  ('staff.manage', 'tenant', 'Add and edit school staff and work types')
ON CONFLICT ("key") DO UPDATE SET "scope" = EXCLUDED."scope", "description" = EXCLUDED."description";
--> statement-breakpoint
-- The School Admin preset holds every school permission, including new ones.
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p."key"
FROM "roles" r CROSS JOIN (VALUES ('staff.read'), ('staff.manage')) AS p("key")
WHERE r."preset_key" = 'school_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Starter work types for every existing school (new schools get them on registration).
INSERT INTO "work_types" ("tenant_id", "name")
SELECT t."id", w."name"
FROM "tenants" t CROSS JOIN (VALUES
  ('Teacher'), ('Administrator'), ('Accountant'), ('Secretary'), ('Librarian'),
  ('Security Guard'), ('Cleaner'), ('Driver'), ('Cook')
) AS w("name")
ON CONFLICT DO NOTHING;
