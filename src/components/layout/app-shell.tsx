import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

/** Sidebar + top bar + main content. Used by the (dashboard) route group layout. */
export function AppShell({
  permissions,
  account,
  contextLabel,
  children,
}: {
  permissions?: readonly string[];
  /** Account menu slot for the top bar (streams in after the session is read). */
  account?: React.ReactNode;
  /** Current school name (or "Platform administration"), shown in the top bar. */
  contextLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="no-print contents">
        <AppSidebar permissions={permissions} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="no-print contents">
          <TopBar permissions={permissions} account={account} contextLabel={contextLabel} />
        </div>
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
