"use client";

import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { hadrian, rubicon } from "../lib/rome";
import { ThemeProvider } from "../components/ThemeProvider";
import { Toaster } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

export const config = createConfig({
  chains: [hadrian, rubicon],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  batch: {
    multicall: true,
  },
  pollingInterval: 12_000,
  transports: {
    [hadrian.id]: http(hadrian.rpcUrls.default.http[0], { batch: { wait: 50 } }),
    [rubicon.id]: http(rubicon.rpcUrls.default.http[0], { batch: { wait: 50 } }),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
