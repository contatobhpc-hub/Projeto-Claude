import { type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="stagger mb-8 grid grid-cols-1 gap-4 border-b border-border/60 pb-6 sm:mb-10 sm:flex sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(1.4rem,2.4vw,2rem)] font-semibold leading-tight tracking-[-0.03em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="stagger rounded-2xl border border-dashed border-border bg-surface/40 px-6 py-20 text-center backdrop-blur-sm">
      <div
        className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground shadow-[var(--shadow-glow)]"
        style={{ backgroundImage: "var(--gradient-primary)" }}
      >
        <span className="text-sm font-semibold">+</span>
      </div>
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

