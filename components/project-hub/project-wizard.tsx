'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CircleCheck, Code2, Rocket } from 'lucide-react';
import { createProject } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_PRIORITIES, PROJECT_STAGES, prettyLabel } from '@/lib/project-hub';
import { cn } from '@/lib/utils';

const steps = [
  { label: 'Define', icon: CircleCheck },
  { label: 'Technology', icon: Code2 },
  { label: 'Connect', icon: Rocket },
];

const inputClass = 'h-10 bg-background/35';

export function ProjectWizard() {
  const [step, setStep] = useState(0);

  return (
    <form action={createProject} className="mx-auto max-w-4xl">
      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Project creation steps">
        {steps.map(({ label, icon: Icon }, index) => (
          <li key={label} className={cn('flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-medium', index === step ? 'border-primary/35 bg-primary/10 text-primary' : index < step ? 'border-emerald-400/20 text-emerald-300' : 'border-border text-muted-foreground')}><Icon className="size-4" /><span>{index + 1}. {label}</span>{index < step ? <Check className="ml-auto size-3.5" /> : null}</li>
        ))}
      </ol>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <section className={step === 0 ? 'space-y-6' : 'hidden'} aria-hidden={step !== 0}>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Project definition</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">What are you building?</h2><p className="mt-1 text-sm text-muted-foreground">Set the purpose and starting point. Everything remains editable.</p></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Project name</Label><Input className={inputClass} id="name" name="name" required placeholder="Project Hub" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="businessObjective">Business objective</Label><Textarea id="businessObjective" name="businessObjective" required rows={3} placeholder="What outcome should this project create?" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="businessPurpose">Problem being solved / target user</Label><Textarea id="businessPurpose" name="businessPurpose" rows={3} placeholder="Who is this for, and what friction does it remove?" /></div>
            <div className="space-y-2"><Label htmlFor="category">Project type</Label><NativeSelect className="w-full" id="category" name="category" defaultValue="Internal tool"><NativeSelectOption>AI application</NativeSelectOption><NativeSelectOption>Automation</NativeSelectOption><NativeSelectOption>Internal tool</NativeSelectOption><NativeSelectOption>Lead generation</NativeSelectOption><NativeSelectOption>Data scraper</NativeSelectOption><NativeSelectOption>Estimator</NativeSelectOption><NativeSelectOption>Website</NativeSelectOption><NativeSelectOption>SaaS</NativeSelectOption><NativeSelectOption>Experiment</NativeSelectOption></NativeSelect></div>
            <div className="space-y-2"><Label htmlFor="priority">Priority</Label><NativeSelect className="w-full" id="priority" name="priority" defaultValue="MEDIUM">{PROJECT_PRIORITIES.map((value) => <NativeSelectOption key={value} value={value}>{prettyLabel(value)}</NativeSelectOption>)}</NativeSelect></div>
            <div className="space-y-2"><Label htmlFor="stage">Starting stage</Label><NativeSelect className="w-full" id="stage" name="stage" defaultValue="PLANNING">{PROJECT_STAGES.slice(0, 6).map((value) => <NativeSelectOption key={value} value={value}>{prettyLabel(value)}</NativeSelectOption>)}</NativeSelect></div>
            <div className="space-y-2"><Label htmlFor="nextAction">First next action</Label><Input className={inputClass} id="nextAction" name="nextAction" placeholder="Define the MVP scope" /></div>
          </div>
        </section>

        <section className={step === 1 ? 'space-y-6' : 'hidden'} aria-hidden={step !== 1}>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Technology</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose the working stack.</h2><p className="mt-1 text-sm text-muted-foreground">Use a preset or type any custom provider.</p></div>
          <datalist id="ai-providers"><option>OpenAI</option><option>ChatGPT</option><option>Codex</option><option>Claude</option><option>Gemini</option><option>Google AI Studio</option><option>Google Antigravity</option></datalist>
          <datalist id="databases"><option>Supabase PostgreSQL</option><option>PostgreSQL</option><option>Firebase</option><option>SQLite</option><option>MongoDB</option><option>Cloudflare D1</option><option>None</option></datalist>
          <datalist id="environments"><option>Codex</option><option>VS Code</option><option>Cursor</option><option>Replit</option><option>Google AI Studio</option><option>Google Antigravity</option></datalist>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="developmentEnvironment">Development environment</Label><Input className={inputClass} id="developmentEnvironment" name="developmentEnvironment" list="environments" placeholder="Codex + VS Code" /></div>
            <div className="space-y-2"><Label htmlFor="aiProvider">AI provider</Label><Input className={inputClass} id="aiProvider" name="aiProvider" list="ai-providers" placeholder="OpenAI" /></div>
            <div className="space-y-2"><Label htmlFor="frontend">Frontend</Label><Input className={inputClass} id="frontend" name="frontend" placeholder="Next.js + TypeScript" /></div>
            <div className="space-y-2"><Label htmlFor="backend">Backend</Label><Input className={inputClass} id="backend" name="backend" placeholder="Next.js Server Actions" /></div>
            <div className="space-y-2"><Label htmlFor="databaseProvider">Database</Label><Input className={inputClass} id="databaseProvider" name="databaseProvider" list="databases" placeholder="Supabase PostgreSQL" /></div>
            <div className="space-y-2"><Label htmlFor="authentication">Authentication</Label><Input className={inputClass} id="authentication" name="authentication" placeholder="Supabase Auth" /></div>
            <div className="space-y-2"><Label htmlFor="storage">Storage</Label><Input className={inputClass} id="storage" name="storage" placeholder="Supabase Storage / R2 / none" /></div>
          </div>
        </section>

        <section className={step === 2 ? 'space-y-6' : 'hidden'} aria-hidden={step !== 2}>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Repository & deployment</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">Connect the delivery path.</h2><p className="mt-1 text-sm text-muted-foreground">Repository sync arrives in Phase 2; Phase 1 saves the source-of-truth links.</p></div>
          <datalist id="deployment-providers"><option>Vercel</option><option>Netlify</option><option>Railway</option><option>Google Cloud Run</option><option>AWS</option><option>Azure</option><option>Render</option><option>Supabase</option><option>Cloudflare</option><option>Local Docker</option></datalist>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="repositoryFullName">GitHub repository</Label><Input className={inputClass} id="repositoryFullName" name="repositoryFullName" placeholder="owner/repository or leave blank" /></div>
            <div className="space-y-2"><Label htmlFor="repositoryUrl">Repository URL</Label><Input className={inputClass} id="repositoryUrl" name="repositoryUrl" type="url" placeholder="https://github.com/owner/repository" /></div>
            <div className="space-y-2"><Label htmlFor="defaultBranch">Default branch</Label><Input className={inputClass} id="defaultBranch" name="defaultBranch" defaultValue="main" /></div>
            <div className="space-y-2"><Label htmlFor="activeBranch">Active branch</Label><Input className={inputClass} id="activeBranch" name="activeBranch" placeholder="develop or feature/my-work" /></div>
            <div className="space-y-2"><Label htmlFor="repositoryVisibility">Visibility</Label><NativeSelect className="w-full" id="repositoryVisibility" name="repositoryVisibility" defaultValue="PRIVATE"><NativeSelectOption value="PRIVATE">Private</NativeSelectOption><NativeSelectOption value="PUBLIC">Public</NativeSelectOption><NativeSelectOption value="INTERNAL">Internal</NativeSelectOption></NativeSelect></div>
            <div className="space-y-2"><Label htmlFor="deploymentProvider">Deployment provider</Label><Input className={inputClass} id="deploymentProvider" name="deploymentProvider" list="deployment-providers" placeholder="Vercel" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="productionUrl">Production URL</Label><Input className={inputClass} id="productionUrl" name="productionUrl" type="url" placeholder="https://project.example.com" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="requiredApis">Required APIs</Label><Input className={inputClass} id="requiredApis" name="requiredApis" placeholder="OpenAI, MarketCheck, Resend (comma-separated)" /><p className="text-xs text-muted-foreground">Only provider names and expected secret names are stored—never secret values.</p></div>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary/[.06] p-4 text-sm"><p className="font-medium text-primary">Ready to generate</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Project Hub will add the full 52-item launch checklist and calculate progress from completed work.</p></div>
        </section>

        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft /> Back</Button>
          {step < 2 ? <Button type="button" onClick={() => setStep((value) => Math.min(2, value + 1))}>Continue <ArrowRight /></Button> : <Button type="submit">Create project <Check /></Button>}
        </div>
      </div>
    </form>
  );
}
