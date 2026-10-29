import { tabMeta } from '@/lib/tabMetadata';

export const metadata = tabMeta('Kullanıcılar');

export default function PageTabLayout({ children }: { children: React.ReactNode }) {
  return children;
}
