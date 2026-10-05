import Link from 'next/link';
import {
  Activity,
  Boxes,
  FolderGit2,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Settings,
} from 'lucide-react';
import type { AppUser } from '@/app/auth';
import { cn } from '@/lib/utils';

const navigation = [
  { key: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { key: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { key: 'stash', label: 'Project stash', href: '/stash', icon: Boxes },
  { key: 'activity', label: 'Activity', href: '/activity', icon: Activity },
];

export function AppShell({
  children,
  active,
  user,
  projectCount,
}: {
  children: React.ReactNode;
  active: string;
  user: AppUser;
  projectCount?: number;
}) {
  const initials = user.displayName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-sidebar lg:flex lg:flex-col">
        <Link href="/" className="flex h-18 items-center gap-3 border-b border-border px-5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_28px_rgba(77,213,194,.18)]"><Boxes className="size-5" /></div>
          <div><p className="font-semibold tracking-tight">Project Hub</p><p className="text-xs text-muted-foreground">Command center</p></div>
        </Link>
        <nav className="flex-1 space-y-6 px-3 py-5" aria-label="Primary navigation">
          <div className="space-y-1">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
            {navigation.map(({ key, label, href, icon: Icon }) => (
              <Link key={key} className={cn('nav-item', active === key && 'nav-item-active')} href={href}>
                <Icon /> {label}
                {key === 'projects' && typeof projectCount === 'number' ? <span className="ml-auto text-xs text-muted-foreground">{projectCount}</span> : null}
              </Link>
            ))}
          </div>
          <div className="space-y-1">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Connections</p>
            <Link className={cn('nav-item', active === 'integrations' && 'nav-item-active')} href="/integrations"><FolderGit2 /> Integrations</Link>
            <Link className={cn('nav-item', active === 'settings' && 'nav-item-active')} href="/settings"><Settings /> Settings</Link>
          </div>
        </nav>
        <div className="m-3 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold">{initials || 'PH'}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{user.displayName}</p>{user.signOutPath ? <a className="text-[11px] text-muted-foreground hover:text-foreground" href={user.signOutPath}>Sign out</a> : null}</div>
          </div>
        </div>
      </aside>

      <div className="pb-18 lg:pb-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex h-18 items-center gap-3 border-b border-border bg-background/92 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 lg:hidden"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Boxes className="size-5" /></div><span className="hidden font-semibold sm:inline">Project Hub</span></Link>
          <form action="/projects" className="relative ml-auto w-full max-w-md lg:ml-0">
            <label className="sr-only" htmlFor="global-search">Search projects</label>
            <input id="global-search" name="q" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-3 focus:ring-primary/10" placeholder="Search projects, repos, or next actions…" />
          </form>
          <Link href="/projects/new" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"><Plus className="size-4" /><span className="hidden sm:inline">Add project</span></Link>
          <div className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-xs font-semibold">{initials || 'PH'}</div>
        </header>
        {children}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-border bg-sidebar/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
        {navigation.map(({ key, label, href, icon: Icon }) => (
          <Link key={key} href={href} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground', active === key && 'text-primary')}><Icon className="size-4" /><span>{label === 'Project stash' ? 'Stash' : label}</span></Link>
        ))}
      </nav>
    </div>
  );
}
