import Link from 'next/link';
import { ArrowLeft, FolderSearch } from 'lucide-react';

export default function NotFound() { return <main className="grid min-h-screen place-items-center bg-background px-5 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><FolderSearch /></div><h1 className="mt-4 text-2xl font-semibold">Project not found</h1><p className="mt-2 text-sm text-muted-foreground">It may have been archived, deleted, or belongs to a different account.</p><Link href="/projects" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary"><ArrowLeft className="size-4" /> Back to projects</Link></div></main>; }
