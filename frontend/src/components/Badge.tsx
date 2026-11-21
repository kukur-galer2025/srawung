import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'amber';
  className?: string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const VARIANTS = {
  default: { box: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  success: { box: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  warning: { box: 'bg-amber-50 text-amber-800 ring-jade-200', dot: 'bg-jade-500' },
  danger: { box: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  info: { box: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  purple: { box: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500' },
  amber: { box: 'bg-jade-400 text-amber-950 ring-jade-500', dot: 'bg-amber-900' },
};

export function Badge({ children, variant = 'default', className = '', size = 'sm', dot = false }: BadgeProps) {
  const v = VARIANTS[variant];
  const sizing = size === 'sm' ? 'text-xs px-2.5 py-0.5' : 'text-sm px-3 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${v.box} ${sizing} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  );
}
