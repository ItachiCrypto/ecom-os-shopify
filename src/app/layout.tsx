import type { Metadata } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import Shell from "@/components/Shell";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "EcomOS - Shopify Dashboard",
  description: "All-in-one dashboard for your Shopify store",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${outfit.variable} ${jetbrainsMono.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
