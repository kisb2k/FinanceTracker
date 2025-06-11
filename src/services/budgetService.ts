
'use server';

import { db } from '@/lib/firebase';
import type { Budget } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp
} from 'firebase/firestore';

const BUDGETS_COLLECTION = 'budgets';

export async function getBudgets(): Promise<Budget[]> {
  if (!db) {
    const errorMsg = "[BudgetService] Firestore db instance is not available. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const budgetsCollection = collection(db, BUDGETS_COLLECTION);
    const q = query(budgetsCollection, orderBy("name", "asc"));
    const budgetSnapshot = await getDocs(q);
    const budgetList = budgetSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      } as Budget;
    });
    return budgetList;
  } catch (error) {
    console.error("[BudgetService] Error fetching budgets: ", error);
    const originalError = error as any;
    const errorMessage = `BudgetService Error (getBudgets): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules or Firebase configuration.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type AddBudgetData = Omit<Budget, 'id'>;

export async function addBudget(budgetData: AddBudgetData): Promise<Budget> {
  if (!db) {
    const errorMsg = "[BudgetService] Firestore db instance is not available. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const budgetPayload = {
      ...budgetData,
    };
    const docRef = await addDoc(collection(db, BUDGETS_COLLECTION), budgetPayload);
    return { id: docRef.id, ...budgetPayload } as Budget;
  } catch (error) {
    console.error("[BudgetService] Error adding budget: ", error);
    const originalError = error as any;
    const errorMessage = `BudgetService Error (addBudget: ${budgetData.name}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export type UpdateBudgetData = Partial<Omit<Budget, 'id'>>;

export async function updateBudget(budgetId: string, updates: UpdateBudgetData): Promise<Budget> {
  if (!db) {
    const errorMsg = "[BudgetService] Firestore db instance is not available. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const budgetRef = doc(db, BUDGETS_COLLECTION, budgetId);
    await updateDoc(budgetRef, updates);
    // This simplified version assumes the client can merge or refetches if necessary.
    const updatedDoc = await getDoc(budgetRef);
     if (!updatedDoc.exists()) {
        throw new Error(`Budget with ID ${budgetId} not found after update.`);
    }
    return { id: updatedDoc.id, ...updatedDoc.data() } as Budget; 
  } catch (error) {
    console.error("[BudgetService] Error updating budget: ", error);
    const originalError = error as any;
    const errorMessage = `BudgetService Error (updateBudget: ${budgetId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export async function deleteBudget(budgetId: string): Promise<void> {
  if (!db) {
    const errorMsg = "[BudgetService] Firestore db instance is not available. Critical configuration issue.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const budgetRef = doc(db, BUDGETS_COLLECTION, budgetId);
    await deleteDoc(budgetRef);
  } catch (error) {
    console.error("[BudgetService] Error deleting budget: ", error);
    const originalError = error as any;
    const errorMessage = `BudgetService Error (deleteBudget: ${budgetId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}
