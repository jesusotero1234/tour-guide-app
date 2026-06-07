import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-darkBrown">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full rounded-lg border bg-surface-elevated px-4 py-3 text-darkBrown shadow-sm
            focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent
            disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted
            placeholder:text-ink-muted/80
            ${error ? 'border-danger' : 'border-darkBrown/20'}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
