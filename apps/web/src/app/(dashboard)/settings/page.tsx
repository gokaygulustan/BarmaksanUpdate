'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/useAuthStore';
import { Loader2 } from 'lucide-react';

export default function SettingsIndexPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'ADMIN') {
      router.replace('/settings/mail');
      return;
    }
    router.replace('/dashboard');
  }, [user, router]);

  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
