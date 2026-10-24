import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'surface' | 'brand' | 'glass';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    const variantClasses: Record<NonNullable<IconButtonProps['variant']>, string> = {
      default: 'bg-surface-2 text-ink hover:bg-surface-3',
      surface: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-2xs',
      brand: 'bg-brand text-white hover:bg-brand/90 shadow-xs',
      glass: 'glass-surface text-white hover:bg-white/15',
    };

    return (
      <button
        ref={ref}
        type="button"
        className={`w-[44px] h-[44px] rounded-full inline-flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer active:scale-95 select-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
