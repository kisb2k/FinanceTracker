
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
  updateDoc,
  Timestamp
} from 'firebase/firestore';

const CATEGORIES_COLLECTION = 'categories';

export async function getCategories(): Promise<Category[]> {
  console.log('[CategoryService] Attempting to fetch categories...');
  if (!db) {
    console.error("[CategoryService] CRITICAL: Firestore db instance is not available. Firebase might not be initialized correctly. Check Firebase configuration (src/lib/firebase.ts) and .env.local settings. Ensure server was restarted after .env.local changes.");
    throw new Error("Firestore database is not initialized. Cannot fetch categories.");
  }
  try {
    const categoriesCollection = collection(db, CATEGORIES_COLLECTION);
    const q = query(categoriesCollection, orderBy("name", "asc"));
    const categorySnapshot = await getDocs(q);
    const categoryList = categorySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as Category;
    });
    console.log(`[CategoryService] Fetched ${categoryList.length} categories.`);
    if (categoryList.length === 0) {
      console.log("[CategoryService] No categories found in Firestore. The collection might be empty or does not exist yet (it will be created on first add).");
    }
    return categoryList;
  } catch (error) {
    console.error("======================================================================");
    console.error("[CategoryService] CRITICAL ERROR FETCHING CATEGORIES FROM FIRESTORE:");
    console.error("Original Firestore Error Object:", error);
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name: ", error.name);
        console.error("[CategoryService] Firestore Error Message: ", error.message);
        // @ts-ignore
        if (error.code) {
          console.error("[CategoryService] Firestore Error Code: ", error.code);
          if (error.code === 'permission-denied') {
            console.error("[CategoryService] Hint: 'permission-denied' usually means your Firestore security rules are blocking access. Please verify them in the Firebase console for the 'categories' collection.");
          } else if (error.code === 'unimplemented') {
             console.error("[CategoryService] Hint: 'unimplemented' can mean a query requires an index that Firestore couldn't create automatically. Check if Firestore prompted for index creation in its logs or UI.");
          }
        }
    }
    console.error("======================================================================");
    throw new Error(`Failed to fetch categories. **SEE SERVER TERMINAL LOGS** for original Firestore error details (e.g., permission denied, missing indexes). Common issues are Firestore security rules or Firebase configuration.`);
  }
}

export type AddCategoryData = Omit<Category, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>;

export async function addCategory(categoryData: AddCategoryData): Promise<Category> {
  console.log('[CategoryService] Attempting to add category:', categoryData.name);
  if (!db) {
    console.error("[CategoryService] CRITICAL: Firestore db instance is not available for addCategory. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot add category.");
  }
  if (!categoryData.name || categoryData.name.trim() === "") {
    throw new Error("Category name cannot be empty.");
  }

  const trimmedName = categoryData.name.trim();
  const nameLower = trimmedName.toLowerCase();

  // Check if category already exists (case-insensitive)
  const qCheck = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", nameLower));
  try {
    const querySnapshot = await getDocs(qCheck);
    if (!querySnapshot.empty) {
      const existingCategory = querySnapshot.docs[0].data() as Category;
      console.warn(`[CategoryService] Category "${trimmedName}" already exists with ID ${querySnapshot.docs[0].id}.`);
      throw new Error(`Category "${trimmedName}" already exists.`);
    }
  } catch (checkError) {
    console.error("[CategoryService] Error checking for existing category:", checkError);
    // @ts-ignore
    if (checkError.code === 'permission-denied') {
       throw new Error("Permission denied while checking for existing categories. Verify Firestore security rules.");
    }
    // @ts-ignore
    if (checkError.code === 'failed-precondition' && checkError.message.includes('requires an index')) {
      throw new Error("Firestore query for checking existing category name requires an index. Please create it in your Firebase console. Error: " + (checkError as Error).message);
    }
    throw new Error("Failed to check for existing categories. Details: " + (checkError as Error).message);
  }


  try {
    const newCategoryPayload = {
      name: trimmedName,
      icon: categoryData.icon || '', 
      nameLower: nameLower,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), newCategoryPayload);
    console.log('[CategoryService] Category added successfully to Firestore with ID:', docRef.id);
    
    const newDocSnapshot = await getDoc(docRef);
    if (!newDocSnapshot.exists()) {
        throw new Error(`Failed to retrieve newly added category with ID ${docRef.id}.`);
    }
    const newCategoryData = newDocSnapshot.data();
    return { 
      id: newDocSnapshot.id, 
      ...newCategoryData,
      createdAt: newCategoryData.createdAt instanceof Timestamp ? newCategoryData.createdAt.toDate().toISOString() : newCategoryData.createdAt,
      updatedAt: newCategoryData.updatedAt instanceof Timestamp ? newCategoryData.updatedAt.toDate().toISOString() : newCategoryData.updatedAt,
    } as Category;

  } catch (error) {
    console.error(`[CategoryService] Error adding category "${trimmedName}" to Firestore: `, error);
     if (error instanceof Error && error.message.includes("already exists")) {
      throw error; 
    }
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (addCategory): ", error.name);
        console.error("[CategoryService] Firestore Error Message (addCategory): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (addCategory): ", error.code);
    }
    throw new Error(`Failed to add category "${trimmedName}" to Firestore. Check server logs and Firestore security rules. Details: ${(error as Error).message}`);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  console.log(`[CategoryService] Attempting to delete category ${categoryId}`);
  if (!db) {
    console.error("[CategoryService] CRITICAL: Firestore db instance is not available for deleteCategory. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot delete category.");
  }
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
    console.error("[CategoryService] CRITICAL: Firestore db instance is not available for updateCategory. Check Firebase initialization.");
    throw new Error("Firestore database is not initialized. Cannot update category.");
  }
  
  const trimmedUpdateName = updates.name ? updates.name.trim() : undefined;

  if (trimmedUpdateName === "") { // Check if name is being set to empty string
    throw new Error("Category name cannot be empty for update.");
  }

  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const updatePayload: any = { ...updates };
    
    if (trimmedUpdateName) {
      const newNameLower = trimmedUpdateName.toLowerCase();
      // Check if new name conflicts with another existing category
      const qCheck = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", newNameLower));
      const querySnapshot = await getDocs(qCheck);
      if (!querySnapshot.empty && querySnapshot.docs.some(doc => doc.id !== categoryId)) {
        throw new Error(`Another category with the name "${trimmedUpdateName}" already exists.`);
      }
      updatePayload.name = trimmedUpdateName;
      updatePayload.nameLower = newNameLower;
    }
    
    // Handle icon update: if icon is explicitly passed as undefined, it means don't change it or remove if not desired.
    // If icon is a string (even empty), update it.
    // If icon is not in updates object, it's not changed.
    if ('icon' in updates && updates.icon === undefined) {
        // If you want to allow removing icon by passing undefined, you might need a specific mechanism
        // For now, if undefined, it's not included in payload unless explicitly handled
        // For simplicity, we assume if 'icon' is in updates, it's intentional, even if empty string
    }


    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(categoryRef, updatePayload);
    console.log(`[CategoryService] Category ${categoryId} updated successfully in Firestore.`);
    
    const updatedDocSnapshot = await getDoc(categoryRef);
    if (!updatedDocSnapshot.exists()) {
        throw new Error(`Category with ID ${categoryId} not found after update.`);
    }
    const updatedCategoryData = updatedDocSnapshot.data();
    return { 
      id: updatedDocSnapshot.id, 
      ...updatedCategoryData,
      createdAt: updatedCategoryData.createdAt instanceof Timestamp ? updatedCategoryData.createdAt.toDate().toISOString() : updatedCategoryData.createdAt,
      updatedAt: updatedCategoryData.updatedAt instanceof Timestamp ? updatedCategoryData.updatedAt.toDate().toISOString() : updatedCategoryData.updatedAt,
    } as Category;
  } catch (error) {
    console.error(`[CategoryService] Error updating category ${categoryId} in Firestore: `, error);
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error; 
    }
    if (error instanceof Error) {
        console.error("[CategoryService] Firestore Error Name (updateCategory): ", error.name);
        console.error("[CategoryService] Firestore Error Message (updateCategory): ", error.message);
        // @ts-ignore
        if (error.code) console.error("[CategoryService] Firestore Error Code (updateCategory): ", error.code);
    }
    throw new Error(`Failed to update category "${trimmedUpdateName || categoryId}" in Firestore. Details: ${(error as Error).message}`);
  }
}

    