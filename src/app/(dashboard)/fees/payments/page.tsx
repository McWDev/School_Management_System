import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/fees/payments");

export default function Page() {
  return <ModulePlaceholder href="/fees/payments" />;
}
