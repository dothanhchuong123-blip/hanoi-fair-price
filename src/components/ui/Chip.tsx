import React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'active' | 'brand' | 'glass';
  as?: 'button' | 'span' | 'div';
  type?: 'button' | 'submit';
  disabled?: boolean;
}

export const Chip: React.FC<ChipProps> = ({
  variant = 'default',
  as: Component = 'span',
  className = '',
  children,
  ...props
}) => {
  const variantClasses: Record<NonNullable<ChipProps['variant']>, string> = {
    default: 'bg-surface-2 text-ink border border-transparent hover:bg-surface-3',
    active: 'bg-ink text-white border border-ink',
    brand: 'bg-brand-soft text-brand border border-brand/15',
    glass: 'glass-surface text-white/95',
  };

  const interactiveClasses =
    Component === 'button'
      ? 'cursor-pointer active:scale-[0.98] transition-all duration-150'
      : '';

  return (
    <Component
      type={Component === 'button' ? 'button' : undefined}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap select-none ${variantClasses[variant]} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
};
