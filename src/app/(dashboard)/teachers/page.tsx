import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/teachers");

export default function Page() {
  return <ModulePlaceholder href="/teachers" />;
}
