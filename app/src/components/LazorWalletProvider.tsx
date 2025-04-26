import React, { ReactNode } from "react";
import { LazorConnect } from "@lazorkit/wallet";
import { Buffer } from "buffer";

// Ensure Buffer is available globally for browser environments
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

interface LazorWalletProviderProps {
  children: ReactNode;
}

export const LazorWalletProvider: React.FC<LazorWalletProviderProps> = ({
  children,
}) => {
  return <LazorConnect>{children}</LazorConnect>;
};
