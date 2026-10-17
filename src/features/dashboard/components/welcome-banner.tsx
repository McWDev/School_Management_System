import { GraduationCap } from "lucide-react";

/** Greeting for the hour of day in the school's time zone. */
function greetingFor(timezone: string, now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone }).format(
      now,
    ),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function WelcomeBanner({
  userName,
  schoolName,
  motto,
  logoSrc,
  timezone,
  heroValue,
  heroLabel,
}: {
  userName: string;
  schoolName: string;
  motto?: string | null;
  logoSrc?: string | null;
  timezone: string;
  /** The one headline figure of the dashboard (optional). */
  heroValue?: number;
  heroLabel?: string;
}) {
  const now = new Date();
  const firstName = userName.split(" ")[0];
  const today = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(now);

  return (
    <section
      aria-label="Welcome"
      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[oklch(0.5_0.17_262)] to-[oklch(0.38_0.15_272)] p-5 text-white shadow-card sm:p-7"
    >
      {/* Soft decorative shapes (no data). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-white/10"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-24 size-48 rounded-full bg-white/5"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 shadow-sm sm:size-16">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, session-protected logo route
              <img
                src={logoSrc}
                alt={`${schoolName} logo`}
                className="size-full object-contain p-1"
              />
            ) : (
              <GraduationCap className="size-7 text-primary" aria-hidden="true" />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm text-white/80">{today}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greetingFor(timezone, now)}, {firstName}
            </h1>
            <p className="truncate text-sm text-white/85">
              {schoolName}
              {motto && <span className="italic text-white/70"> · “{motto}”</span>}
            </p>
          </div>
        </div>

        {heroValue !== undefined && heroLabel && (
          <div className="flex flex-col sm:items-end">
            <span className="text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
              {heroValue.toLocaleString("en-GB")}
            </span>
            <span className="mt-1 text-sm text-white/80">{heroLabel}</span>
          </div>
        )}
      </div>
    </section>
  );
}
