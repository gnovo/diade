import { describe, expect, it } from 'vitest';
import { canAccessRecord, isTaskAssignedToUser } from './index';

describe('Domain Permission & Assignment Helpers', () => {
  it('allows access to shared records regardless of user', () => {
    const sharedRecord = { visibility: 'shared' as const, creatorId: 'user-1' };
    expect(canAccessRecord(sharedRecord, 'user-1')).toBe(true);
    expect(canAccessRecord(sharedRecord, 'user-2')).toBe(true);
  });

  it('restricts personal records strictly to the creator', () => {
    const personalRecord = { visibility: 'personal' as const, creatorId: 'user-1' };
    expect(canAccessRecord(personalRecord, 'user-1')).toBe(true);
    expect(canAccessRecord(personalRecord, 'user-2')).toBe(false);
  });

  it('correctly handles task assignment (both members vs specific user)', () => {
    const taskBoth = { assigneeId: null };
    expect(isTaskAssignedToUser(taskBoth, 'user-1')).toBe(true);
    expect(isTaskAssignedToUser(taskBoth, 'user-2')).toBe(true);

    const taskUser1 = { assigneeId: 'user-1' };
    expect(isTaskAssignedToUser(taskUser1, 'user-1')).toBe(true);
    expect(isTaskAssignedToUser(taskUser1, 'user-2')).toBe(false);
  });
});
