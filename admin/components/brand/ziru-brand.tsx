import { cn } from "@lib/utils";
import Image from "next/image";
import type { JSX } from "react";

type ZiruBrandVariant = "horizontal" | "mark";
type ResolvedZiruBrandTone = "light" | "dark";
type ZiruBrandTone = ResolvedZiruBrandTone | "auto";

type BrandAsset = {
  readonly height: number;
  readonly src: string;
  readonly width: number;
};

type ZiruBrandProps = {
  readonly className?: string;
  readonly imageClassName?: string;
  readonly priority?: boolean;
  readonly sizes?: string;
  readonly tone?: ZiruBrandTone;
  readonly variant?: ZiruBrandVariant;
};

type BrandImageProps = {
  readonly asset: BrandAsset;
  readonly className?: string;
  readonly priority: boolean;
  readonly sizes?: string;
};

const BRAND_ASSETS = {
  horizontal: {
    light: {
      height: 84,
      src: "/images/ziru/logo.png",
      width: 360,
    },
    dark: {
      height: 84,
      src: "/images/ziru/logo-dark.png",
      width: 360,
    },
  },
  mark: {
    light: {
      height: 84,
      src: "/images/ziru/logo-icon.png",
      width: 92,
    },
    dark: {
      height: 84,
      src: "/images/ziru/logo-icon.png",
      width: 92,
    },
  },
} as const satisfies Record<ZiruBrandVariant, Record<ResolvedZiruBrandTone, BrandAsset>>;

function renderBrandImage({ asset, className, priority, sizes }: BrandImageProps): JSX.Element {
  return (
    <Image
      alt="Ziru"
      className={cn("block h-auto w-full object-contain", className)}
      height={asset.height}
      priority={priority}
      sizes={sizes}
      src={asset.src}
      width={asset.width}
    />
  );
}

export const ZiruBrand = ({
  className,
  imageClassName,
  priority = false,
  sizes,
  tone = "light",
  variant = "horizontal",
}: ZiruBrandProps): JSX.Element => {
  if (tone === "auto") {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        {renderBrandImage({
          asset: BRAND_ASSETS[variant].light,
          className: cn("dark:hidden", imageClassName),
          priority,
          sizes,
        })}
        {renderBrandImage({
          asset: BRAND_ASSETS[variant].dark,
          className: cn("hidden dark:block", imageClassName),
          priority,
          sizes,
        })}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {renderBrandImage({
        asset: BRAND_ASSETS[variant][tone],
        className: imageClassName,
        priority,
        sizes,
      })}
    </span>
  );
};
