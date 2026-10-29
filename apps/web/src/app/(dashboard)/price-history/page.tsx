'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PriceHistoryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/vendor-history');
  }, [router]);
  return null;
}
