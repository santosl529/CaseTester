import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// CasePace's controls (app/brand.css, the homepage's): primary is a solid
// Cobalt pill, secondary (outline) an outlined Ink pill; focus is the
// site-wide Cobalt outline.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 select-none motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-alert [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-transparent bg-cobalt text-white hover:bg-ink",
        outline: "border-ink bg-transparent text-ink hover:border-cobalt hover:text-cobalt aria-expanded:border-cobalt aria-expanded:text-cobalt",
        secondary: "border-transparent bg-sky text-ink hover:bg-[color-mix(in_srgb,var(--sky),var(--ink)_6%)]",
        ghost: "border-transparent text-ink/75 hover:bg-ink/5 hover:text-ink aria-expanded:bg-ink/5",
        destructive: "border-alert/40 bg-transparent text-alert hover:bg-alert/5",
        link: "h-auto! rounded-none border-transparent px-0! text-ink underline decoration-1 underline-offset-[0.25em] hover:text-cobalt",
      },
      size: {
        default: "h-10 px-5 text-sm",
        xs: "h-7 px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 px-4 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-7 text-[length:var(--t-body)]",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
