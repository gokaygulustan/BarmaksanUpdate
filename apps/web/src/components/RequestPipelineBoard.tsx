'use client';

import { PIPELINE_STEPS, pipelineStepState, resolvePipeline } from '@/lib/requestPipeline';
import { cn } from '@/lib/utils';

export function RequestPipelineBoard({
  status,
  procurementStatus,
}: {
  status: string;
  procurementStatus?: string | null;
}) {
  const pipeline = resolvePipeline(status, procurementStatus);
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {PIPELINE_STEPS.map((step, idx) => {
        const state = pipelineStepState(idx, pipeline);
        return (
          <div
            key={step.key}
            className={cn(
              'relative rounded-lg border px-2.5 py-2.5',
              state === 'failed' && 'border-destructive/40 bg-destructive/10',
              state === 'active' && 'border-primary/70 bg-primary/8',
              state === 'done' && 'border-white/10 bg-white/[0.04]',
              state === 'pending' && 'border-white/5 bg-transparent opacity-40'
            )}
          >
            <p className="text-[10px] tabular-nums text-muted-foreground">{String(idx + 1).padStart(2, '0')}</p>
            <p className="mt-1 text-[12px] font-medium leading-snug">
              {state === 'failed' && idx === 1 ? 'Reddedildi' : step.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function RequestPipelineStrip({
  status,
  procurementStatus,
}: {
  status: string;
  procurementStatus?: string | null;
}) {
  const pipeline = resolvePipeline(status, procurementStatus);
  return (
    <div className="flex items-center gap-1" title={pipeline.caption}>
      {PIPELINE_STEPS.map((step, idx) => {
        const state = pipelineStepState(idx, pipeline);
        return (
          <span
            key={step.key}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              state === 'failed' && 'bg-destructive',
              state === 'active' && 'bg-primary',
              state === 'done' && 'bg-primary/55',
              state === 'pending' && 'bg-white/15'
            )}
          />
        );
      })}
    </div>
  );
}
