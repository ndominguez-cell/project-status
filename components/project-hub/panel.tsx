import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="border-0 bg-card shadow-none ring-border">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

export function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <dt className="label-mini">{label}</dt>
      <dd className="mt-2 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' | 'ok' }) {
  const styles = { info: 'border-primary/15 bg-primary/[.06]', ok: 'border-emerald-400/20 bg-emerald-400/[.06]', error: 'border-red-400/20 bg-red-400/[.06]' };
  return <div className={`mt-5 rounded-xl border p-4 text-xs leading-6 text-muted-foreground ${styles[tone]}`}>{children}</div>;
}
