import type { Metadata } from "next";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { allNavItems } from "./nav-config";
import { PageHeader } from "./page-header";

/*
 * Temporary page body for navigation items whose module is not built yet.
 * Each module task replaces its placeholder page with the real one.
 */

function getItem(href: string) {
  const item = allNavItems.find((navItem) => navItem.href === href);
  if (!item) throw new Error(`No navigation item for ${href}`);
  return item;
}

export function placeholderMetadata(href: string): Metadata {
  return { title: getItem(href).title };
}

export function ModulePlaceholder({ href }: { href: string }) {
  const item = getItem(href);
  return (
    <>
      <PageHeader title={item.title} description={item.description} />
      <Card>
        <EmptyState
          icon={Construction}
          title="This module is not available yet"
          description={`${item.title} will be added in an upcoming release.`}
        />
      </Card>
    </>
  );
}
