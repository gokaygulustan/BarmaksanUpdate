'use client';

import { use } from 'react';
import { ExecutiveApprovalInbox } from '../inbox-view';

export default function ExecutiveApprovalInboxPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <ExecutiveApprovalInbox mode="executive" token={token} />;
}
