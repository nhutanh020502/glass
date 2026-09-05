import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  title: "ORD Studio — Quản lý kho & đơn hàng",
  description: "Quản lý đơn hàng kính, box, tồn kho và giá vốn theo từng lô nhập.",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    title: "ORD Studio — Quản lý kho & đơn hàng",
    description: "Quản lý kính, box, giá vốn và tồn kho theo từng lô nhập.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ORD Studio — Quản lý kho và đơn hàng" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ORD Studio — Quản lý kho & đơn hàng",
    description: "Quản lý kính, box, giá vốn và tồn kho theo từng lô nhập.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
