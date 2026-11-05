import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Yield Port — Lending Yield on Rome EVM with Atomic Solana Settlement",
  description: "Deposit USDC on Rome EVM, earn Aave v3 lending yield, and settle atomically on Solana via Rome Cross-Program Invocation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased selection:bg-amber-500 selection:text-slate-950 font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
