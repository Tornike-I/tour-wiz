import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
      <header className="bg-brand px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">Tour Wiz</h1>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
