import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/courses");

export default function Page() {
  return <ModulePlaceholder href="/courses" />;
}
