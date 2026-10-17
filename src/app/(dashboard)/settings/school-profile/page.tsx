import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/settings/school-profile");

export default function Page() {
  return <ModulePlaceholder href="/settings/school-profile" />;
}
