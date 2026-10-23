import type { Metadata, Viewport } from "next";
import { Manrope, Onest } from "next/font/google";
import { AppClerkProvider } from "@/components/auth/app-clerk-provider";
import { APP_CONFIG } from "@/config/app";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800"],
  display: "swap",
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP_CONFIG.name, template: `%s · ${APP_CONFIG.name}` },
  description: "Результаты проектов, KPI и аналитика команды",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${onest.variable} min-h-dvh antialiased`}
      data-theme="light"
      suppressHydrationWarning
    >
      <body className="min-h-dvh font-sans">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <AppClerkProvider>{children}</AppClerkProvider>
      </body>
    </html>
  );
}
