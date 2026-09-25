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
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-sm font-medium text-black">{label}</Label>
      <Input
        className={cn(
          "h-11 rounded-xl border-black/15 px-4 text-base focus-visible:border-black/40 focus-visible:ring-0",
          error && "border-red-500 focus-visible:border-red-500",
          inputClassName,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function FieldTextarea({
  label,
  error,
  className,
  ...props
}: React.ComponentProps<"textarea"> & { label: string; error?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-sm font-medium text-black">{label}</Label>
      <textarea
        className={cn(
          "min-h-24 w-full rounded-xl border border-black/15 bg-transparent px-4 py-3 text-base outline-none transition-colors placeholder:text-[#6c6b6b]/60 focus:border-black/40",
          error && "border-red-500 focus:border-red-500",
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
