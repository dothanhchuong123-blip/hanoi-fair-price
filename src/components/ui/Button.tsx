import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'brand' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const sizeClasses =
      size === 'sm'
        ? 'h-[36px] px-4 text-[14px]'
        : 'h-[52px] px-6 text-[16px]';

    const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
      primary:
        'bg-ink text-white hover:bg-ink/90 active:scale-[0.99]',
      brand:
        'bg-brand text-white hover:bg-brand/90 active:scale-[0.99]',
      secondary:
        'bg-surface-2 text-ink hover:bg-surface-3 active:scale-[0.99]',
      ghost:
        'bg-transparent text-ink hover:bg-surface-2 active:scale-[0.99]',
    };

    return (
      <button
        ref={ref}
        type="button"
        className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 cursor-pointer whitespace-nowrap select-none disabled:opacity-50 disabled:pointer-events-none ${sizeClasses} ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
