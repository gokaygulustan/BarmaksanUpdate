'use client';

import { Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import RfqPage from '@/app/(dashboard)/procurement/new/page';
import { useAuthStore } from '@/stores/useAuthStore';
import api from '@/lib/api';

const vendors = [
  { id: 'v1', name: 'Atlas Endüstriyel', categories: ['Rulman', 'Güç aktarımı'], contactEmail: 'teklif@atlas.example', contactPhone: '5321112233', city: 'Ankara', address: 'İvedik OSB, Ankara', taxId: '0000000001', moduleId: 'URETIM_PLANLAMA' },
  { id: 'v2', name: 'Kuzey Metal', categories: ['Paslanmaz çelik', 'Sac'], contactEmail: 'satis@kuzey.example', city: 'Konya', address: 'Organize Sanayi, Konya', moduleId: 'URETIM_PLANLAMA' },
  { id: 'v3', name: 'Marmara Teknik', categories: ['Motor', 'Redüktör'], contactEmail: 'bilgi@marmara.example', city: 'İstanbul', address: 'Tuzla, İstanbul', moduleId: 'URETIM_PLANLAMA', contacts: [{ name: 'Yetkili', email: 'ek@marmara.example' }] },
];

function Fixture() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }));
  const [captured, setCaptured] = useState('');
  const moduleId = params.get('module') || 'URETIM_PLANLAMA';
  const staff = params.has('staff');
  const mobile = params.has('mobile');
  useEffect(() => {
    if (mobile) return;
    const previous = api.defaults.adapter;
    const previousStorage = useAuthStore.persist.getOptions().storage;
    const previousUser = useAuthStore.getState().user;
    useAuthStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    useAuthStore.setState({ user: { id: 'fixture', name: 'Önizleme', email: 'preview@example.test', role: 'PURCHASING', subRole: staff ? 'STAFF' : 'MANAGER', moduleId } });
    api.defaults.adapter = async config => {
      const url = config.url || '';
      let data: unknown = [];
      if (url === '/vendors') data = vendors;
      if (url === '/units') data = [{ id: 'u1', name: 'Adet', isSystem: true }, { id: 'u2', name: 'Kg', isSystem: true }];
      if (url === '/departments') data = [{ id: 'd1', name: config.params?.collarType === 'BLUE_COLLAR' ? 'Montaj' : 'Planlama' }];
      if (url === '/org-workers') data = [{ id: 'w1', firstName: 'Örnek', lastName: 'Usta', departmentId: 'd1' }];
      if (url === '/projects') data = [{ id: 'p1', name: 'Genel', isDefault: true }, { id: 'p2', code: 'P-026', name: 'Değirmen hattı' }];
      if (url === '/notification-cc-contacts') data = [{ id: 'cc1', name: 'Proje sorumlusu', email: 'proje@example.test' }];
      if (url === '/procurement/settings/excel-import') data = { URETIM_PLANLAMA: true, SATIN_ALMA: true, YEDEK_PARCA: true };
      if (url === '/procurement/sample') data = {
        id: 'sample', title: 'Değirmen hattı bakım malzemeleri', moduleId, status: params.has('sent') ? 'SENT_TO_VENDOR' : 'DRAFT',
        description: 'Teslimat fabrika adresine yapılacaktır. Teknik eşdeğer ürün teklif edilebilir.', internalNote: 'Bakım planına göre birlikte teslim alınacak.',
        projectId: 'p2', assignments: [{ vendorId: 'v1' }, { vendorId: 'v2' }], deadline: new Date(Date.now() + 15 * 86400000).toISOString(),
        items: [
          { id: 'i1', productName: 'Rulman 6205-2RS', quantity: 12, unit: 'Adet', stockCode: 'RUL-6205', serialNumber: '1', notes: 'Çift tarafı kapalı, yüksek devir uyumlu', category: '' },
          { id: 'i2', productName: 'Paslanmaz sac 2 mm', quantity: 250, unit: 'Kg', stockCode: 'SAC-002', serialNumber: '2', tonnageInfo: '0,25', notes: '', category: '' },
        ], attachments: [],
      };
      if (config.method !== 'get') {
        setCaptured(JSON.stringify({ url, method: config.method, data: config.data instanceof FormData ? Object.fromEntries(config.data.entries()) : JSON.parse(config.data || '{}') }));
        return new Promise(() => {});
      }
      return { status: 200, statusText: 'OK', data, headers: {}, config };
    };
    setReady(true);
    return () => {
      api.defaults.adapter = previous;
      useAuthStore.setState({ user: previousUser });
      useAuthStore.persist.setOptions({ storage: previousStorage });
    };
  }, [client, moduleId, staff, params, mobile]);

  if (mobile) return <iframe title="Mobil form" src={`/rfq-check-temp?module=${moduleId}&edit=sample`} style={{ width: 390, height: 844, border: 0 }} />;
  if (!ready) return <p>Önizleme hazırlanıyor</p>;
  return <QueryClientProvider client={client}>
    <main className="min-h-screen bg-background p-3 sm:p-6 lg:p-7"><RfqPage /></main>
    {captured && <pre id="captured-payload" className="fixed inset-x-0 bottom-0 z-[100] max-h-48 overflow-auto bg-black p-4 text-xs text-white">{captured}</pre>}
  </QueryClientProvider>;
}

export default function CheckPage() {
  return <Suspense><Fixture /></Suspense>;
}
