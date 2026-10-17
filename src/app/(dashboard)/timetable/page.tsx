import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/timetable");

export default function Page() {
  return <ModulePlaceholder href="/timetable" />;
}
