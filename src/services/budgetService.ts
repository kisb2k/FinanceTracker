
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
  try {
    const budgetsCollection = collection(db, BUDGETS_COLLECTION);
    // Consider adding orderBy, e.g., orderBy("createdAt", "desc") or orderBy("name", "asc")
    const q = query(budgetsCollection, orderBy("name", "asc"));
    const budgetSnapshot = await getDocs(q);
    const budgetList = budgetSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Firestore timestamps need to be handled if you store them
        // createdAt: (data.createdAt as Timestamp)?.toDate().toISOString(), 
      } as Budget;
    });
    return budgetList;
  } catch (error) {
    console.error("Error fetching budgets: ", error);
    throw new Error("Failed to fetch budgets.");
  }
}

export type AddBudgetData = Omit<Budget, 'id'>;

export async function addBudget(budgetData: AddBudgetData): Promise<Budget> {
  try {
    const budgetPayload = {
      ...budgetData,
      // createdAt: Timestamp.now() // Optional: add a creation timestamp
    };
    const docRef = await addDoc(collection(db, BUDGETS_COLLECTION), budgetPayload);
    return { id: docRef.id, ...budgetPayload } as Budget; // Adjust if using server timestamps
  } catch (error) {
    console.error("Error adding budget: ", error);
    throw new Error("Failed to add budget.");
  }
}

export type UpdateBudgetData = Partial<Omit<Budget, 'id'>>;

export async function updateBudget(budgetId: string, updates: UpdateBudgetData): Promise<Budget> {
  try {
    const budgetRef = doc(db, BUDGETS_COLLECTION, budgetId);
    await updateDoc(budgetRef, updates);
    // For returning the full updated budget, you might need to fetch it again
    // or merge updates carefully if not all fields are guaranteed to be in `updates`.
    // This simplified version assumes the client can merge.
    return { id: budgetId, ...updates } as Budget; 
  } catch (error) {
    console.error("Error updating budget: ", error);
    throw new Error("Failed to update budget.");
  }
}

export async function deleteBudget(budgetId: string): Promise<void> {
  try {
    const budgetRef = doc(db, BUDGETS_COLLECTION, budgetId);
    await deleteDoc(budgetRef);
  } catch (error) {
    console.error("Error deleting budget: ", error);
    throw new Error("Failed to delete budget.");
  }
}
