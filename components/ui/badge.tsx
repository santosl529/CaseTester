import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Pills in the homepage's style. A rating's colours (Matt, 7 Nov): Strong in
// Mastery green, Adequate in Sky, Needs work in Cobalt.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-ink text-white",
        secondary: "bg-sky text-ink",
        destructive: "bg-alert/10 text-alert",
        outline: "border-ink/20 text-ink",
        ghost: "text-ink/75",
        link: "text-ink underline underline-offset-4",
        strong: "bg-mastery text-ink",
        adequate: "bg-sky text-ink",
        needsWork: "bg-cobalt text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
