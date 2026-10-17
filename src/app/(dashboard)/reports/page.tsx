import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/reports");

export default function Page() {
  return <ModulePlaceholder href="/reports" />;
}
