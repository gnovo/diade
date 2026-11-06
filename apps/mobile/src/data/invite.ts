/** Where the partner invite stands. Pure, so it can be unit-tested without the app runtime. */
export type InviteState =
  | { kind: 'none' }
  | { kind: 'valid'; code: string; expiresAt: Date | null }
  | { kind: 'expired' };

interface InviteSpace {
  inviteCode?: string | null;
  inviteExpiresAt?: string | null;
}

/** An invite only matters while the space has fewer than two members. */
export function inviteState(space: InviteSpace | null | undefined, memberCount: number, now: Date): InviteState {
  if (!space || memberCount >= 2) return { kind: 'none' };
  const expiresAt = space.inviteExpiresAt ? new Date(space.inviteExpiresAt) : null;
  if (!space.inviteCode || (expiresAt && expiresAt.getTime() <= now.getTime())) return { kind: 'expired' };
  return { kind: 'valid', code: space.inviteCode, expiresAt };
}
