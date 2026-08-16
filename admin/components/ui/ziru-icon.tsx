import { cn } from "@lib/utils";
import type { ComponentProps, CSSProperties } from "react";

export const ZIRU_ICON_NAMES = [
  "info",
  "theme-dark",
  "menu",
  "theme-light",
  "arrow-outward",
  "check",
  "check-2",
  "check-pix",
  "draft",
  "document-scanner",
  "handyman",
  "docs",
  "api",
  "json",
  "light",
  "card",
  "right",
  "download",
  "doc",
  "tools",
  "pixel-check",
  "mind",
  "model-6",
  "model-5",
  "model-4",
  "model-3",
  "model-2",
  "model-1",
  "state-x",
  "component",
  "search",
  "ai",
  "chevron-down",
] as const;

export type ZiruIconName = (typeof ZIRU_ICON_NAMES)[number];

export const ZIRU_REGULAR_ICON_NAMES: ZiruIconName[] = [
  "info",
  "theme-dark",
  "menu",
  "theme-light",
  "arrow-outward",
  "check",
  "draft",
  "document-scanner",
  "handyman",
];

export const ZIRU_PIXEL_ICON_NAMES: ZiruIconName[] = [
  "docs",
  "api",
  "json",
  "light",
  "card",
  "right",
  "download",
  "doc",
  "tools",
  "pixel-check",
  "mind",
];

export const ZIRU_MODEL_ICON_NAMES: ZiruIconName[] = [
  "model-6",
  "model-5",
  "model-4",
  "model-3",
  "model-2",
  "model-1",
];

export const ZIRU_STATE_ICON_NAMES: ZiruIconName[] = ["check", "state-x", "component"];

export const ZIRU_MESSAGE_ICON_NAMES: ZiruIconName[] = ["search", "ai"];

const iconAssetMap: Record<ZiruIconName, string> = {
  info: "/icons/ziru/info.svg",
  "theme-dark": "/icons/ziru/theme-dark.svg",
  menu: "/icons/ziru/menu.svg",
  "theme-light": "/icons/ziru/theme-light.svg",
  "arrow-outward": "/icons/ziru/arrow-outward.svg",
  check: "/icons/ziru/check.svg",
  draft: "/icons/ziru/draft.svg",
  "document-scanner": "/icons/ziru/document-scanner.svg",
  handyman: "/icons/ziru/handyman.svg",
  docs: "/icons/ziru/docs.svg",
  api: "/icons/ziru/api.svg",
  json: "/icons/ziru/json.svg",
  light: "/icons/ziru/light.svg",
  card: "/icons/ziru/card.svg",
  right: "/icons/ziru/right.svg",
  download: "/icons/ziru/download.svg",
  doc: "/icons/ziru/doc.svg",
  tools: "/icons/ziru/tools.svg",
  "pixel-check": "/icons/ziru/pixel-check.svg",
  "check-2": "/icons/ziru/check 2.svg",
  "check-pix": "/icons/ziru/check-pix.svg",
  mind: "/icons/ziru/mind.svg",
  "model-6": "/icons/ziru/model-6.svg",
  "model-5": "/icons/ziru/model-5.svg",
  "model-4": "/icons/ziru/model-4.svg",
  "model-3": "/icons/ziru/model-3.svg",
  "model-2": "/icons/ziru/model-2.svg",
  "model-1": "/icons/ziru/model-1.svg",
  "state-x": "/icons/ziru/state-x.svg",
  component: "/icons/ziru/component.svg",
  search: "/icons/ziru/search.svg",
  ai: "/icons/ziru/ai.svg",
  "chevron-down": "/icons/ziru/chevron-down.svg",
};

export type ZiruIconProps = Omit<ComponentProps<"span">, "children"> & {
  name: ZiruIconName;
};

export const ZiruIcon = ({ className, name, style, ...props }: ZiruIconProps) => {
  const iconStyle: CSSProperties = {
    backgroundColor: "currentColor",
    WebkitMaskImage: `url("${iconAssetMap[name]}")`,
    maskImage: `url("${iconAssetMap[name]}")`,
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    ...style,
  };

  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-5 shrink-0 align-middle", className)}
      style={iconStyle}
      {...props}
    />
  );
};
