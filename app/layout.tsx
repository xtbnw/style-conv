import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "写作改写工具",
  description: "轻量写作改写工具，支持基础改写、语料风格和映射增强。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
