import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/attendance");

export default function Page() {
  return <ModulePlaceholder href="/attendance" />;
}
