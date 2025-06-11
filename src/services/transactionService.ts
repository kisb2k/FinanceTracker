
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
  getDoc,
  writeBatch
} from 'firebase/firestore';

const TRANSACTIONS_COLLECTION = 'transactions';

// Helper to convert Firestore Timestamps to ISO strings if they exist
const transactionFromDoc = (docSnapshot: any): Transaction => {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    ...data,
    date: data.date instanceof Timestamp ? data.date.toDate().toISOString().split('T')[0] : data.date,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  } as Transaction;
};


export async function getTransactions(accountId?: string): Promise<Transaction[]> {
  console.log(`[TransactionService] Attempting to fetch transactions... ${accountId ? `for account ${accountId}` : 'for all accounts'}`);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for getTransactions. Firebase might not be initialized correctly. Check Firebase configuration (src/lib/firebase.ts) and .env.local settings. Ensure server was restarted after .env.local changes.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const transactionsCollection = collection(db, TRANSACTIONS_COLLECTION);
    // Firestore queries require an index if you order by a field and then filter on another, or order by multiple fields.
    // For just ordering by date, then by creation time (if dates are same), this should be fine.
    // If accountId filtering is added here later, a composite index might be needed.
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
    const originalError = error as any; 
    console.error("[TransactionService] Original Firestore Error Object (see details below):", originalError);
    if (originalError instanceof Error) { 
        console.error("  [TransactionService] Firestore Error Name: ", originalError.name);
        console.error("  [TransactionService] Firestore Error Message: ", originalError.message);
    }
    if (originalError.code) { 
      console.error("  [TransactionService] Firestore Error Code: ", originalError.code);
       if (originalError.code === 'permission-denied') {
        console.error("  [TransactionService] Hint: 'permission-denied' usually means your Firestore security rules are blocking access. Please verify them in the Firebase console for the 'transactions' collection. Rules should be permissive for development (e.g., allow read: if true;).");
      } else if (originalError.code === 'unimplemented' || originalError.code === 'failed-precondition' || (originalError.message && originalError.message.toLowerCase().includes('index'))) {
         console.error("  [TransactionService] Hint: This error (often 'unimplemented', 'failed-precondition' or mentioning 'index') means a query requires an index that Firestore couldn't create automatically (e.g., for 'orderBy(\"date\", \"desc\"), orderBy(\"createdAt\", \"desc\")'). Check if Firestore prompted for index creation in its logs or UI. The error message in server logs (Google Cloud Logging) usually contains a direct link to create the index.");
      } else if (originalError.code === 'unavailable') {
        console.error("  [TransactionService] Hint: 'unavailable' can indicate a temporary issue with Firestore services or network connectivity from your server.");
      }
    } else if (!(originalError instanceof Error)) {
      console.error("  [TransactionService] An unexpected, non-Error type was caught:", originalError);
    }
    console.error("======================================================================");
    const errorMessage = `TransactionService Error (getTransactions): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules or missing indexes.`;
    throw new Error(errorMessage);
  }
}

export type AddTransactionData = Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt' | 'loadDateTime' | 'fileName'>;

export async function addTransaction(transactionData: AddTransactionData): Promise<Transaction> {
  console.log('[TransactionService] Attempting to add transaction:', transactionData.description);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for addTransaction.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const amount = parseFloat(String(transactionData.amount));
    if (isNaN(amount)) {
      throw new Error("Invalid amount provided for transaction.");
    }

    const newTransactionPayload = {
      ...transactionData,
      amount: amount,
      isDebit: amount < 0,
      date: transactionData.date, // Ensure date is in YYYY-MM-DD string format or Firestore Timestamp
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, TRANSACTIONS_COLLECTION), newTransactionPayload);
    console.log('[TransactionService] Transaction added successfully with ID:', docRef.id);
    const newDoc = await getDoc(docRef);
    return transactionFromDoc(newDoc);
  } catch (error) {
    const originalError = error as any;
    console.error(`[TransactionService] Error adding transaction "${transactionData.description}": `, originalError);
    const errorMessage = `TransactionService Error (addTransaction: ${transactionData.description}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type UpdateTransactionData = Partial<Omit<Transaction, 'id' | 'isDebit' | 'createdAt' | 'updatedAt'>>;

export async function updateTransaction(transactionId: string, updates: UpdateTransactionData): Promise<Transaction> {
  console.log(`[TransactionService] Attempting to update transaction ${transactionId} with:`, updates);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for updateTransaction.";
    console.error(errorMsg);
    throw new Error(errorMsg);
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
        updatePayload.date = updates.date; // Ensure date is in YYYY-MM-DD string format or Firestore Timestamp
    }
    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(transactionRef, updatePayload);
    console.log(`[TransactionService] Transaction ${transactionId} updated successfully.`);
    const updatedDoc = await getDoc(transactionRef);
    return transactionFromDoc(updatedDoc);
  } catch (error) {
    const originalError = error as any;
    console.error(`[TransactionService] Error updating transaction ${transactionId}: `, originalError);
    const errorMessage = `TransactionService Error (updateTransaction: ${transactionId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  console.log(`[TransactionService] Attempting to delete transaction ${transactionId}`);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for deleteTransaction.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    await deleteDoc(transactionRef);
    console.log(`[TransactionService] Transaction ${transactionId} deleted successfully.`);
  } catch (error) {
    const originalError = error as any;
    console.error(`[TransactionService] Error deleting transaction ${transactionId}: `, originalError);
    const errorMessage = `TransactionService Error (deleteTransaction: ${transactionId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}


export async function deleteMultipleTransactions(transactionIds: string[]): Promise<void> {
  console.log(`[TransactionService] Attempting to delete ${transactionIds.length} transactions.`);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for deleteMultipleTransactions.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (transactionIds.length === 0) {
    console.log("[TransactionService] No transaction IDs provided for bulk delete.");
    return;
  }
  if (transactionIds.length > 500) {
      // Firestore batch limit, though client-side might enforce lower for UX
      console.warn(`[TransactionService] Attempting to delete ${transactionIds.length} transactions, which exceeds typical batch limits. Consider splitting into smaller batches if issues arise.`);
  }

  const batch = writeBatch(db);
  transactionIds.forEach(id => {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, id);
    batch.delete(transactionRef);
  });

  try {
    await batch.commit();
    console.log(`[TransactionService] Successfully deleted ${transactionIds.length} transactions.`);
  } catch (error) {
    const originalError = error as any;
    console.error(`[TransactionService] Error deleting multiple transactions: `, originalError);
    const errorMessage = `TransactionService Error (deleteMultipleTransactions): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type BulkUpdateTransactionData = Partial<Pick<Transaction, 'category' | 'accountId' | 'date' | 'description' | 'amount'>>;

export async function updateMultipleTransactions(transactionIds: string[], updates: BulkUpdateTransactionData): Promise<void> {
  console.log(`[TransactionService] Attempting to bulk update ${transactionIds.length} transactions with:`, updates);
  if (!db) {
    const errorMsg = "[TransactionService] CRITICAL: Firestore db instance is not available for updateMultipleTransactions.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (transactionIds.length === 0) {
    console.log("[TransactionService] No transaction IDs provided for bulk update.");
    return;
  }
   if (transactionIds.length > 500) {
      console.warn(`[TransactionService] Attempting to update ${transactionIds.length} transactions, which exceeds typical batch limits. Consider splitting into smaller batches if issues arise.`);
  }

  const batch = writeBatch(db);
  const updatePayload: any = { ...updates, updatedAt: serverTimestamp() };

  if (updates.amount !== undefined) {
    const amount = parseFloat(String(updates.amount));
    if (isNaN(amount)) {
        const amountError = "[TransactionService] Invalid amount provided for bulk update.";
        console.error(amountError);
        throw new Error(amountError);
    }
    updatePayload.amount = amount;
    updatePayload.isDebit = amount < 0;
  }


  transactionIds.forEach(id => {
    const transactionRef = doc(db, TRANSACTIONS_COLLECTION, id);
    batch.update(transactionRef, updatePayload);
  });

  try {
    await batch.commit();
    console.log(`[TransactionService] Successfully bulk updated ${transactionIds.length} transactions.`);
  } catch (error) {
    const originalError = error as any;
    console.error(`[TransactionService] Error bulk updating transactions: `, originalError);
    const errorMessage = `TransactionService Error (updateMultipleTransactions): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}
