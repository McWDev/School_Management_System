import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/settings/general");

export default function Page() {
  return <ModulePlaceholder href="/settings/general" />;
}
