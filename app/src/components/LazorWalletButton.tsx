import React from "react";
import { LazorConnect, useWallet } from "@lazorkit/wallet";
import "./LazorWalletButton.css";

export const LazorWalletButton: React.FC = () => {
  const { isConnected, publicKey, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error("Failed to connect Lazor wallet:", error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div className="lazor-wallet-button">
      {!isConnected ? (
        <LazorConnect onConnect={handleConnect} />
      ) : (
        <div className="lazor-connected">
          <div className="lazor-pubkey">
            Connected with Passkey: {publicKey?.slice(0, 4)}...
            {publicKey?.slice(-4)}
          </div>
          <button onClick={handleDisconnect} className="disconnect-button">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};
