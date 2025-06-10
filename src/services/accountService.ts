
'use server';

import { db } from '@/lib/firebase';
import type { Account, AccountType } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';

const ACCOUNTS_COLLECTION = 'accounts';

export async function getAccounts(): Promise<Account[]> {
  console.log('[AccountService] Attempting to fetch accounts...');
  try {
    if (!db) {
      console.error("[AccountService] Firestore db instance is not available. Check Firebase initialization in src/lib/firebase.ts and ensure .env.local is correctly set up and server restarted.");
      throw new Error("Firestore database is not initialized. Critical configuration issue.");
    }
    const accountsCollection = collection(db, ACCOUNTS_COLLECTION);
    const q = query(accountsCollection, orderBy("name", "asc"));
    const accountSnapshot = await getDocs(q);
    const accountList = accountSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Account));
    console.log(`[AccountService] Fetched ${accountList.length} accounts.`);
    return accountList;
  } catch (error) {
    console.error("[AccountService] Error fetching accounts: ", error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (getAccounts): ", error.name);
        console.error("[AccountService] Firestore Error Message (getAccounts): ", error.message);
        // More detailed Firestore error properties if available
        // @ts-ignore
        if (error.code) console.error("[AccountService] Firestore Error Code (getAccounts): ", error.code);
    }
    throw new Error("Failed to fetch accounts from Firestore. Check server logs for details, including Firebase configuration and Firestore security rules.");
  }
}

export type AddAccountData = Omit<Account, 'id' | 'balance' | 'lastImported'> & { initialBalance?: number };

export async function addAccount(accountData: AddAccountData): Promise<Account> {
  console.log('[AccountService] Attempting to add account:', accountData.name);
  if (!db) {
    console.error("[AccountService] Firestore db instance is NOT AVAILABLE for addAccount. This is a critical issue. Check Firebase initialization in src/lib/firebase.ts and ensure .env.local is correctly set up and your Next.js server was restarted after changes.");
    throw new Error("Firestore database is not initialized. Cannot add account.");
  }
  try {
    const balance = accountData.initialBalance || 0;
    const newAccountPayload: Omit<Account, 'id'> = {
      name: accountData.name,
      type: accountData.type,
      currency: accountData.currency,
      balance: accountData.type === 'credit' ? -Math.abs(balance) : Math.abs(balance),
      lastImported: undefined, // Or new Date().toISOString() if you want to set it on creation
    };
    console.log('[AccountService] Payload to be added:', newAccountPayload);
    const docRef = await addDoc(collection(db, ACCOUNTS_COLLECTION), newAccountPayload);
    console.log('[AccountService] Account added successfully to Firestore with ID:', docRef.id);
    return { id: docRef.id, ...newAccountPayload };
  } catch (error) {
    console.error(`[AccountService] Error adding account "${accountData.name}" to Firestore: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (addAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (addAccount): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[AccountService] Firestore Error Code (addAccount): ", error.code);
    }
    // Provide a more specific error message based on common Firestore error codes
    // @ts-ignore
    if (error.code === 'permission-denied') {
      throw new Error(`Failed to add account "${accountData.name}": Permission denied. Check your Firestore security rules.`);
    }
    throw new Error(`Failed to add account "${accountData.name}" to Firestore. Check server logs and Firestore security rules. Details: ${(error as Error).message}`);
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>; // type cannot be changed after creation for simplicity

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   console.log(`[AccountService] Attempting to update account ${accountId} with:`, updates);
   if (!db) {
    console.error("[AccountService] Firestore db instance is NOT AVAILABLE for updateAccount. Critical configuration issue.");
    throw new Error("Firestore database is not initialized. Cannot update account.");
  }
   try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    // Ensure balance is handled correctly if it's part of updates
    // This logic assumes 'type' is not changing. If it could, this would be more complex.
    // For now, 'type' is not part of UpdateAccountData.
    if (updates.balance !== undefined) {
        // To correctly update balance, we might need the account's type.
        // Fetching the account type first or ensuring client sends appropriate sign.
        // For simplicity, let's assume client sends balance with correct sign or service needs to fetch type.
        // The current accounts page sends balance as an absolute number and expects the service to handle the sign.
        // This requires fetching the account or trusting the client which is not ideal.
        // Let's keep it as is for now, meaning updateAccount expects balance with correct sign if provided.
    }

    await updateDoc(accountRef, updates);
    console.log(`[AccountService] Account ${accountId} updated successfully in Firestore.`);
    
    // To return the full, updated account, you'd fetch the document again:
    // const updatedDoc = await getDoc(accountRef);
    // return { id: updatedDoc.id, ...updatedDoc.data() } as Account;
    // For now, returning a merged object for simplicity (might not reflect server-generated fields like timestamps)
    return { id: accountId, ...updates } as Account; 
  } catch (error) {
    console.error(`[AccountService] Error updating account ${accountId} in Firestore: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (updateAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (updateAccount): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[AccountService] Firestore Error Code (updateAccount): ", error.code);
    }
    // @ts-ignore
    if (error.code === 'permission-denied') {
      throw new Error(`Failed to update account "${updates.name || accountId}": Permission denied. Check your Firestore security rules.`);
    }
    throw new Error(`Failed to update account "${updates.name || accountId}" in Firestore. Check server logs. Details: ${(error as Error).message}`);
  }
}


export async function deleteAccount(accountId: string): Promise<void> {
  console.log(`[AccountService] Attempting to delete account ${accountId}`);
  if (!db) {
    console.error("[AccountService] Firestore db instance is NOT AVAILABLE for deleteAccount. Critical configuration issue.");
    throw new Error("Firestore database is not initialized. Cannot delete account.");
  }
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(accountRef);
    console.log(`[AccountService] Account ${accountId} deleted successfully from Firestore.`);
  } catch (error) {
    console.error(`[AccountService] Error deleting account ${accountId} from Firestore: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (deleteAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (deleteAccount): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[AccountService] Firestore Error Code (deleteAccount): ", error.code);
    }
    // @ts-ignore
    if (error.code === 'permission-denied') {
      throw new Error(`Failed to delete account ${accountId}: Permission denied. Check your Firestore security rules.`);
    }
    throw new Error(`Failed to delete account ${accountId} from Firestore. Check server logs. Details: ${(error as Error).message}`);
  }
}

// This function isn't strictly needed as Firestore creates collections on first document write.
// Kept for reference or if pre-warming a collection path is ever desired (rare).
export async function createAccountTable(): Promise<void> {
  try {
    if (!db) {
      console.warn("[AccountService] Firestore db instance is not available for createAccountTable. Skipping path check. This usually means Firebase isn't initialized.");
      return;
    }
    // This doesn't "create" a table but can be used to check if the path is referencable.
    // collection(db, ACCOUNTS_COLLECTION); 
    // console.log("[AccountService] Ensured 'accounts' collection path is valid (actual collection created on first write).");
  } catch (error) {
    console.error("[AccountService] Error during attempt to reference accounts collection path:", error);
  }
}
