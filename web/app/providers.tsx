"use client";

import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http, injected } from "wagmi";
import { hadrian, rubicon } from "../lib/rome";

const queryClient = new QueryClient();

export const config = createConfig({
  chains: [hadrian, rubicon],
  connectors: [injected()],
  transports: {
    [hadrian.id]: http(),
    [rubicon.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
