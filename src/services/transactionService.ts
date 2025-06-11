
'use server';

import { db } from '@/lib/firebase';
import type { Transaction } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDoc
} from 'firebase/firestore';

const TRANSACTIONS_COLLECTION = 'transactions';

// Helper to convert Firestore Timestamps to ISO strings if they exist
const transactionFromDoc = (docSnapshot: any): Transaction => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    ...data,
    date: data.date instanceof Timestamp ? data.date.toDate().toISOString().split('T')[0] : data.date, // Store as YYYY-MM-DD string
    // Ensure createdAt and updatedAt are also handled, similar to categoryService
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  } as Transaction;
};


export async function getTransactions(accountId?: string): Promise<Transaction[]> {
  console.log(`[TransactionService] Attempting to fetch transactions... ${accountId ? `for account ${accountId}` : 'for all accounts'}`);
  if (!db) {
    console.error("[TransactionService] CRITICAL: Firestore db instance is not available for getTransactions. Firebase might not be initialized correctly. Check Firebase configuration (src/lib/firebase.ts) and .env.local settings. Ensure server was restarted after .env.local changes.");
    throw new Error("Firestore database is not initialized. Cannot fetch transactions.");
  }
  try {
    const transactionsCollection = collection(db, TRANSACTIONS_COLLECTION);
    // For now, fetching all and ordering by date. Client-side filtering by accountId will be applied.
    // A more scalable solution for many accounts would be to query by accountId here if provided.
    const q = query(transactionsCollection, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    
    const transactionSnapshot = await getDocs(q);
    const transactionList = transactionSnapshot.docs.map(transactionFromDoc);
    
    console.log(`[TransactionService] Successfully fetched ${transactionList.length} transactions.`);
     if (transactionList.length === 0) {
      console.log("[TransactionService] No transactions found in Firestore. The 'transactions' collection might be empty or does not exist yet (it will be created on first add).");
    }
    return transactionList;
  } catch (error) {
    console.error("======================================================================");
    console.error("[TransactionService] CRITICAL ERROR FETCHING TRANSACTIONS FROM FIRESTORE:");
    console.error("[TransactionService] Original Firestore Error Object (see details below):", error);
    if (error instanceof Error) {
        console.error("  [TransactionService] Firestore Error Name: ", error.name);
        console.error("  [TransactionService] Firestore Error Message: ", error.message);
        // @ts-ignore
        if (error.code) {
          console.error("  [TransactionService] Firestore Error Code: ", error.code);
           if (error.code === 'permission-denied') {
            console.error("  [TransactionService] Hint: 'permission-denied' usually means your Firestore security rules are blocking access. Please verify them in the Firebase console for the 'transactions' collection. Rules should be permissive for development (e.g., allow read: if true;).");
          } else if (error.code === 'unimplemented') {
             console.error("  [TransactionService] Hint: 'unimplemented' can mean a query requires an index that Firestore couldn't create automatically. Check if Firestore prompted for index creation in its logs or UI. The error message usually contains a direct link to create the index (e.g., for the query 'orderBy(\"date\", \"desc\"), orderBy(\"createdAt\", \"desc\")').");
          } else if (error.code === 'unavailable') {
            console.error("  [TransactionService] Hint: 'unavailable' can indicate a temporary issue with Firestore services or network connectivity from your server.");
          }
        }
    } else {
      console.error("  [TransactionService] An unexpected error type was caught:", error);
    }
    console.error("======================================================================");
    throw new Error(`Failed to fetch transactions. **SEE SERVER TERMINAL LOGS (ABOVE THIS MESSAGE) for original Firestore error details (e.g., permission denied, missing indexes).** Common issues are Firestore security rules or Firebase configuration.`);
  }
}

export type AddTransactionData = Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt' | 'loadDateTime' | 'fileName'>;

export async function addTransaction(transactionData: AddTransactionData): Promise<Transaction> {
  console.log('[TransactionService] Attempting to add transaction:', transactionData.description);
  if (!db) {
    console.error("[TransactionService] CRITICAL: Firestore db instance is not available for addTransaction.");
    throw new Error("Firestore database is not initialized. Cannot add transaction.");
  }
  try {
    // Ensure amount is a number
    const amount = parseFloat(String(transactionData.amount));
    if (isNaN(amount)) {
      throw new Error("Invalid amount provided for transaction.");
    }

    const newTransactionPayload = {
      ...transactionData,
      amount: amount,
      isDebit: amount < 0,
      date: transactionData.date, // Should be YYYY-MM-DD string
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, TRANSACTIONS_COLLECTION), newTransactionPayload);
    console.log('[TransactionService] Transaction added successfully with ID:', docRef.id);
    const newDoc = await getDoc(docRef);
    return transactionFromDoc(newDoc);
  } catch (error) {
    console.error(`[TransactionService] Error adding transaction "${transactionData.description}": `, error);
    if (error instanceof Error) {
        console.error("  [TransactionService] Firestore Error Name (addTransaction): ", error.name);
        console.error("  [TransactionService] Firestore Error Message (addTransaction): ", error.message);
        // @ts-ignore
        if (error.code) console.error("  [TransactionService] Firestore Error Code (addTransaction): ", error.code);
    }
    throw new Error(`Failed to add transaction "${transactionData.description}". Details: ${(error as Error).message}`);
  }
}

export type UpdateTransactionData = Partial<Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt'>>;

export async function updateTransaction(transactionId: string, updates: UpdateTransactionData): Promise<Transaction> {
  console.log(`[TransactionService] Attempting to update transaction ${transactionId} with:`, updates);
  if (!db) {
    console.error("[TransactionService] CRITICAL: Firestore db instance is not available for updateTransaction.");
    throw new Error("Firestore database is not initialized. Cannot update transaction.");
  }
  try {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    
    const updatePayload: any = { ...updates };
    if (updates.amount !== undefined) {
      const amount = parseFloat(String(updates.amount));
      if (isNaN(amount)) throw new Error("Invalid amount for update.");
      updatePayload.amount = amount;
      updatePayload.isDebit = amount < 0;
    }
    if (updates.date) {
        updatePayload.date = updates.date; // Ensure it's YYYY-MM-DD
    }
    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(transactionRef, updatePayload);
    console.log(`[TransactionService] Transaction ${transactionId} updated successfully.`);
    const updatedDoc = await getDoc(transactionRef);
    return transactionFromDoc(updatedDoc);
  } catch (error) {
    console.error(`[TransactionService] Error updating transaction ${transactionId}: `, error);
     if (error instanceof Error) {
        console.error("  [TransactionService] Firestore Error Name (updateTransaction): ", error.name);
        console.error("  [TransactionService] Firestore Error Message (updateTransaction): ", error.message);
        // @ts-ignore
        if (error.code) console.error("  [TransactionService] Firestore Error Code (updateTransaction): ", error.code);
    }
    throw new Error(`Failed to update transaction. Details: ${(error as Error).message}`);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  console.log(`[TransactionService] Attempting to delete transaction ${transactionId}`);
  if (!db) {
    console.error("[TransactionService] CRITICAL: Firestore db instance is not available for deleteTransaction.");
    throw new Error("Firestore database is not initialized. Cannot delete transaction.");
  }
  try {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    await deleteDoc(transactionRef);
    console.log(`[TransactionService] Transaction ${transactionId} deleted successfully.`);
  } catch (error) {
    console.error(`[TransactionService] Error deleting transaction ${transactionId}: `, error);
    if (error instanceof Error) {
        console.error("  [TransactionService] Firestore Error Name (deleteTransaction): ", error.name);
        console.error("  [TransactionService] Firestore Error Message (deleteTransaction): ", error.message);
        // @ts-ignore
        if (error.code) console.error("  [TransactionService] Firestore Error Code (deleteTransaction): ", error.code);
    }
    throw new Error(`Failed to delete transaction ${transactionId}. Details: ${(error as Error).message}`);
  }
}

