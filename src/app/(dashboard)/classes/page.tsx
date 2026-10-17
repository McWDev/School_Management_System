import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/classes");

export default function Page() {
  return <ModulePlaceholder href="/classes" />;
}
