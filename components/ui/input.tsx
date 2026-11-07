import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-field border border-ink/20 bg-white px-3 py-1 text-base text-ink transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink/60 hover:border-ink/35 focus-visible:border-cobalt disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-ink/5 disabled:opacity-60 aria-invalid:border-alert motion-reduce:transition-none md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
