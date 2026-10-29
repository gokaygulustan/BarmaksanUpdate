'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  BackArrowIcon,
  CheckDrawIcon,
  GoArrowIcon,
  PeekEyeIcon,
  SpinnerIcon,
  StaffBadgeIcon,
  UnitBuildingIcon,
} from '@/components/login/LoginIcons';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/useAuthStore';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DocumentTitle } from '@/components/DocumentTitle';

const loginSchema = z.object({
  email: z.string().email('Lütfen geçerli bir e-posta adresi girin'),
  password: z.string().min(1, 'Şifre zorunludur'),
});

type LoginFormData = z.infer<typeof loginSchema>;
type Door = 'staff' | 'department';

const COMPANY_DOMAIN = 'ugurpromilling.com';
const OTP_RESEND_SEC = 3 * 60;

function normalizeDeptEmail(raw: string) {
  let email = raw.trim().toLowerCase();
  if (!email) return email;
  if (!email.includes('@')) return `${email}@${COMPANY_DOMAIN}`;
  if (email.endsWith('@ugurpromilling')) return `${email}.com`;
  return email;
}

function isCompanyDeptEmail(email: string) {
  const domain = String(email || '')
    .trim()
    .toLowerCase()
    .split('@')[1] || '';
  return domain === COMPANY_DOMAIN;
}

function formatMmSs(totalSec: number) {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resendStorageKey(email: string) {
  return `otp-resend-until:${email}`;
}

function OtpBoxes({
  value,
  onChange,
  disabled,
  phase = 'input',
  onCelebrateDone,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  phase?: 'input' | 'eating' | 'success';
  onCelebrateDone?: () => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const celebrateDoneRef = useRef(onCelebrateDone);
  celebrateDoneRef.current = onCelebrateDone;
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');

  const focusAt = (index: number) => {
    refs.current[Math.max(0, Math.min(5, index))]?.focus();
  };

  useEffect(() => {
    if (phase === 'input') refs.current[0]?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'eating') return;
    const done = window.setTimeout(() => {
      celebrateDoneRef.current?.();
    }, 4600);
    return () => window.clearTimeout(done);
  }, [phase]);

  const commit = (next: string, focusIndex: number) => {
    onChange(next.replace(/\D/g, '').slice(0, 6));
    focusAt(focusIndex);
  };

  const celebrating = phase === 'eating' || phase === 'success';

  return (
    <div
      className={cn(
        'otp-stage relative mx-auto w-fit',
        phase === 'eating' && 'otp-celebrate',
        phase === 'success' && 'otp-celebrate otp-celebrate-done',
      )}
    >
      {/* Pac her zaman DOM’da; layout zıplamasın — yalnız celebrate’de görünür */}
      <span
        aria-hidden
        className={cn('otp-pac', !celebrating && 'invisible pointer-events-none opacity-0')}
      >
        <CheckDrawIcon className="otp-pac-check" />
      </span>
      <p className={cn('otp-success-label', !celebrating && 'invisible')}>Giriş başarılı</p>

      <div
        className="otp-cells flex justify-center gap-2"
        onPaste={(e) => {
          if (celebrating) return;
          const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
          if (!text) return;
          e.preventDefault();
          commit(text, Math.min(text.length, 5));
        }}
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            name={index === 0 ? 'one-time-code' : undefined}
            maxLength={1}
            value={digit}
            disabled={disabled || celebrating}
            aria-label={`Kod ${index + 1}. hane`}
            className={cn(
              'otp-cell h-14 w-11 rounded-[12px] border border-white/10 bg-white/[0.04] text-center font-mono text-[22px] font-medium text-white outline-none transition-[border-color,box-shadow,background-color,transform] duration-200 hover:border-white/20 focus:-translate-y-0.5 focus:border-primary/60 focus:bg-white/[0.07] focus:ring-4 focus:ring-primary/10 disabled:opacity-50',
              digit && 'border-white/25 bg-white/[0.07]',
              celebrating && 'disabled:opacity-100',
            )}
            onChange={(e) => {
              const char = e.target.value.replace(/\D/g, '').slice(-1);
              const slots = Array.from({ length: 6 }, (_, i) => value[i] || '');
              slots[index] = char;
              commit(slots.join(''), char ? index + 1 : index);
            }}
            onKeyDown={(e) => {
              if (celebrating) return;
              if (e.key === 'Backspace') {
                e.preventDefault();
                const slots = Array.from({ length: 6 }, (_, i) => value[i] || '');
                if (slots[index]) {
                  slots[index] = '';
                  commit(slots.join(''), index);
                } else {
                  commit(value.slice(0, Math.max(0, index - 1)) + value.slice(index), index - 1);
                }
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                focusAt(index - 1);
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                focusAt(index + 1);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { setToken, isAuthenticated, user } = useAuthStore();
  const [door, setDoor] = useState<Door>('staff');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deptEmail, setDeptEmail] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptStep, setDeptStep] = useState<'email' | 'code'>('email');
  const [otpPhase, setOtpPhase] = useState<'input' | 'eating' | 'success'>('input');
  const pendingDeptTokenRef = useRef<string | null>(null);
  const [linkLogin, setLinkLogin] = useState(false);
  const [resendUntil, setResendUntil] = useState(0);
  const [resetStep, setResetStep] = useState<null | 'email' | 'code'>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextPasswordAgain, setNextPasswordAgain] = useState('');
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [resetResendUntil, setResetResendUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const otpCelebrating = otpPhase !== 'input';

  useEffect(() => {
    if (!isAuthenticated) return;
    // Birim kapısından gelenler (OTP) Taleplerim’e; şifre kapısı panele.
    if (door === 'department' || user?.role === 'DEPARTMENT') {
      router.replace('/taleplerim');
      return;
    }
    router.replace('/dashboard');
  }, [isAuthenticated, user?.role, door, router]);

  useEffect(() => {
    const email = normalizeDeptEmail(deptEmail);
    if (!email) return;
    try {
      const until = Number(sessionStorage.getItem(resendStorageKey(email)) || 0);
      if (until > Date.now()) {
        setResendUntil(until);
        setNow(Date.now());
      }
    } catch {
      /* ignore */
    }
  }, [deptEmail]);

  useEffect(() => {
    const until = Math.max(resendUntil, resetResendUntil);
    if (!until || until <= Date.now()) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [resendUntil, resetResendUntil]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('giris');
    if (!token || isAuthenticated) return;
    let cancelled = false;
    setDoor('department');
    setLinkLogin(true);
    setIsLoading(true);
    (async () => {
      try {
        const { data } = await authApi.verifyOtpLink(token);
        if (cancelled) return;
        setToken(data.token);
        toast.success('Giriş başarılı');
        router.replace('/taleplerim');
      } catch (error: unknown) {
        if (cancelled) return;
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Giriş bağlantısı geçersiz veya süresi doldu.';
        toast.error(message);
        window.history.replaceState({}, '', '/login');
        setLinkLogin(false);
        setDeptStep('email');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router, setToken]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const openReset = () => {
    setResetEmail(getValues('email') || '');
    setResetCode('');
    setNextPassword('');
    setNextPasswordAgain('');
    setShowNextPassword(false);
    setResetStep('email');
  };

  const requestResetCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const email = resetEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      toast.error('Geçerli bir e-posta girin.');
      return;
    }
    if (resetStep === 'code' && Date.now() < resetResendUntil) {
      toast.error(
        `Yeni kod için ${formatMmSs(Math.ceil((resetResendUntil - Date.now()) / 1000))} bekleyin.`,
      );
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await authApi.forgotPassword(email);
      const seconds = Number(data?.resendInSec) || OTP_RESEND_SEC;
      setResetResendUntil(Date.now() + seconds * 1000);
      setNow(Date.now());
      setResetEmail(email);
      setResetStep('code');
      toast.success('Kod gönderildiyse e-postanıza bakın.');
    } catch (error: unknown) {
      const body = (error as { response?: { data?: { message?: string; retryAfterSec?: number } } })
        ?.response?.data;
      if (body?.retryAfterSec) {
        setResetResendUntil(Date.now() + Number(body.retryAfterSec) * 1000);
        setNow(Date.now());
        setResetEmail(email);
        setResetStep('code');
      }
      toast.error(body?.message || 'Kod gönderilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (resetCode.length !== 6) {
      toast.error('6 haneli kodu girin.');
      return;
    }
    if (nextPassword.length < 8) {
      toast.error('Yeni şifre en az 8 karakter olmalıdır.');
      return;
    }
    if (nextPassword !== nextPasswordAgain) {
      toast.error('Şifreler aynı değil.');
      return;
    }
    setIsLoading(true);
    try {
      await authApi.resetPassword({
        email: resetEmail,
        code: resetCode,
        password: nextPassword,
      });
      toast.success('Şifreniz güncellendi. Yeni şifrenizle giriş yapın.');
      setResetStep(null);
      setResetCode('');
      setNextPassword('');
      setNextPasswordAgain('');
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Şifre güncellenemedi.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const response = await authApi.login(data);
      const { token } = response.data;
      setToken(token);
      toast.success('Tekrar hoş geldiniz!', { description: 'Giriş başarılı.' });
      router.push('/dashboard');
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.';
      toast.error('Giriş başarısız', { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const startResendWait = (email: string, seconds = OTP_RESEND_SEC) => {
    const until = Date.now() + Math.max(1, seconds) * 1000;
    setResendUntil(until);
    setNow(Date.now());
    try {
      sessionStorage.setItem(resendStorageKey(email), String(until));
    } catch {
      /* ignore */
    }
  };

  const requestCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const email = normalizeDeptEmail(deptEmail);
    if (!email) {
      toast.error('E-posta adresi gerekli.');
      return;
    }
    if (!isCompanyDeptEmail(email)) {
      toast.error(`Yalnızca @${COMPANY_DOMAIN} e-postaları ile giriş yapılabilir.`);
      return;
    }
    if (Date.now() < resendUntil) {
      toast.error(`Yeni kod için ${formatMmSs(Math.ceil((resendUntil - Date.now()) / 1000))} bekleyin.`);
      setDeptStep('code');
      return;
    }
    setDeptEmail(email);
    setDeptCode('');
    setOtpPhase('input');
    pendingDeptTokenRef.current = null;
    setIsLoading(true);
    try {
      const { data } = await authApi.requestOtp(email);
      const wait = Number(data?.resendInSec) > 0 ? Number(data.resendInSec) : OTP_RESEND_SEC;
      startResendWait(email, wait);
      setDeptStep('code');
      toast.success('Kod gönderildi', { description: `${email} adresini kontrol edin.` });
    } catch (error: unknown) {
      const payload = (error as { response?: { data?: { message?: string; retryAfterSec?: number }; status?: number } })
        ?.response;
      const message = payload?.data?.message || 'Kod gönderilemedi.';
      toast.error(message);
      if (payload?.status === 429) {
        startResendWait(email, Number(payload.data?.retryAfterSec) || OTP_RESEND_SEC);
        setDeptStep('code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const finishDeptLoginAfterCelebrate = () => {
    setOtpPhase('success');
    window.setTimeout(() => {
      const token = pendingDeptTokenRef.current;
      if (!token) return;
      pendingDeptTokenRef.current = null;
      setToken(token);
      router.replace('/taleplerim');
    }, 850);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCelebrating) return;
    const email = normalizeDeptEmail(deptEmail);
    if (!isCompanyDeptEmail(email)) {
      toast.error(`Yalnızca @${COMPANY_DOMAIN} e-postaları ile giriş yapılabilir.`);
      setDeptStep('email');
      return;
    }
    const code = deptCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      toast.error('6 haneli kodu girin.');
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await authApi.verifyOtp({ email, code });
      pendingDeptTokenRef.current = data.token;
      setIsLoading(false);
      setOtpPhase('eating');
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Kod doğrulanamadı.';
      toast.error(message);
      setDeptCode('');
      setOtpPhase('input');
      pendingDeptTokenRef.current = null;
      setIsLoading(false);
    }
  };

  const fieldClass =
    'h-[46px] rounded-[12px] border-white/10 bg-white/[0.035] px-4 text-[15px] text-white placeholder:text-white/30 hover:border-white/20 focus-visible:border-primary/60 focus-visible:bg-white/[0.06] focus-visible:ring-4 focus-visible:ring-primary/10 md:text-[15px]';
  const labelClass = 'text-[13px] font-medium text-white/60';
  const submitClass =
    'press group/submit relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-primary text-[15px] font-medium tracking-[-0.005em] text-[#141416] transition-[background-color,transform,opacity] duration-200 hover:bg-[#e4c43c] disabled:pointer-events-none disabled:opacity-45';
  const quietLink =
    'text-[13px] font-medium text-white/50 underline decoration-white/0 underline-offset-4 transition-[color,text-decoration-color] duration-200 hover:text-white hover:decoration-white/40 disabled:pointer-events-none disabled:opacity-40';

  const submitLabel = (text: string, busy: boolean, busyText?: string) =>
    busy ? (
      <>
        <SpinnerIcon className="h-[18px] w-[18px]" />
        {busyText ? <span>{busyText}</span> : null}
      </>
    ) : (
      <>
        <span className="roll">
          <span>{text}</span>
          <span aria-hidden>{text}</span>
        </span>
        <GoArrowIcon className="h-[18px] w-[18px]" />
      </>
    );

  const heading =
    resetStep === 'code' ? 'Yeni şifre' : resetStep === 'email' ? 'Şifremi unuttum' : 'Tedarik Portalı';
  const lead =
    resetStep === 'code'
      ? 'E-postadaki kodu yazıp yeni şifrenizi belirleyin.'
      : resetStep === 'email'
        ? 'Hesabınıza kayıtlı adrese 6 haneli kod gider.'
        : 'Hangi kapıdan gireceğinizi seçin.';

  return (
    <div className="login-screen grid h-dvh overflow-hidden bg-chrome text-white lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
      <DocumentTitle topic="Giriş" />

      {/* ── Marka bölmesi: fotoğraf, düz karartma (gradient yok), logo ve tek cümle ── */}
      <section className="login-brand relative m-3 hidden overflow-hidden rounded-[24px] bg-[#111113] lg:flex lg:flex-col lg:justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/factory2.JPG" alt="" aria-hidden className="login-photo absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[#0b0b0c]/60" aria-hidden />

        <div className="relative flex items-start justify-between p-9 xl:p-11">
          <a
            href="https://www.ugurpromilling.com"
            target="_blank"
            rel="noopener noreferrer"
            className="login-fade-down block transition-opacity duration-300 hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Uğur Promilling" className="h-10 w-auto object-contain xl:h-11" />
          </a>
        </div>

        <div className="relative p-9 xl:p-11">
          <h2 className="max-w-[520px] text-[40px] font-medium leading-[1.06] tracking-[-0.035em] text-white xl:text-[48px]">
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="login-line block" style={{ animationDelay: '260ms' }}>
                Tedariğin her adımında
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="login-line block text-white/55" style={{ animationDelay: '380ms' }}>
                yanınızdayız.
              </span>
            </span>
          </h2>
          <div className="login-fade-up mt-9 flex items-end justify-between gap-6 border-t border-white/15 pt-5" style={{ animationDelay: '620ms' }}>
            <div className="flex flex-col gap-1">
              <p className="text-[10.5px] font-medium tracking-[0.08em] text-white/45">POWERED BY</p>
              <a
                href="https://www.ugurpromilling.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block opacity-90 transition-[opacity,transform] duration-300 hover:-translate-y-0.5 hover:opacity-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo2.png" alt="Sub Brand Logo" className="h-9 w-auto object-contain" />
              </a>
            </div>
            <p className="text-[12px] text-white/45">© {new Date().getFullYear()} Tüm Hakları Saklıdır.</p>
          </div>
        </div>
      </section>

      {/* ── Form bölmesi ── */}
      <section className="relative flex min-h-0 flex-col px-5 py-5 sm:px-10 [@media(max-height:700px)]:py-3">
        {/* Telefonda marka bölmesi yok: logo üstte. */}
        <div className="flex items-center justify-between lg:invisible">
          <a href="https://www.ugurpromilling.com" target="_blank" rel="noopener noreferrer" className="login-fade-down block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Main Logo" className="h-9 w-auto object-contain" />
          </a>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center py-4 [@media(max-height:700px)]:py-2">
          <div className="w-full max-w-[380px]">
            <div className="mb-7 [@media(max-height:760px)]:mb-5">
              {resetStep ? (
                <button
                  type="button"
                  onClick={() => setResetStep(null)}
                  className="login-fade-up group/back mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/50 transition-colors hover:text-white"
                >
                  <BackArrowIcon className="h-4 w-4 transition-transform duration-300 group-hover/back:-translate-x-0.5" />
                  Girişe dön
                </button>
              ) : null}
              <h1 className="overflow-hidden text-[30px] font-medium leading-[1.12] tracking-[-0.03em] [@media(max-height:700px)]:text-[26px]">
                <span key={heading} className="login-line block" style={{ animationDelay: '120ms' }}>
                  {heading}
                </span>
              </h1>
              <p key={lead} className="login-fade-up mt-2 text-[15px] leading-relaxed text-white/50" style={{ animationDelay: '220ms' }}>
                {lead}
              </p>
            </div>

            {resetStep ? null : (
              <div
                role="tablist"
                aria-label="Giriş kapısı"
                className="login-fade-up relative mb-7 grid grid-cols-2 rounded-full bg-white/[0.045] p-1 ring-1 ring-inset ring-white/[0.06] [@media(max-height:760px)]:mb-5"
                style={{ animationDelay: '300ms' }}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-[#2c2c31] shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.07)] transition-transform duration-[560ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]"
                  style={{ transform: door === 'department' ? 'translateX(100%)' : 'translateX(0)' }}
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={door === 'staff'}
                  onClick={() => {
                    setDoor('staff');
                    setResetStep(null);
                  }}
                  className={cn(
                    'relative z-[1] flex h-10 items-center justify-center gap-2 rounded-full text-[13.5px] font-medium transition-colors duration-300',
                    door === 'staff' ? 'text-brand-ink' : 'text-white/45 hover:text-white/80',
                  )}
                >
                  <StaffBadgeIcon active={door === 'staff'} className="h-[17px] w-[17px]" />
                  Yetkili girişi
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={door === 'department'}
                  onClick={() => {
                    setDoor('department');
                    setDeptStep('email');
                    setDeptCode('');
                    setOtpPhase('input');
                    pendingDeptTokenRef.current = null;
                  }}
                  className={cn(
                    'relative z-[1] flex h-10 items-center justify-center gap-2 rounded-full text-[13.5px] font-medium transition-colors duration-300',
                    door === 'department' ? 'text-brand-ink' : 'text-white/45 hover:text-white/80',
                  )}
                >
                  <UnitBuildingIcon active={door === 'department'} className="h-[17px] w-[17px]" />
                  Birim girişi
                </button>
              </div>
            )}

            {linkLogin ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <SpinnerIcon className="h-7 w-7 text-primary" />
                <p className="text-sm text-white/50">Tek kullanımlık giriş bağlantısı doğrulanıyor…</p>
              </div>
            ) : door === 'staff' && resetStep === 'email' ? (
              <form key="reset-email" autoComplete="on" onSubmit={requestResetCode} className="stagger flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reset-email" className={labelClass}>
                    E-posta adresi
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="ornek@sirket.com"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    className={fieldClass}
                    disabled={isLoading}
                  />
                </div>
                <button type="submit" className={submitClass} disabled={isLoading || !resetEmail.trim()}>
                  {submitLabel('Kodu gönder', isLoading)}
                </button>
              </form>
            ) : door === 'staff' && resetStep === 'code' ? (
              <form key="reset-code" autoComplete="off" onSubmit={submitNewPassword} className="stagger flex flex-col gap-4">
                <p className="text-[13.5px] leading-relaxed text-white/50">
                  Kod <span className="font-medium text-white">{resetEmail}</span> adresine gönderildiyse buraya yazın.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="reset-code" className={labelClass}>
                    6 haneli kod
                  </Label>
                  <Input
                    id="reset-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={resetCode}
                    onChange={(event) => setResetCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={cn(fieldClass, 'text-center font-mono tracking-[0.5em]')}
                    disabled={isLoading}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="next-password" className={labelClass}>
                      Yeni şifre
                    </Label>
                    <div className="relative">
                      <Input
                        id="next-password"
                        type={showNextPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={nextPassword}
                        onChange={(event) => setNextPassword(event.target.value)}
                        className={cn(fieldClass, 'pr-11')}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNextPassword((value) => !value)}
                        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[9px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                        tabIndex={-1}
                        aria-label={showNextPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      >
                        <PeekEyeIcon open={showNextPassword} className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="next-password-again" className={labelClass}>
                      Tekrar
                    </Label>
                    <Input
                      id="next-password-again"
                      type={showNextPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={nextPasswordAgain}
                      onChange={(event) => setNextPasswordAgain(event.target.value)}
                      className={fieldClass}
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <button type="submit" className={cn(submitClass, 'mt-1')} disabled={isLoading || resetCode.length !== 6}>
                  {submitLabel('Şifreyi kaydet', isLoading)}
                </button>
                <div className="flex items-center justify-center gap-5">
                  <button
                    type="button"
                    className={quietLink}
                    disabled={isLoading || now < resetResendUntil}
                    onClick={() => requestResetCode()}
                  >
                    {now < resetResendUntil
                      ? `Tekrar gönder (${formatMmSs(Math.ceil((resetResendUntil - now) / 1000))})`
                      : 'Tekrar gönder'}
                  </button>
                  <span className="h-3 w-px bg-white/15" aria-hidden />
                  <button
                    type="button"
                    className={quietLink}
                    onClick={() => {
                      setResetStep('email');
                      setResetCode('');
                    }}
                  >
                    E-postayı değiştir
                  </button>
                </div>
              </form>
            ) : door === 'staff' ? (
              <form id="login-form" key="staff-login" onSubmit={handleSubmit(onSubmit)} className="stagger flex flex-col gap-4" autoComplete="on">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email" className={labelClass}>
                    E-posta adresi
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ornek@sirket.com"
                    autoComplete="email"
                    {...register('email')}
                    aria-invalid={errors.email ? true : undefined}
                    className={fieldClass}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-[12.5px] text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password" className={labelClass}>
                      Şifre
                    </Label>
                    <button type="button" className={quietLink} onClick={openReset}>
                      Şifremi unuttum
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...register('password')}
                      aria-invalid={errors.password ? true : undefined}
                      className={cn(fieldClass, 'pr-12')}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-[10px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      <PeekEyeIcon open={showPassword} className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[12.5px] text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <button id="login-submit-btn" type="submit" className={cn(submitClass, 'mt-2')} disabled={isLoading}>
                  {submitLabel('Giriş yap', isLoading, 'Giriş yapılıyor…')}
                </button>
              </form>
            ) : deptStep === 'email' ? (
              <form key="dept-email" autoComplete="off" onSubmit={requestCode} className="stagger flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="dept-email" className={labelClass}>
                    E-posta adresi
                  </Label>
                  <Input
                    id="dept-email"
                    name="dept-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={deptEmail}
                    onChange={(e) => setDeptEmail(e.target.value)}
                    placeholder="ad.soyad@ugurpromilling.com"
                    className={fieldClass}
                    disabled={isLoading}
                  />
                  {deptEmail.includes('@') && !isCompanyDeptEmail(normalizeDeptEmail(deptEmail)) ? (
                    <p className="text-[12.5px] text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                      Bu kapı yalnızca @{COMPANY_DOMAIN} e-postalarını kabul eder.
                    </p>
                  ) : (
                    <p className="text-[12.5px] text-white/40">
                      Yalnızca <span className="text-white/70">@{COMPANY_DOMAIN}</span> adresi ile giriş yapılır.
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className={cn(submitClass, 'mt-2')}
                  disabled={
                    isLoading ||
                    !deptEmail.trim() ||
                    (deptEmail.includes('@') && !isCompanyDeptEmail(normalizeDeptEmail(deptEmail)))
                  }
                >
                  {submitLabel('Doğrulama kodunu gönder', isLoading)}
                </button>
              </form>
            ) : (
              <form key="dept-code" autoComplete="off" onSubmit={verifyCode} className="stagger flex flex-col gap-4">
                <p className={cn('text-center text-[13.5px] leading-relaxed text-white/50', otpCelebrating && 'invisible')}>
                  6 haneli kod <span className="font-medium text-white">{deptEmail}</span> adresine gönderildi.
                </p>
                <div className="flex flex-col gap-3">
                  <Label className={cn('block text-center', labelClass, otpCelebrating && 'invisible')}>
                    E-postadaki kod
                  </Label>
                  <OtpBoxes
                    value={deptCode}
                    onChange={setDeptCode}
                    disabled={isLoading || otpCelebrating}
                    phase={otpPhase}
                    onCelebrateDone={finishDeptLoginAfterCelebrate}
                  />
                </div>
                <div className={cn('flex flex-col gap-4', otpCelebrating && 'invisible pointer-events-none')}>
                  <button
                    type="submit"
                    className={submitClass}
                    disabled={isLoading || deptCode.length !== 6 || otpCelebrating}
                  >
                    {submitLabel('Giriş yap', isLoading)}
                  </button>
                  <div className="flex items-center justify-center gap-5">
                    <button
                      type="button"
                      className={quietLink}
                      disabled={isLoading || now < resendUntil || otpCelebrating}
                      onClick={() => requestCode()}
                    >
                      {now < resendUntil
                        ? `Tekrar gönder (${formatMmSs(Math.ceil((resendUntil - now) / 1000))})`
                        : 'Tekrar gönder'}
                    </button>
                    <span className="h-3 w-px bg-white/15" aria-hidden />
                    <button
                      type="button"
                      className={quietLink}
                      disabled={otpCelebrating}
                      onClick={() => {
                        setDeptStep('email');
                        setDeptCode('');
                        setOtpPhase('input');
                        pendingDeptTokenRef.current = null;
                      }}
                    >
                      E-postayı değiştir
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Telefonda alt bilgi (masaüstünde marka bölmesinde). */}
        <div className="flex items-center justify-between gap-4 lg:hidden">
          <p className="text-[11.5px] text-white/35">© {new Date().getFullYear()} Tüm Hakları Saklıdır.</p>
          <a href="https://www.ugurpromilling.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 opacity-70 transition-opacity hover:opacity-100">
            <span className="text-[10px] font-medium tracking-[0.08em] text-white/45">POWERED BY</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo2.png" alt="Sub Brand Logo" className="h-6 w-auto object-contain" />
          </a>
        </div>
      </section>
    </div>
  );
}
