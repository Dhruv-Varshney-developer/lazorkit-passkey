import {
  Transaction,
  PublicKey,
  Connection,
  Commitment,
} from "@solana/web3.js";

type WalletType = "lazor";

interface TransactionServiceOptions {
  connection: Connection;
  walletType: WalletType;
  walletPublicKey: PublicKey | string | null;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
}

export class TransactionService {
  private connection: Connection;
  private walletType: WalletType;
  private walletPublicKey: PublicKey | null;
  private signTransaction?: (transaction: Transaction) => Promise<Transaction>;

  constructor(options: TransactionServiceOptions) {
    this.connection = options.connection;
    this.walletType = options.walletType;
    this.walletPublicKey = options.walletPublicKey
      ? typeof options.walletPublicKey === "string"
        ? new PublicKey(options.walletPublicKey)
        : options.walletPublicKey
      : null;
    this.signTransaction = options.signTransaction;
  }

  async sendTransaction(
    transaction: Transaction,
    skipPreflight: boolean = false,
    commitment: Commitment = "processed"
  ): Promise<string | null> {
    if (!this.walletPublicKey || !this.signTransaction) {
      console.error("Wallet not connected or missing sign transaction method");
      return null;
    }

    try {
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();

      // Set transaction properties
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.walletPublicKey;

      // Sign transaction with wallet
      const signedTransaction = await this.signTransaction(transaction);

      // Send raw transaction
      const signature = await this.connection.sendRawTransaction(
        signedTransaction.serialize(),
        { skipPreflight }
      );

      // Confirm transaction
      await this.connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature,
        },
        commitment
      );

      return signature;
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  }
}
