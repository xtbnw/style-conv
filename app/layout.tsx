import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "写作改写 MVP",
  description: "轻量写作改写工具，支持基础改写、风格画像和映射表增强。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
