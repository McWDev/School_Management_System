import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

/** Sidebar + top bar + main content. Used by the (dashboard) route group layout. */
export function AppShell({
  permissions,
  account,
  children,
}: {
  permissions?: readonly string[];
  /** Account menu slot for the top bar (streams in after the session is read). */
  account?: React.ReactNode;
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
      <AppSidebar permissions={permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar permissions={permissions} account={account} />
        <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
