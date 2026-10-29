'use client';

import { useEffect } from 'react';
import { pageTitle } from '@/lib/brand';

/** İstemci sayfalarında sekme başlığını mail kalıbıyla günceller. */
export function DocumentTitle({ topic, detail }: { topic: string; detail?: string | null }) {
  useEffect(() => {
    document.title = pageTitle(topic, detail);
  }, [topic, detail]);
  return null;
}
