import Image from "next/image";

const LOGO_MARK = {
  height: 84,
  width: 92,
} as const;

type WebUILogoMarkProps = {
  width: number;
  className?: string;
};

export function WebUILogoMark({ width, className }: WebUILogoMarkProps) {
  const height = width * (LOGO_MARK.height / LOGO_MARK.width);

  return (
    <Image
      src="/images/ziru/logo-icon.png"
      alt=""
      aria-hidden
      className={className}
      width={width}
      height={height}
      style={{ height: "auto" }}
    />
  );
}
