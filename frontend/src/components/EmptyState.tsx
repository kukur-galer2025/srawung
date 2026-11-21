import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionText, actionHref, onAction }: EmptyStateProps) {
  const btn =
    'inline-flex items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,0.8)] transition hover:bg-blue-800';

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        {icon || <BookOpen className="h-7 w-7 stroke-[1.6]" />}
      </div>
      <h3 className="mb-2 font-display text-xl font-semibold text-slate-900">{title}</h3>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>
      {actionText &&
        (actionHref ? (
          <Link href={actionHref} className={btn}>
            {actionText}
          </Link>
        ) : (
          <button onClick={onAction} className={btn}>
            {actionText}
          </button>
        ))}
    </div>
  );
}
