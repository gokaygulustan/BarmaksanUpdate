'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Satın alma birim talebi taleplerim/yeni formundan açılır. */
export default function NewInternalRequestPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/taleplerim/yeni');
  }, [router]);
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
