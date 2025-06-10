
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
      console.error("[AccountService] Firestore db instance is not available. Check Firebase initialization.");
      throw new Error("Firestore database is not initialized.");
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
    // Log the specific error object for more details
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name: ", error.name);
        console.error("[AccountService] Firestore Error Message: ", error.message);
    }
    throw new Error("Failed to fetch accounts from Firestore. Check server logs for details.");
  }
}

export type AddAccountData = Omit<Account, 'id' | 'balance' | 'lastImported'> & { initialBalance?: number };

export async function addAccount(accountData: AddAccountData): Promise<Account> {
  console.log('[AccountService] Attempting to add account:', accountData.name);
  try {
    if (!db) {
      console.error("[AccountService] Firestore db instance is not available for addAccount. Check Firebase initialization.");
      throw new Error("Firestore database is not initialized.");
    }
    const balance = accountData.initialBalance || 0;
    const newAccountPayload: Omit<Account, 'id'> = {
      name: accountData.name,
      type: accountData.type,
      currency: accountData.currency,
      balance: accountData.type === 'credit' ? -Math.abs(balance) : Math.abs(balance),
      lastImported: undefined,
    };
    const docRef = await addDoc(collection(db, ACCOUNTS_COLLECTION), newAccountPayload);
    console.log('[AccountService] Account added successfully with ID:', docRef.id);
    return { id: docRef.id, ...newAccountPayload };
  } catch (error) {
    console.error("[AccountService] Error adding account: ", error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (addAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (addAccount): ", error.message);
    }
    throw new Error(`Failed to add account "${accountData.name}" to Firestore. Check server logs for details.`);
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>;

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   console.log(`[AccountService] Attempting to update account ${accountId} with:`, updates);
   try {
    if (!db) {
      console.error("[AccountService] Firestore db instance is not available for updateAccount. Check Firebase initialization.");
      throw new Error("Firestore database is not initialized.");
    }
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    await updateDoc(accountRef, updates);
    console.log(`[AccountService] Account ${accountId} updated successfully.`);
    
    // This is a simplification. A real app might fetch the doc after update for consistency.
    return { id: accountId, ...updates } as Account; // This might not be the full account object
  } catch (error) {
    console.error(`[AccountService] Error updating account ${accountId}: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (updateAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (updateAccount): ", error.message);
    }
    throw new Error(`Failed to update account "${updates.name || accountId}" in Firestore. Check server logs for details.`);
  }
}


export async function deleteAccount(accountId: string): Promise<void> {
  console.log(`[AccountService] Attempting to delete account ${accountId}`);
  try {
    if (!db) {
      console.error("[AccountService] Firestore db instance is not available for deleteAccount. Check Firebase initialization.");
      throw new Error("Firestore database is not initialized.");
    }
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(accountRef);
    console.log(`[AccountService] Account ${accountId} deleted successfully.`);
  } catch (error) {
    console.error(`[AccountService] Error deleting account ${accountId}: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (deleteAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (deleteAccount): ", error.message);
    }
    throw new Error(`Failed to delete account ${accountId} from Firestore. Check server logs for details.`);
  }
}

// This function doesn't "create a table" in the SQL sense.
// Firestore collections are created when the first document is written.
// This function can be kept for other potential uses or removed if not needed.
export async function createAccountTable(): Promise<void> {
  try {
    if (!db) {
      console.error("[AccountService] Firestore db instance is not available for createAccountTable. Check Firebase initialization.");
      // Potentially throw an error here if this function is critical and db is not available
      return;
    }
    const accountsCollectionRef = collection(db, ACCOUNTS_COLLECTION);
    await getDocs(accountsCollectionRef);
    // console.log("[AccountService] Ensured 'accounts' collection (path checked).");
  } catch (error) {
    console.error("[AccountService] Error during attempt to check/ensure accounts collection:", error);
  }
}
