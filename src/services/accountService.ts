
'use server';

import { db } from '@/lib/firebase';
import type { Account, AccountType } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc, // Added comma here
  query,
  orderBy
} from 'firebase/firestore';

const ACCOUNTS_COLLECTION = 'accounts';

export async function getAccounts(): Promise<Account[]> {
  // Ensure the table exists before fetching
  await createAccountTable();

  try {
    const accountsCollection = collection(db, ACCOUNTS_COLLECTION);
    const q = query(accountsCollection, orderBy("name", "asc"));
    const accountSnapshot = await getDocs(q);
    const accountList = accountSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Account));
    return accountList;
  } catch (error) {
    console.error("Error fetching accounts: ", error);
    throw new Error("Failed to fetch accounts.");
  }
}

export type AddAccountData = Omit<Account, 'id' | 'balance' | 'lastImported'> & { initialBalance?: number };

export async function addAccount(accountData: AddAccountData): Promise<Account> {
  // Ensure the table exists before adding
  await createAccountTable();

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
    return { id: docRef.id, ...newAccountPayload };
  } catch (error) {
    console.error("Error adding account: ", error);
    throw new Error("Failed to add account.");
  }
}

export type UpdateAccountData = Partial<Omit<Account, 'id' | 'type'>>;

export async function updateAccount(accountId: string, updates: UpdateAccountData): Promise<Account> {
   await createAccountTable();

   try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    
    await updateDoc(accountRef, updates);
    
    // This is a simplification. A real app might fetch the doc after update for consistency.
    return { id: accountId, ...updates } as Account;
  } catch (error) {
    console.error("Error updating account: ", error);
    throw new Error("Failed to update account.");
  }
}


export async function deleteAccount(accountId: string): Promise<void> {
  await createAccountTable();

  try {
    const accountRef = doc(db, ACCOUNTS_COLLECTION, accountId);
    await deleteDoc(accountRef);
  } catch (error) {
    console.error("Error deleting account: ", error);
    throw new Error("Failed to delete account.");
  }
}

export async function createAccountTable(): Promise<void> {
  try {
    const accountsCollectionRef = collection(db, ACCOUNTS_COLLECTION);
    // This is a benign read attempt. Firestore creates collections on the first write if they don't exist.
    await getDocs(accountsCollectionRef); 
  } catch (error) {
    console.error("Error during attempt to check/ensure accounts collection:", error);
  }
}
