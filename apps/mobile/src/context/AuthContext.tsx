import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Space } from '@diade/domain';
import {
  getSessionToken,
  setSessionToken,
  getStoredUser,
  setStoredUser,
  getStoredSpace,
  setStoredSpace,
  clearAllSessionData,
} from '../storage/secureStore';
import { apiClient } from '../api/client';
import { resetLocalDb } from '../storage/sqlite';

export interface SpaceMemberSummary {
  userId: string;
  displayName: string;
}

const toMemberSummaries = (
  members: Array<{ user: { id: string; displayName: string } }>,
): SpaceMemberSummary[] => members.map((m) => ({ userId: m.user.id, displayName: m.user.displayName }));

interface AuthContextType {
  user: User | null;
  space: Space | null;
  members: SpaceMemberSummary[];
  isLoading: boolean;
  signInWithToken: (token: string, user: User) => Promise<void>;
  updateSpace: (space: Space) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSpace: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMemberSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize auth state from SecureStore
  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const token = await getSessionToken();
        const storedUser = await getStoredUser();
        const storedSpace = await getStoredSpace();

        if (token && storedUser) {
          setUser(storedUser);
          setSpace(storedSpace);

          // Refresh space from API in background if online
          try {
            const current = await apiClient.getCurrentSpace();
            if (current && current.space) {
              setSpace(current.space);
              setMembers(toMemberSummaries(current.members));
              await setStoredSpace(current.space);
            }
          } catch {
            // Offline fallback to stored space
          }
        }
      } catch (err) {
        console.error('Failed to load auth state:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadStoredAuth();
  }, []);

  const signInWithToken = async (token: string, newUser: User) => {
    await setSessionToken(token);
    await setStoredUser(newUser);
    setUser(newUser);

    // Check if user has an existing space
    try {
      const current = await apiClient.getCurrentSpace();
      if (current && current.space) {
        setSpace(current.space);
        setMembers(toMemberSummaries(current.members));
        await setStoredSpace(current.space);
      }
    } catch {
      // User may not have created or joined a space yet
      setSpace(null);
    }
  };

  const updateSpace = async (newSpace: Space) => {
    await setStoredSpace(newSpace);
    setSpace(newSpace);
  };

  const refreshSpace = async () => {
    try {
      const current = await apiClient.getCurrentSpace();
      if (current && current.space) {
        setSpace(current.space);
        setMembers(toMemberSummaries(current.members));
        await setStoredSpace(current.space);
      }
    } catch (err) {
      console.warn('Could not refresh space:', err);
    }
  };

  const signOut = async () => {
    // Local data is per member: wipe it so the next sign-in on this device starts clean.
    try {
      await resetLocalDb();
    } catch (err) {
      console.warn('Could not clear local data on sign-out:', err);
    }
    await clearAllSessionData();
    setUser(null);
    setSpace(null);
    setMembers([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        space,
        members,
        isLoading,
        signInWithToken,
        updateSpace,
        signOut,
        refreshSpace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
