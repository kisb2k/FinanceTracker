
'use server';

import { db } from '@/lib/firebase';
import type { Category } from '@/lib/types';
import {
  collection,
  getDocs,
  addDoc,
  doc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  where,
  getDoc,
  updateDoc
} from 'firebase/firestore';

const CATEGORIES_COLLECTION = 'categories';

export async function getCategories(): Promise<Category[]> {
  console.log('[CategoryService] Attempting to fetch categories...');
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  try {
    const categoriesCollection = collection(db, CATEGORIES_COLLECTION);
    const q = query(categoriesCollection, orderBy("name", "asc"));
    const categorySnapshot = await getDocs(q);
    const categoryList = categorySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Category));
    console.log(`[CategoryService] Fetched ${categoryList.length} categories.`);
    return categoryList;
  } catch (error) {
    console.error("[CategoryService] Error fetching categories: ", error);
    throw new Error("Failed to fetch categories from Firestore.");
  }
}

export type AddCategoryData = Omit<Category, 'id'>;

export async function addCategory(categoryData: AddCategoryData): Promise<Category> {
  console.log('[CategoryService] Attempting to add category:', categoryData.name);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  // Check if category already exists (case-insensitive)
  const q = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", categoryData.name.toLowerCase()));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    console.warn(`[CategoryService] Category "${categoryData.name}" already exists.`);
    // Optionally, you could return the existing category or throw a more specific error
    // For now, let's throw an error to prevent duplicates clearly.
    throw new Error(`Category "${categoryData.name}" already exists.`);
  }

  try {
    const newCategoryPayload = {
      ...categoryData,
      nameLower: categoryData.name.toLowerCase(), // For case-insensitive checks
      createdAt: serverTimestamp(), // Optional: add a creation timestamp
    };
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), newCategoryPayload);
    console.log('[CategoryService] Category added successfully with ID:', docRef.id);
    // Fetch the document to get the server timestamp resolved
    const newDoc = await getDoc(docRef);
    return { id: newDoc.id, ...newDoc.data() } as Category;
  } catch (error) {
    console.error(`[CategoryService] Error adding category "${categoryData.name}": `, error);
    throw new Error(`Failed to add category "${categoryData.name}".`);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  console.log(`[CategoryService] Attempting to delete category ${categoryId}`);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  // TODO: Future enhancement - check if category is in use by transactions or budgets
  // before allowing deletion, or provide options to re-categorize.
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    await deleteDoc(categoryRef);
    console.log(`[CategoryService] Category ${categoryId} deleted successfully.`);
  } catch (error) {
    console.error(`[CategoryService] Error deleting category ${categoryId}: `, error);
    throw new Error(`Failed to delete category ${categoryId}.`);
  }
}

// Example of updating a category if needed later
export async function updateCategory(categoryId: string, updates: Partial<Omit<Category, 'id' | 'nameLower' | 'createdAt'>> & { name?: string }): Promise<Category> {
  console.log(`[CategoryService] Attempting to update category ${categoryId} with:`, updates);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available.");
    throw new Error("Firestore database is not initialized.");
  }
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const updatePayload: any = { ...updates };
    if (updates.name) {
      updatePayload.nameLower = updates.name.toLowerCase();
    }
    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(categoryRef, updatePayload);
    console.log(`[CategoryService] Category ${categoryId} updated successfully.`);
    const updatedDoc = await getDoc(categoryRef);
    return { id: updatedDoc.id, ...updatedDoc.data() } as Category;
  } catch (error) {
    console.error(`[CategoryService] Error updating category ${categoryId}: `, error);
    throw new Error(`Failed to update category. Details: ${(error as Error).message}`);
  }
}
