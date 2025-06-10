
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
  orderBy,
  getDoc
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
    // Construct the payload for Firestore.
    // lastImported is intentionally omitted here. Since it's optional in the Account type,
    // it will not be included in the object sent to Firestore if its value would be undefined.
    // If you wanted to explicitly set it to null on creation, you'd use: lastImported: null,
    const newAccountPayload: Omit<Account, 'id'> = {
      name: accountData.name,
      type: accountData.type,
      currency: accountData.currency,
      balance: accountData.type === 'credit' ? -Math.abs(balance) : Math.abs(balance),
      // lastImported is not set here, so it will be omitted from the object sent to Firestore.
    };
    console.log('[AccountService] Payload to be added to Firestore:', newAccountPayload);
    const docRef = await addDoc(collection(db, ACCOUNTS_COLLECTION), newAccountPayload);
    console.log('[AccountService] Account added successfully to Firestore with ID:', docRef.id);
    
    // Construct the object to return to the client, ensuring it matches the Account type.
    // Since newAccountPayload doesn't include lastImported if it was undefined,
    // the spread operator will correctly result in an object where lastImported is optional.
    return { id: docRef.id, ...newAccountPayload } as Account;
  } catch (error) {
    console.error(`[AccountService] Error adding account "${accountData.name}" to Firestore: `, error);
    if (error instanceof Error) {
        console.error("[AccountService] Firestore Error Name (addAccount): ", error.name);
        console.error("[AccountService] Firestore Error Message (addAccount): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[AccountService] Firestore Error Code (addAccount): ", error.code);
    }
    // @ts-ignore
    if (error.code === 'permission-denied') {
      throw new Error(`Failed to add account "${accountData.name}": Permission denied. Check your Firestore security rules.`);
    }
    // @ts-ignore
    if (error.message && error.message.includes("invalid data") && error.message.includes("Unsupported field value: undefined")) {
       throw new Error(`Failed to add account "${accountData.name}" due to an undefined field value. Please check payload. Details: ${(error as Error).message}`);
    }
    throw new Error(`Failed to add account "${accountData.name}" to Firestore. Check server logs and Firestore security rules. Details: ${(error as Error).message}`);
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>;

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   console.log(`[AccountService] Attempting to update account ${accountId} with:`, updates);
   if (!db) {
    console.error("[AccountService] Firestore db instance is NOT AVAILABLE for updateAccount. Critical configuration issue.");
    throw new Error("Firestore database is not initialized. Cannot update account.");
  }
   try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    // Firestore's updateDoc handles undefined values in the 'updates' object by ignoring them,
    // which is usually the desired behavior for partial updates.
    await updateDoc(accountRef, updates);
    console.log(`[AccountService] Account ${accountId} updated successfully in Firestore.`);
    
    // Fetch the updated document to return the complete and current state.
    const updatedDoc = await getDoc(accountRef);
    if (!updatedDoc.exists()) {
        throw new Error(`Account with ID ${accountId} not found after update.`);
    }
    return { id: updatedDoc.id, ...updatedDoc.data() } as Account;
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
