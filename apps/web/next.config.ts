import type { NextConfig } from 'next';

/** Paylaşımlı hosting (cPanel) tek çekirdekte derler; VDS imajı NEXT_BUILD_CPUS ile bütün çekirdekleri açar. */
const buildCpus = Math.max(1, Number(process.env.NEXT_BUILD_CPUS) || 1);

const nextConfig = {
  /** Tester deploy'u yerelde ayrı klasöre derlenir (NEXT_DIST_DIR=.next-deploy); dev sunucusunun .next'ine dokunmaz. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  /** Üretimde console.log temizlenir (hata ve uyarılar kalır); geliştirmede hiçbir şey değişmez. */
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  async redirects() {
    return [
      { source: '/birim/login', destination: '/login', permanent: false },
      { source: '/birim', destination: '/taleplerim', permanent: false },
      { source: '/birim/:path*', destination: '/taleplerim/:path*', permanent: false },
      { source: '/users', destination: '/settings/users', permanent: false },
    ];
  },
  /**
   * Geliştirmede /api aynı kökenden API'ye geçer. Ağdaki başka bir cihazdan (telefon) açılınca
   * tarayıcı API'yi localhost:4000'de değil bu sunucunun /api yolunda arıyor (lib/api.ts);
   * üretimde bu işi server.js yapıyor.
   */
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    const api = (process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:4000').replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    /** Paylaşımlı hosting: paralel derleme / worker limiti */
    cpus: buildCpus,
    workerThreads: false,
  },
  webpack: (config) => {
    if (buildCpus === 1) (config as { parallelism?: number }).parallelism = 1;
    return config;
  },
} as NextConfig;

export default nextConfig;
