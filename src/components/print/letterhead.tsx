import { GraduationCap, Globe, Mail, MapPin, Phone } from "lucide-react";

export type LetterheadSchool = {
  name: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
  managerName: string | null;
};

/**
 * School letterhead for report sheets, receipts and letters. Uses only the
 * school profile; prints cleanly (no shadows, neutral colors).
 */
export function Letterhead({
  school,
  logoSrc,
}: {
  school: LetterheadSchool;
  /** URL of the school logo, or null to show a neutral placeholder. */
  logoSrc: string | null;
}) {
  const contacts = [
    school.address && { icon: MapPin, text: school.address },
    school.phone && { icon: Phone, text: school.phone },
    school.contactEmail && { icon: Mail, text: school.contactEmail },
    school.website && { icon: Globe, text: school.website.replace(/^https?:\/\//, "") },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];

  return (
    <header className="flex items-center gap-4 border-b-2 border-foreground/80 pb-3 text-foreground">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md sm:size-20">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- private, session-protected image route
          <img src={logoSrc} alt={`${school.name} logo`} className="size-full object-contain" />
        ) : (
          <span className="flex size-full items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <GraduationCap className="size-7" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-center">
        <p className="text-lg font-bold uppercase tracking-wide sm:text-xl">{school.name}</p>
        {school.motto && <p className="text-sm italic text-muted-foreground">“{school.motto}”</p>}
        {contacts.length > 0 && (
          <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs">
            {contacts.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1">
                <Icon className="size-3" aria-hidden="true" />
                {text}
              </span>
            ))}
          </p>
        )}
        {school.managerName && (
          <p className="text-xs text-muted-foreground">Manager: {school.managerName}</p>
        )}
      </div>
      {/* Balances the logo so the name stays centered. */}
      <div className="hidden size-20 shrink-0 sm:block" aria-hidden="true" />
    </header>
  );
}
