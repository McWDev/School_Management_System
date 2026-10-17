import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/fees");

export default function Page() {
  return <ModulePlaceholder href="/fees" />;
}
