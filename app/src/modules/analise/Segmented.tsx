interface SegmentedProps<T extends string> {
  ariaLabel: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Seletor segmentado de período — alvos de toque generosos. */
export function Segmented<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-xl bg-paper-sunken p-1"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] px-3.5 rounded-lg text-sm font-medium transition ${
              active
                ? "bg-paper-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
