import { Footer } from "@app/_(landing)/_components/footer";
import { Navbar } from "@app/_(landing)/_components/navbar";
import { ScrollProgressBar } from "@app/_(landing)/_components/scroll-progress-bar";
import type { Metadata } from "next";
import { ZiruOpenClawPluginPage } from "@/app/_(landing)/claw/_components/ziru-openclaw-plugin-page";

const pageLinks = [
  { label: "Overview", href: "#plugin-overview" },
  { label: "Workflow", href: "#workflow" },
  { label: "Integration", href: "#integration" },
  { label: "Docs", href: "https://docs.ziru.app/" },
];

export const metadata: Metadata = {
  title: "Ziru OpenClaw Plugin | Ground OpenClaw With Ziru API",
  description:
    "Install the Ziru OpenClaw plugin to turn complex documents into browse-first, citation-ready context inside OpenClaw.",
  alternates: {
    canonical: "/claw",
  },
  openGraph: {
    title: "Ziru OpenClaw Plugin",
    description:
      "Ground OpenClaw with Ziru result packages, browse-first retrieval, and citation-ready document context.",
    url: "https://ziru.com/claw",
    siteName: "Ziru",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ziru OpenClaw Plugin",
    description:
      "Install the Ziru OpenClaw plugin to give OpenClaw agents browse-first document grounding.",
  },
};

export default function ZiruOpenClawPluginRoute() {
  return (
    <div className="flex flex-col gap-0">
      <ScrollProgressBar />
      <Navbar customLinks={pageLinks} />
      <main className="min-h-screen">
        <ZiruOpenClawPluginPage />
      </main>
      <Footer />
    </div>
  );
}
