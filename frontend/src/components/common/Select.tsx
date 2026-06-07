import { SelectHTMLAttributes, forwardRef } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="mb-1 block text-sm font-medium text-darkBrown">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`
            w-full rounded-lg border bg-surface-elevated px-4 py-3 text-darkBrown shadow-sm
            focus:outline-none focus:ring-2 focus:ring-accent/60 focus:border-accent
            disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-muted
            ${error ? 'border-danger' : 'border-darkBrown/20'}
            ${className}
          `}
          {...props}
        >
          <option value="">Select an option</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
