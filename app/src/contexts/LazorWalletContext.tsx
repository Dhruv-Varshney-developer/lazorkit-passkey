import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWallet } from '@lazorkit/wallet';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { TransactionService } from '../services/TransactionService';

interface LazorWalletContextType {
  publicKey: string | null;
  isConnected: boolean;
  transactionService: TransactionService | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendTransaction: (
    transaction: Transaction, 
    connection: Connection, 
    skipPreflight?: boolean
  ) => Promise<string | null>;
}

const LazorWalletContext = createContext<LazorWalletContextType>({
  publicKey: null,
  isConnected: false,
  transactionService: null,
  connect: async () => {},
  disconnect: () => {},
  sendTransaction: async () => null
});

export const useLazorWallet = () => useContext(LazorWalletContext);

interface LazorWalletProviderProps {
  children: ReactNode;
}

export const LazorWalletContextProvider: React.FC<LazorWalletProviderProps> = ({ children }) => {
  const { 
    publicKey: lazorPublicKey, 
    isConnected: lazorIsConnected, 
    connect: lazorConnect,
    disconnect: lazorDisconnect,
    signTransaction: lazorSignTransaction
  } = useWallet();
  
  const [transactionService, setTransactionService] = useState<TransactionService | null>(null);

  // Update transaction service when wallet state changes
  useEffect(() => {
    if (lazorIsConnected && lazorPublicKey && lazorSignTransaction) {
      // Use default connection for now, this could be passed in as a prop
      const connection = new Connection(
        process.env.REACT_APP_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed'
      );
      
      setTransactionService(new TransactionService({
        connection,
        walletType: 'lazor',
        walletPublicKey: lazorPublicKey,
        signTransaction: lazorSignTransaction
      }));
    } else {
      setTransactionService(null);
    }
  }, [lazorIsConnected, lazorPublicKey, lazorSignTransaction]);

  const sendTransaction = async (
    transaction: Transaction, 
    connection: Connection,
    skipPreflight: boolean = false
  ): Promise<string | null> => {
    if (!transactionService) {
      console.error('Transaction service not initialized');
      return null;
    }
    
    // Create a new transaction service with the provided connection
    const txService = new TransactionService({
      connection,
      walletType: 'lazor',
      walletPublicKey: lazorPublicKey,
      signTransaction: lazorSignTransaction
    });
    
    try {
      return await txService.sendTransaction(transaction, skipPreflight);
    } catch (error) {
      console.error('Failed to send transaction:', error);
      return null;
    }
  };

  const value = {
    publicKey: lazorPublicKey,
    isConnected: lazorIsConnected,
    transactionService,
    connect: lazorConnect,
    disconnect: lazorDisconnect,
    sendTransaction
  };

  return (
    <LazorWalletContext.Provider value={value}>
      {children}
    </LazorWalletContext.Provider>
  );
};