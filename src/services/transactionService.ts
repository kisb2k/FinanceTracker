
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
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  } as Transaction;
};


export async function getTransactions(accountId?: string): Promise<Transaction[]> {
  console.log(`[TransactionService] Attempting to fetch transactions... ${accountId ? `for account ${accountId}` : 'for all accounts'}`);
  if (!db) {
    console.error("[TransactionService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  try {
    const transactionsCollection = collection(db, TRANSACTIONS_COLLECTION);
    // For now, fetching all and ordering by date. Client-side filtering by accountId will be applied.
    // A more scalable solution for many accounts would be to query by accountId here if provided.
    const q = query(transactionsCollection, orderBy("date", "desc"), orderBy("createdAt", "desc"));
    
    const transactionSnapshot = await getDocs(q);
    const transactionList = transactionSnapshot.docs.map(transactionFromDoc);
    
    console.log(`[TransactionService] Fetched ${transactionList.length} transactions.`);
    return transactionList;
  } catch (error) {
    console.error("[TransactionService] Error fetching transactions: ", error);
    throw new Error("Failed to fetch transactions from Firestore.");
  }
}

export type AddTransactionData = Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt' | 'loadDateTime' | 'fileName'>;

export async function addTransaction(transactionData: AddTransactionData): Promise<Transaction> {
  console.log('[TransactionService] Attempting to add transaction:', transactionData.description);
  if (!db) {
    console.error("[TransactionService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
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
    throw new Error(`Failed to add transaction "${transactionData.description}". Details: ${(error as Error).message}`);
  }
}

export type UpdateTransactionData = Partial<Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt'>>;

export async function updateTransaction(transactionId: string, updates: UpdateTransactionData): Promise<Transaction> {
  console.log(`[TransactionService] Attempting to update transaction ${transactionId} with:`, updates);
  if (!db) {
    console.error("[TransactionService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
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
    throw new Error(`Failed to update transaction. Details: ${(error as Error).message}`);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  console.log(`[TransactionService] Attempting to delete transaction ${transactionId}`);
  if (!db) {
    console.error("[TransactionService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  try {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    await deleteDoc(transactionRef);
    console.log(`[TransactionService] Transaction ${transactionId} deleted successfully.`);
  } catch (error) {
    console.error(`[TransactionService] Error deleting transaction ${transactionId}: `, error);
    throw new Error(`Failed to delete transaction ${transactionId}.`);
  }
}
