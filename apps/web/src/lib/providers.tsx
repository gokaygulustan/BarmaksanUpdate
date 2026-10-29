'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        theme="dark"
        visibleToasts={5}
        expand
        gap={10}
        offset={{ top: 88, right: 16 }}
        mobileOffset={{ top: 88, right: 12 }}
        toastOptions={{
          style: {
            background: 'hsl(0 0% 12% / 0.96)',
            border: '1px solid hsl(0 0% 100% / 0.12)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            color: 'hsl(0 0% 98%)',
            padding: '12px 14px',
            borderRadius: '12px',
          },
          className: 'sonner-live-toast',
          classNames: {
            toast: 'sonner-live-toast',
            title: 'text-white font-medium',
            description: 'text-white/75',
            success: 'sonner-live-toast',
            error: 'sonner-live-toast',
            warning: 'sonner-live-toast',
            info: 'sonner-live-toast',
          },
        }}
      />
    </QueryClientProvider>
  );
}
