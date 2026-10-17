import { ModulePlaceholder, placeholderMetadata } from "@/components/layout/module-placeholder";

export const metadata = placeholderMetadata("/exams");

export default function Page() {
  return <ModulePlaceholder href="/exams" />;
}
