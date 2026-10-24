import React from 'react';

export interface SheetProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'bg';
  showGrabber?: boolean;
}

export const Sheet: React.FC<SheetProps> = ({
  variant = 'surface',
  showGrabber = true,
  className = '',
  children,
  ...props
}) => {
  const bgClass = variant === 'bg' ? 'bg-bg' : 'bg-surface';

  return (
    <div
      className={`w-full ${bgClass} rounded-t-[28px] pt-3 pb-5 px-5 shadow-[0_-12px_40px_rgba(0,0,0,0.28)] z-30 animate-sheet-up ${className}`}
      {...props}
    >
      {showGrabber && (
        <div
          aria-hidden="true"
          className="w-10 h-1.5 rounded-full bg-grabber mx-auto mb-3.5"
        />
      )}
      {children}
    </div>
  );
};
