'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExecutiveApprovalInbox } from '../inbox-view';
import { useAuthStore } from '@/stores/useAuthStore';

const canOpenManagerInbox = (user: {
  role?: string;
  moduleId?: string;
  subRole?: string;
} | null) =>
  user?.role === 'ADMIN' ||
  (user?.role === 'PURCHASING' && user.moduleId === 'SATIN_ALMA' && user.subRole === 'MANAGER');

export default function ManagerUnderLimitInboxPage() {
  const router = useRouter();
  const { user, isAuthenticated, isTokenExpired } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated || isTokenExpired()) {
      router.replace('/login');
      return;
    }
    if (!canOpenManagerInbox(user)) {
      router.replace('/dashboard');
    }
  }, [ready, isAuthenticated, isTokenExpired, user, router]);

  if (!ready || !isAuthenticated || !canOpenManagerInbox(user)) return null;
  return <ExecutiveApprovalInbox mode="manager" />;
}
