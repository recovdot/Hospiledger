import * as React from "react";

import { Input } from "./input";
import { Label } from "./label";
import { cn } from "@hospiledger/ui/lib/utils";

export function Field({
  label,
  error,
  className,
  inputClassName,
  ...props
}: React.ComponentProps<"input"> & { label: string; error?: string; inputClassName?: string }) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <Input
        className={cn(
          "h-11 rounded-xl border-black/15 px-4 text-base focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] md:text-base",
          error && "border-destructive focus-visible:border-destructive",
          inputClassName,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error && errorId ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldTextarea({
  label,
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; error?: string }) {
  const errorId = props.id ? `${props.id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <textarea
        className={cn(
          "min-h-24 w-full rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
          error && "border-destructive focus-visible:border-destructive",
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error && errorId ? errorId : undefined}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
