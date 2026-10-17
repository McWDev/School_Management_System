import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/settings/academic-years");

export default function Page() {
  return <ModulePlaceholder href="/settings/academic-years" />;
}
