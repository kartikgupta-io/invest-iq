import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// A cohesive three-role type system: geometric display, calm UI, exact numerals.
// Space Grotesk gives headings a distinctive technical character; Plus Jakarta
// Sans stays readable at dense UI sizes; JetBrains Mono keeps figures aligned.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "InvestIQ AI — Institutional-grade Financial Intelligence",
    template: "%s · InvestIQ AI",
  },
  description:
    "InvestIQ AI ingests official filings from SEC EDGAR, NSE, and BSE into a unified intelligence platform with premium analytics, AI semantic research, and citation-backed insights.",
  applicationName: "InvestIQ AI",
  keywords: ["investiq", "financial analytics", "SEC EDGAR", "NSE", "BSE", "stock research", "AI finance"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}