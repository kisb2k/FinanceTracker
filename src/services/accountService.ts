
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
  if (!db) {
    const errorMsg = "[AccountService] Firestore db instance is not available. Check Firebase initialization in src/lib/firebase.ts and ensure .env.local is correctly set up and server restarted.";
    console.error(errorMsg);
    throw new Error(errorMsg + " This is a critical configuration issue.");
  }
  try {
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
    const originalError = error as any;
    const errorMessage = `AccountService Error (getAccounts): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules or Firebase configuration.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type AddAccountData = Omit<Account, 'id' | 'balance' | 'lastImported'> & { initialBalance?: number };

export async function addAccount(accountData: AddAccountData): Promise<Account> {
  console.log('[AccountService] Attempting to add account:', accountData.name);
  if (!db) {
    const errorMsg = "[AccountService] Firestore db instance is NOT AVAILABLE for addAccount. This is a critical issue. Check Firebase initialization in src/lib/firebase.ts and ensure .env.local is correctly set up and your Next.js server was restarted after changes.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const balance = accountData.initialBalance || 0;
    const newAccountPayload: Omit<Account, 'id'> = {
      name: accountData.name,
      type: accountData.type,
      currency: accountData.currency,
      balance: accountData.type === 'credit' ? -Math.abs(balance) : Math.abs(balance),
    };
    console.log('[AccountService] Payload to be added to Firestore:', newAccountPayload);
    const docRef = await addDoc(collection(db, ACCOUNTS_COLLECTION), newAccountPayload);
    console.log('[AccountService] Account added successfully to Firestore with ID:', docRef.id);
    
    return { id: docRef.id, ...newAccountPayload } as Account;
  } catch (error) {
    console.error(`[AccountService] Error adding account "${accountData.name}" to Firestore: `, error);
    const originalError = error as any;
    const errorMessage = `AccountService Error (addAccount: ${accountData.name}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules, invalid data (e.g. undefined fields).`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>;

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   console.log(`[AccountService] Attempting to update account ${accountId} with:`, updates);
   if (!db) {
    const errorMsg = "[AccountService] Firestore db instance is NOT AVAILABLE for updateAccount. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
   try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await updateDoc(accountRef, updates);
    console.log(`[AccountService] Account ${accountId} updated successfully in Firestore.`);
    
    const updatedDoc = await getDoc(accountRef);
    if (!updatedDoc.exists()) {
        throw new Error(`Account with ID ${accountId} not found after update.`);
    }
    return { id: updatedDoc.id, ...updatedDoc.data() } as Account;
  } catch (error) {
    console.error(`[AccountService] Error updating account ${accountId} in Firestore: `, error);
    const originalError = error as any;
    const errorMessage = `AccountService Error (updateAccount: ${accountId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}


export async function deleteAccount(accountId: string): Promise<void> {
  console.log(`[AccountService] Attempting to delete account ${accountId}`);
  if (!db) {
    const errorMsg = "[AccountService] Firestore db instance is NOT AVAILABLE for deleteAccount. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(accountRef);
    console.log(`[AccountService] Account ${accountId} deleted successfully from Firestore.`);
  } catch (error) {
    console.error(`[AccountService] Error deleting account ${accountId} from Firestore: `, error);
    const originalError = error as any;
    const errorMessage = `AccountService Error (deleteAccount: ${accountId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}
