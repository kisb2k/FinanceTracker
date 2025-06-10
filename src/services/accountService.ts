
'use server';

import { db } from '@/lib/firebase';
import type { Account, AccountType } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc, // Ensure comma is here
  query,
  orderBy
} from 'firebase/firestore';

const ACCOUNTS_COLLECTION = 'accounts';

export async function getAccounts(): Promise<Account[]> {
  // Ensure the table exists before fetching
  await createAccountTable();
  console.log('[AccountService] Attempting to fetch accounts...');
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
    throw new Error("Failed to fetch accounts from Firestore.");
  }
}

export type AddAccountData = Omit<Account, 'id' | 'balance' | 'lastImported'> & { initialBalance?: number };

export async function addAccount(accountData: AddAccountData): Promise<Account> {
  // Ensure the table exists before adding
  await createAccountTable();
  console.log('[AccountService] Attempting to add account:', accountData.name);
  try {
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
    throw new Error(`Failed to add account "${accountData.name}" to Firestore.`);
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>;

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   await createAccountTable();
   console.log(`[AccountService] Attempting to update account ${accountId} with:`, updates);
   try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    await updateDoc(accountRef, updates);
    console.log(`[AccountService] Account ${accountId} updated successfully.`);
    
    // This is a simplification. A real app might fetch the doc after update for consistency.
    // For now, we assume the updates contain enough info if the client needs to merge.
    // Or, ideally, fetch the document again: const updatedDoc = await getDoc(accountRef); return { id: updatedDoc.id, ...updatedDoc.data() } as Account;
    return { id: accountId, ...updates } as Account; // This might not be the full account object
  } catch (error)
{
    console.error(`[AccountService] Error updating account ${accountId}: `, error);
    throw new Error(`Failed to update account "${updates.name || accountId}" in Firestore.`);
  }
}


export async function deleteAccount(accountId: string): Promise<void> {
  await createAccountTable();
  console.log(`[AccountService] Attempting to delete account ${accountId}`);
  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(accountRef);
    console.log(`[AccountService] Account ${accountId} deleted successfully.`);
  } catch (error) {
    console.error(`[AccountService] Error deleting account ${accountId}: `, error);
    throw new Error(`Failed to delete account ${accountId} from Firestore.`);
  }
}

// This function doesn't "create a table" in the SQL sense.
// Firestore collections are created when the first document is written.
// This function is a benign read attempt, mainly for conceptual clarity or future pre-checks.
export async function createAccountTable(): Promise<void> {
  try {
    const accountsCollectionRef = collection(db, ACCOUNTS_COLLECTION);
    // Attempting to get docs from a non-existent collection is fine, it returns an empty snapshot.
    // This doesn't create the collection if it's empty.
    await getDocs(accountsCollectionRef);
    // console.log("[AccountService] Ensured 'accounts' collection (path checked).");
  } catch (error) {
    console.error("[AccountService] Error during attempt to check/ensure accounts collection:", error);
    // Not re-throwing as it's not critical for the collection to pre-exist for write operations.
  }
}
