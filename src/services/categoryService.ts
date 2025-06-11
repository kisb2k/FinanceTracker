
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
    console.error("[CategoryService] Firestore db instance is not available. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot fetch categories.");
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
    console.error("[CategoryService] Error fetching categories from Firestore: ", error);
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (getCategories): ", error.name);
        console.error("[CategoryService] Firestore Error Message (getCategories): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (getCategories): ", error.code);
    }
    throw new Error("Failed to fetch categories from Firestore. Check server logs for details, including Firebase configuration and Firestore security rules.");
  }
}

export type AddCategoryData = Omit<Category, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>;

export async function addCategory(categoryData: AddCategoryData): Promise<Category> {
  console.log('[CategoryService] Attempting to add category:', categoryData.name);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot add category.");
  }
  if (!categoryData.name || categoryData.name.trim() === "") {
    throw new Error("Category name cannot be empty.");
  }

  // Check if category already exists (case-insensitive)
  const q = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", categoryData.name.toLowerCase().trim()));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const existingCategory = querySnapshot.docs[0].data() as Category;
    console.warn(`[CategoryService] Category "${categoryData.name}" already exists with ID ${querySnapshot.docs[0].id}.`);
    throw new Error(`Category "${categoryData.name}" already exists.`);
  }

  try {
    const newCategoryPayload = {
      name: categoryData.name.trim(),
      icon: categoryData.icon || '', // Ensure icon is at least an empty string
      nameLower: categoryData.name.toLowerCase().trim(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), newCategoryPayload);
    console.log('[CategoryService] Category added successfully to Firestore with ID:', docRef.id);
    
    const newDoc = await getDoc(docRef);
    if (!newDoc.exists()) {
        throw new Error(`Failed to retrieve newly added category with ID ${docRef.id}.`);
    }
    return { id: newDoc.id, ...newDoc.data() } as Category;
  } catch (error) {
    console.error(`[CategoryService] Error adding category "${categoryData.name}" to Firestore: `, error);
     if (error instanceof Error && error.message.includes("already exists")) {
      throw error; // Re-throw specific "already exists" error
    }
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (addCategory): ", error.name);
        console.error("[CategoryService] Firestore Error Message (addCategory): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (addCategory): ", error.code);
    }
    throw new Error(`Failed to add category "${categoryData.name}" to Firestore. Check server logs and Firestore security rules. Details: ${(error as Error).message}`);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  console.log(`[CategoryService] Attempting to delete category ${categoryId}`);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot delete category.");
  }
  // TODO: Consider checking if category is in use by transactions or budgets before deletion.
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    await deleteDoc(categoryRef);
    console.log(`[CategoryService] Category ${categoryId} deleted successfully from Firestore.`);
  } catch (error) {
    console.error(`[CategoryService] Error deleting category ${categoryId} from Firestore: `, error);
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (deleteCategory): ", error.name);
        console.error("[CategoryService] Firestore Error Message (deleteCategory): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (deleteCategory): ", error.code);
    }
    throw new Error(`Failed to delete category ${categoryId} from Firestore. Check server logs. Details: ${(error as Error).message}`);
  }
}

export async function updateCategory(categoryId: string, updates: Partial<Omit<Category, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>> & { name?: string }): Promise<Category> {
  console.log(`[CategoryService] Attempting to update category ${categoryId} with:`, updates);
  if (!db) {
    console.error("[CategoryService] Firestore db instance is not available. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot update category.");
  }
  if (updates.name && updates.name.trim() === "") {
    throw new Error("Category name cannot be empty for update.");
  }

  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const updatePayload: any = { ...updates };
    
    if (updates.name) {
      const newNameLower = updates.name.toLowerCase().trim();
      // Check if new name conflicts with another existing category
      const q = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", newNameLower));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty && querySnapshot.docs.some(doc => doc.id !== categoryId)) {
        throw new Error(`Another category with the name "${updates.name}" already exists.`);
      }
      updatePayload.name = updates.name.trim();
      updatePayload.nameLower = newNameLower;
    }
    if (updates.icon === undefined) delete updatePayload.icon; // Remove icon if it's undefined to avoid storing it

    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(categoryRef, updatePayload);
    console.log(`[CategoryService] Category ${categoryId} updated successfully in Firestore.`);
    
    const updatedDoc = await getDoc(categoryRef);
    if (!updatedDoc.exists()) {
        throw new Error(`Category with ID ${categoryId} not found after update.`);
    }
    return { id: updatedDoc.id, ...updatedDoc.data() } as Category;
  } catch (error) {
    console.error(`[CategoryService] Error updating category ${categoryId} in Firestore: `, error);
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error; // Re-throw specific "already exists" error
    }
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (updateCategory): ", error.name);
        console.error("[CategoryService] Firestore Error Message (updateCategory): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (updateCategory): ", error.code);
    }
    throw new Error(`Failed to update category "${updates.name || categoryId}" in Firestore. Details: ${(error as Error).message}`);
  }
}
