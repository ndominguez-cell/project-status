'use client';

import { Trash2 } from 'lucide-react';
import { deleteProject } from '@/app/actions';
import { Button } from '@/components/ui/button';

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  return (
    <form action={deleteProject} onSubmit={(event) => { if (!window.confirm(`Permanently delete ${projectName}? This cannot be undone.`)) event.preventDefault(); }}>
      <input type="hidden" name="projectId" value={projectId} />
      <Button type="submit" variant="destructive"><Trash2 /> Delete project</Button>
    </form>
  );
}
