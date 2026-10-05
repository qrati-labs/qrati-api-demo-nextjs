import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Qrati API Demo",
  description: "A live reference app showing the Qrati /v1 REST API end to end — no SDK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col">{children}</body>
    </html>
  );
}
