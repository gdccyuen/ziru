import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { appMetadata } from "@/lib/app-metadata";
import "./globals.css";

export const metadata: Metadata = appMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        {/* Ziru.1 unified UI uses Bootstrap 5.3. Loads the local copy from
            webui/public/bootstrap/ (fully offline). If those files are not yet
            present, the inline fallback injects the jsDelivr CDN copy instead. */}
        <link rel="stylesheet" href="/bootstrap/bootstrap.min.css" id="ziru-bs-css" />
        <script src="/bootstrap/bootstrap.bundle.min.js" id="ziru-bs-js" />
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "(function(){",
              "  function cssLoaded(){",
              "    try {",
              "      for (var i=0;i<document.styleSheets.length;i++){",
              "        var sh=document.styleSheets[i], href=sh.href||'';",
              "        if (/\\.min\\.css/.test(href) && /bootstrap/i.test(href)){",
              "          return !!(sh.cssRules && sh.cssRules.length>0);",
              "        }",
              "      }",
              "    } catch(e){}",
              "    return false;",
              "  }",
              "  var jsLoaded = !!window.bootstrap;",
              "  if (!cssLoaded()){",
              "    var c=document.createElement('link'); c.rel='stylesheet';",
              "    c.href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css';",
              "    document.head.appendChild(c);",
              "  }",
              "  if (!jsLoaded){",
              "    var s=document.createElement('script');",
              "    s.src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js';",
              "    document.head.appendChild(s);",
              "  }",
              "})();",
            ].join("\n"),
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
