import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/settings/users");

export default function Page() {
  return <ModulePlaceholder href="/settings/users" />;
}
