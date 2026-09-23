import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateProgress, recommendedNextAction, slugify, type ChecklistItemRecord, type ProjectRecord } from '../lib/project-hub';

const now = new Date('2026-09-10T12:00:00Z');

function item(category: string, label: string, completed: boolean, sortOrder: number): ChecklistItemRecord {
  return { id: String(sortOrder), projectId: 'p1', category, label, completed, sortOrder, completedAt: completed ? now : null, createdAt: now, updatedAt: now };
}

test('calculates overall and category progress from checklist completion', () => {
  const progress = calculateProgress([
    item('Planning', 'Define scope', true, 0),
    item('Planning', 'Identify user', false, 1),
    item('Testing', 'Test workflow', true, 2),
  ]);
  assert.equal(progress.Planning, 50);
  assert.equal(progress.Testing, 100);
  assert.equal(progress.Overall, 67);
});

test('manual next action takes precedence over checklist recommendation', () => {
  const project = { nextAction: 'Ship the preview' } as ProjectRecord;
  assert.equal(recommendedNextAction(project, [item('Planning', 'Define scope', false, 0)]), 'Ship the preview');
});

test('first incomplete checklist item becomes the recommendation', () => {
  const project = { nextAction: null } as ProjectRecord;
  const items = [item('Planning', 'Already done', true, 0), item('Planning', 'Define scope', false, 1)];
  assert.equal(recommendedNextAction(project, items), 'Define scope');
});

test('slugs are stable and URL safe', () => {
  assert.equal(slugify('  NGU Bid Platform / 2026  '), 'ngu-bid-platform-2026');
});
