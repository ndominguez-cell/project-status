'use client';

import { Button } from '@/components/ui/button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main className="grid min-h-screen place-items-center bg-background px-5 text-center"><div><h1 className="text-2xl font-semibold">Project Hub hit a problem</h1><p className="mt-2 text-sm text-muted-foreground">Your data is safe. Try the request again.</p><Button className="mt-5" onClick={reset}>Try again</Button></div></main>; }
