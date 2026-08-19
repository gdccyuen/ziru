import { cn } from "@lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

/**
 * Shared primary button style (shadcn Button, default variant).
 *
 * The console previously used oversized "pill" buttons with heavy purple
 * borders; every primary action now renders the standard shadcn button
 * with a slightly larger font (text-base) and consistent padding.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Back-compat aliases for the removed pill styling.
        "pill-primary": "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        "pill-secondary": "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        mono: "bg-zinc-800 font-mono text-primary-light shadow-sm hover:bg-zinc-700",
        "copy-cli":
          "bg-zinc-800 font-normal text-[#A684FF] shadow-sm hover:bg-zinc-900 hover:font-semibold active:bg-zinc-950 active:font-semibold",
        "copy-code":
          "bg-zinc-800 font-mono-readable font-normal text-[#A684FF] shadow-sm hover:bg-zinc-700 hover:text-[#C4B4FF] active:bg-zinc-600 active:text-[#DDD6FF]",
      },
      size: {
        default: "h-11 px-6 text-base [&_svg]:size-5",
        sm: "h-9 rounded-md px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-8 text-lg [&_svg]:size-5",
        icon: "size-10",
        // Back-compat aliases for the removed pill sizes.
        "pill-md": "h-11 px-6 text-base [&_svg]:size-5",
        "pill-lg": "h-12 px-8 text-lg [&_svg]:size-5",
        "copy-cli": "h-9 w-[72px] px-0 py-2 text-sm",
        "copy-code": "h-9 px-4 py-2 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
