import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "./components/Button";
import Square from "./components/Square";
import Alert from "./components/Alert";
import { LazorWalletButton } from "./components/LazorWalletButton";
import { useLazorWallet } from "./contexts/LazorWalletContext";
import { Program, Provider } from "@coral-xyz/anchor";
import { SimpleProvider } from "./components/Wallet";
import {
  AccountInfo,
  Commitment,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const COUNTER_PDA_SEED = "test-pda";
const COUNTER_PROGRAM = new PublicKey(
  "6W6pzBTRn49rn2adaZ9QGcnB627iJtWM2huvXc8RcThB"
);

const App: React.FC = () => {
  // Use Lazorkit context instead of Solana wallet adapter
  const { publicKey, isConnected, sendTransaction } = useLazorWallet();

  // Set up connections
  const connectionRef = useRef<Connection>(
    new Connection(
      process.env.REACT_APP_SOLANA_RPC_URL || "https://api.devnet.solana.com"
    )
  );
  const connection = connectionRef.current;
  const ephemeralConnection = useRef<Connection | null>(null);
  const provider = useRef<Provider>(new SimpleProvider(connection));

  // Keep original refs and state for the counter functionality
  const tempKeypair = useRef<Keypair | null>(null);
  const [counter, setCounter] = useState<number>(1);
  const [ephemeralCounter, setEphemeralCounter] = useState<number>(1);
  const [isDelegated, setIsDelegated] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState<string | null>(
    null
  );
  const counterProgramClient = useRef<Program | null>(null);
  const [counterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(COUNTER_PDA_SEED)],
    COUNTER_PROGRAM
  );
  let counterSubscriptionId = useRef<number | null>(null);
  let ephemeralCounterSubscriptionId = useRef<number | null>(null);

  // Helpers to fetch IDL and initialize program client
  const getProgramClient = useCallback(
    async (program: PublicKey): Promise<Program> => {
      const idl = await Program.fetchIdl(program, provider.current);
      if (!idl) throw new Error("IDL not found");
      return new Program(idl, provider.current);
    },
    [provider]
  );

  // Define callbacks to handle account changes
  const handleCounterChange = useCallback(
    (accountInfo: AccountInfo<Buffer>) => {
      if (!counterProgramClient.current) return;
      const decodedData = counterProgramClient.current.coder.accounts.decode(
        "counter",
        accountInfo.data
      );
      setIsDelegated(
        !accountInfo.owner.equals(counterProgramClient.current.programId)
      );
      setCounter(Number(decodedData.count));
    },
    []
  );

  const handleEphemeralCounterChange = useCallback(
    (accountInfo: AccountInfo<Buffer>) => {
      if (!counterProgramClient.current) return;
      const decodedData = counterProgramClient.current.coder.accounts.decode(
        "counter",
        accountInfo.data
      );
      setEphemeralCounter(Number(decodedData.count));
    },
    []
  );

  // Subscribe to counter updates
  const subscribeToCounter = useCallback(async (): Promise<void> => {
    if (counterSubscriptionId && counterSubscriptionId.current)
      await connection.removeAccountChangeListener(
        counterSubscriptionId.current
      );
    console.log("Subscribing to counter", counterPda.toBase58());
    counterSubscriptionId.current = connection.onAccountChange(
      counterPda,
      handleCounterChange,
      "processed"
    );
  }, [connection, counterPda, handleCounterChange]);

  // Subscribe to ephemeral counter updates
  const subscribeToEphemeralCounter = useCallback(async (): Promise<void> => {
    if (!ephemeralConnection.current) return;
    console.log("Subscribing to ephemeral counter", counterPda.toBase58());
    if (
      ephemeralCounterSubscriptionId &&
      ephemeralCounterSubscriptionId.current
    )
      await ephemeralConnection.current.removeAccountChangeListener(
        ephemeralCounterSubscriptionId.current
      );
    ephemeralCounterSubscriptionId.current =
      ephemeralConnection.current.onAccountChange(
        counterPda,
        handleEphemeralCounterChange,
        "processed"
      );
  }, [counterPda, handleEphemeralCounterChange]);

  // Initialize program client
  useEffect(() => {
    const initializeProgramClient = async () => {
      if (counterProgramClient.current) return;
      counterProgramClient.current = await getProgramClient(COUNTER_PROGRAM);
      const accountInfo = await provider.current.connection.getAccountInfo(
        counterPda
      );
      if (accountInfo) {
        // @ts-ignore
        const counter = await (
          counterProgramClient.current.account as any
        ).counter.fetch(counterPda);
        setCounter(Number(counter.count.valueOf()));
        setIsDelegated(!accountInfo.owner.equals(COUNTER_PROGRAM));
        await subscribeToCounter();
      }
    };
    initializeProgramClient().catch(console.error);
  }, [connection, counterPda, getProgramClient, subscribeToCounter]);

  // Create temp keypair when wallet connects
  useEffect(() => {
    if (!publicKey || !isConnected) return;

    console.log("Wallet connected with publicKey:", publicKey);
    // Create deterministic temp keypair from public key
    const pubkeyObj = new PublicKey(publicKey);
    const newTempKeypair = Keypair.fromSeed(pubkeyObj.toBytes());
    tempKeypair.current = newTempKeypair;
    console.log("Temp Keypair", newTempKeypair.publicKey.toBase58());
  }, [publicKey, isConnected]);

  // Check and transfer funds to temp keypair if needed
  useEffect(() => {
    const checkAndTransfer = async () => {
      if (tempKeypair.current && publicKey) {
        const accountTmpWallet = await connection.getAccountInfo(
          tempKeypair.current.publicKey
        );
        if (
          !accountTmpWallet ||
          accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL
        ) {
          await transferToTempKeypair();
        }
      }
    };

    if (isConnected && publicKey) {
      checkAndTransfer();
    }
  }, [isDelegated, connection, isConnected, publicKey]);

  // Initialize ephemeral connection
  useEffect(() => {
    const initializeEphemeralConnection = async () => {
      const cluster =
        process.env.REACT_APP_MAGICBLOCK_URL || "https://devnet.magicblock.app";
      if (ephemeralConnection.current) {
        return;
      }
      ephemeralConnection.current = new Connection(cluster);
      // Airdrop to trigger lazy reload
      try {
        await ephemeralConnection.current?.requestAirdrop(counterPda, 1);
      } catch (_) {
        console.log("Refreshed account in the ephemeral");
      }
      const accountInfo = await ephemeralConnection.current.getAccountInfo(
        counterPda
      );
      if (accountInfo) {
        // @ts-ignore
        const counter = await (
          counterProgramClient.current?.account as any
        ).counter.fetch(counterPda);
        setEphemeralCounter(Number(counter.count.valueOf()));
        await subscribeToCounter();
      }
      await subscribeToEphemeralCounter();
    };
    initializeEphemeralConnection().catch(console.error);
  }, [counterPda, subscribeToCounter, subscribeToEphemeralCounter]);

  const updateCounter = async (_: number): Promise<void> => {
    await increaseCounterTx();
  };

  // Submit transaction helper
  const submitTransaction = useCallback(
    async (
      transaction: Transaction,
      useTempKeypair: boolean = false,
      ephemeral: boolean = false,
      confirmCommitment: Commitment = "processed"
    ): Promise<string | null> => {
      if (!tempKeypair.current && !publicKey) return null;
      if (!isConnected) return null;
      if (!ephemeralConnection.current) return null;

      setIsSubmitting(true);
      setTransactionError(null);
      setTransactionSuccess(null);

      let txConnection = ephemeral ? ephemeralConnection.current : connection;

      try {
        const {
          context: { slot: minContextSlot },
          value: { blockhash, lastValidBlockHeight },
        } = await txConnection.getLatestBlockhashAndContext();

        if (!transaction.recentBlockhash) {
          transaction.recentBlockhash = blockhash;
        }

        if (!transaction.feePayer) {
          if (useTempKeypair && tempKeypair.current) {
            transaction.feePayer = tempKeypair.current.publicKey;
          } else if (publicKey) {
            transaction.feePayer = new PublicKey(publicKey);
          }
        }

        let signature: string | null = null;

        if (useTempKeypair && tempKeypair.current) {
          // Sign with temp keypair
          transaction.sign(tempKeypair.current);
          signature = await txConnection.sendRawTransaction(
            transaction.serialize(),
            { skipPreflight: true }
          );
        } else {
          // Sign with Lazorkit wallet
          signature = await sendTransaction(transaction, txConnection, true);
        }

        if (signature) {
          await txConnection.confirmTransaction(
            { blockhash, lastValidBlockHeight, signature },
            confirmCommitment
          );

          console.log(`Transaction confirmed: ${signature}`);
          setTransactionSuccess(`Transaction confirmed`);
          return signature;
        }

        return null;
      } catch (error) {
        console.error("Transaction error:", error);
        setTransactionError(`Transaction failed: ${error}`);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [publicKey, isConnected, connection, sendTransaction]
  );

  // Transfer SOL to temp keypair
  const transferToTempKeypair = useCallback(async () => {
    if (!publicKey || !isConnected || !tempKeypair.current) return;

    console.log("Transfer some SOL to temp keypair");
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(publicKey),
        toPubkey: tempKeypair.current.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );

    transaction.feePayer = new PublicKey(publicKey);
    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

    await submitTransaction(transaction);
  }, [publicKey, isConnected, tempKeypair, connection, submitTransaction]);

  // Increase counter transaction
  const increaseCounterTx = useCallback(async () => {
    if (!tempKeypair.current || !counterProgramClient.current) return;

    if (!isDelegated) {
      const accountTmpWallet = await connection.getAccountInfo(
        tempKeypair.current.publicKey
      );
      if (
        !accountTmpWallet ||
        accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL
      ) {
        await transferToTempKeypair();
      }
    }

    const transaction = await counterProgramClient.current.methods
      .multiply()
      .accounts({
        counter: counterPda,
      })
      .transaction();

    // Add instruction to make transaction unique
    const noopInstruction = new TransactionInstruction({
      programId: new PublicKey("noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV"),
      keys: [],
      data: Buffer.from(crypto.getRandomValues(new Uint8Array(5))),
    });
    transaction.add(noopInstruction);

    await submitTransaction(transaction, true, isDelegated);
  }, [
    isDelegated,
    counterPda,
    submitTransaction,
    connection,
    transferToTempKeypair,
  ]);

  // Delegate PDA transaction
  const delegatePdaTx = useCallback(async () => {
    if (!tempKeypair.current) return;

    console.log("Delegate PDA transaction");
    const accountTmpWallet = await connection.getAccountInfo(
      tempKeypair.current.publicKey
    );

    if (
      !accountTmpWallet ||
      accountTmpWallet.lamports <= 0.01 * LAMPORTS_PER_SOL
    ) {
      await transferToTempKeypair();
    }

    const transaction = (await counterProgramClient.current?.methods
      .delegate()
      .accounts({
        payer: tempKeypair.current.publicKey,
        pda: counterPda,
      })
      .transaction()) as Transaction;

    setEphemeralCounter(Number(counter));
    await submitTransaction(transaction, true, false, "confirmed");
  }, [
    counterPda,
    connection,
    counter,
    submitTransaction,
    transferToTempKeypair,
  ]);

  // Undelegate PDA transaction
  const undelegatePdaTx = useCallback(async () => {
    if (!tempKeypair.current) return;

    console.log("Undelegate PDA transaction");
    const transaction = (await counterProgramClient.current?.methods
      .undelegate()
      .accounts({
        payer: tempKeypair.current.publicKey,
        counter: counterPda,
      })
      .transaction()) as Transaction;

    await submitTransaction(transaction, true, true);
  }, [tempKeypair, counterPda, submitTransaction]);

  const delegateTx = useCallback(async () => {
    await delegatePdaTx();
  }, [delegatePdaTx]);

  const undelegateTx = useCallback(async () => {
    await undelegatePdaTx();
  }, [undelegatePdaTx]);

  return (
    <div className="counter-ui">
      <div className="wallet-buttons">
        {/* Replace Solana wallet button with Lazorkit */}
        <LazorWalletButton />
      </div>

      <h1>Ephemeral Counter with Passkeys</h1>
      {isConnected && publicKey && (
        <p className="connection-status">
          Connected with Passkey Authentication
        </p>
      )}

      <div className="button-container">
        <Button
          title={"Delegate"}
          resetGame={delegateTx}
          disabled={isDelegated || !isConnected}
        />
        <Button
          title={"Undelegate"}
          resetGame={undelegateTx}
          disabled={!isDelegated || !isConnected}
        />
      </div>

      <div className="game">
        <Square
          key="0"
          ind={Number(0)}
          updateSquares={(index: string | number) =>
            updateCounter(Number(index))
          }
          clsName={isDelegated ? "" : counter.toString()}
        />
        <Square
          key="1"
          ind={Number(1)}
          updateSquares={(index: string | number) =>
            updateCounter(Number(index))
          }
          clsName={isDelegated ? ephemeralCounter.toString() : ""}
        />
      </div>

      {isSubmitting && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            position: "fixed",
            bottom: "20px",
            left: 0,
            width: "100%",
            zIndex: 1000,
          }}
        >
          <div className="spinner"></div>
        </div>
      )}

      {transactionError && (
        <Alert
          type="error"
          message={transactionError}
          onClose={() => setTransactionError(null)}
        />
      )}

      {transactionSuccess && (
        <Alert
          type="success"
          message={transactionSuccess}
          onClose={() => setTransactionSuccess(null)}
        />
      )}

      <img
        src={`${process.env.PUBLIC_URL}/magicblock_white.svg`}
        alt="Magic Block Logo"
        className="magicblock-logo"
      />
    </div>
  );
};

export default App;
