import type { Metadata } from "next";

export const appMetadata: Metadata = {
  title: "Ziru WebUI",
  description:
    "Upload documents, explore parsed content, and ask questions about your knowledge.",
  icons: {
    icon: [
      {
        url: "/images/ziru/logo-icon.png",
        type: "image/png",
        sizes: "92x84",
      },
    ],
  },
};
