
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
    const errorMsg = "[CategoryService] CRITICAL: Firestore db instance is not available for getCategories. Firebase might not be initialized correctly. Check Firebase configuration (src/lib/firebase.ts) and .env.local settings. Ensure server was restarted after .env.local changes.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const categoriesCollection = collection(db, CATEGORIES_COLLECTION);
    const q = query(categoriesCollection, orderBy("name", "asc"));
    const categorySnapshot = await getDocs(q);
    const categoryList = categorySnapshot.docs.map(docSnapshot => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      } as Category;
    });
    console.log(`[CategoryService] Successfully fetched ${categoryList.length} categories.`);
    if (categoryList.length === 0) {
      console.log("[CategoryService] No categories found in Firestore. The 'categories' collection might be empty or does not exist yet (it will be created on first add).");
    }
    return categoryList;
  } catch (error) {
    console.error("======================================================================");
    console.error("[CategoryService] CRITICAL ERROR FETCHING CATEGORIES FROM FIRESTORE:");
    console.error("[CategoryService] Original Firestore Error Object (see details below):", error);
    const originalError = error as any; // To access potential 'code' property
    if (originalError instanceof Error) { // Standard Error properties
        console.error("  [CategoryService] Firestore Error Name: ", originalError.name);
        console.error("  [CategoryService] Firestore Error Message: ", originalError.message);
    }
    if (originalError.code) { // Firestore specific error code
      console.error("  [CategoryService] Firestore Error Code: ", originalError.code);
      if (originalError.code === 'permission-denied') {
        console.error("  [CategoryService] Hint: 'permission-denied' usually means your Firestore security rules are blocking access. Please verify them in the Firebase console for the 'categories' collection. Rules should be: match /categories/{categoryId} { allow read, write: if true; } for development.");
      } else if (originalError.code === 'unimplemented' || (originalError.message && originalError.message.toLowerCase().includes('index'))) {
         console.error("  [CategoryService] Hint: This error (often 'unimplemented' or mentioning 'index') means a query requires an index that Firestore couldn't create automatically (e.g., for 'orderBy(\"name\", \"asc\")'). Check if Firestore prompted for index creation in its logs or UI. The error message in server logs (Google Cloud Logging) usually contains a direct link to create the index.");
      } else if (originalError.code === 'unavailable') {
        console.error("  [CategoryService] Hint: 'unavailable' can indicate a temporary issue with Firestore services or network connectivity from your server.");
      }
    } else if (!(originalError instanceof Error)) {
      console.error("  [CategoryService] An unexpected, non-Error type was caught:", originalError);
    }
    console.error("======================================================================");
    const errorMessage = `CategoryService Error (getCategories): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules or missing indexes.`;
    throw new Error(errorMessage);
  }
}

export type AddCategoryData = Omit<Category, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>;

export async function addCategory(categoryData: AddCategoryData): Promise<Category> {
  console.log('[CategoryService] Attempting to add category:', categoryData.name);
  if (!db) {
    const errorMsg = "[CategoryService] CRITICAL: Firestore db instance is not available for addCategory. Check Firebase initialization.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  if (!categoryData.name || categoryData.name.trim() === "") {
    const validationError = "[CategoryService] Validation Error: Category name cannot be empty.";
    console.error(validationError);
    throw new Error(validationError);
  }

  const trimmedName = categoryData.name.trim();
  const nameLower = trimmedName.toLowerCase();

  const qCheck = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", nameLower));
  try {
    const querySnapshot = await getDocs(qCheck);
    if (!querySnapshot.empty) {
      const existingCategory = querySnapshot.docs[0].data() as Category;
      const duplicateError = `[CategoryService] Category "${trimmedName}" already exists with ID ${querySnapshot.docs[0].id}.`;
      console.warn(duplicateError);
      throw new Error(`Category "${trimmedName}" already exists.`);
    }
  } catch (checkError) {
    console.error("[CategoryService] Error checking for existing category:", checkError);
    const originalCheckError = checkError as any;
    const errorPrefix = `CategoryService Error (check existing category: ${trimmedName}): ${originalCheckError.name || 'Unknown Error'} (Code: ${originalCheckError.code || 'N/A'}) - ${originalCheckError.message || 'No message'}.`;
    let hint = "";
    // @ts-ignore
    if (originalCheckError.code === 'permission-denied') {
       hint = " Hint: Permission denied while checking for existing categories. Verify Firestore security rules.";
    } else if (originalCheckError.code === 'failed-precondition' && originalCheckError.message && originalCheckError.message.includes('requires an index')) {
      hint = " Hint: Firestore query for checking existing category name requires an index (on 'nameLower'). Please create it in your Firebase console.";
    }
    throw new Error(`${errorPrefix}${hint} **CHECK SERVER LOGS for full details.**`);
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
        const fetchError = `[CategoryService] Failed to retrieve newly added category with ID ${docRef.id}.`;
        console.error(fetchError);
        throw new Error(fetchError);
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
      throw error; // Re-throw the specific "already exists" error
    }
    const originalError = error as any;
    const errorMessage = `CategoryService Error (addCategory: ${trimmedName}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export async function deleteCategory(categoryId: string): Promise<void> {
  console.log(`[CategoryService] Attempting to delete category ${categoryId}`);
  if (!db) {
    const errorMsg = "[CategoryService] CRITICAL: Firestore db instance is not available for deleteCategory. Check Firebase initialization.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    await deleteDoc(categoryRef);
    console.log(`[CategoryService] Category ${categoryId} deleted successfully from Firestore.`);
  } catch (error) {
    console.error(`[CategoryService] Error deleting category ${categoryId} from Firestore: `, error);
    const originalError = error as any;
    const errorMessage = `CategoryService Error (deleteCategory: ${categoryId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export async function updateCategory(categoryId: string, updates: Partial<Omit<Category, 'id' | 'nameLower' | 'createdAt' | 'updatedAt'>> & { name?: string }): Promise<Category> {
  console.log(`[CategoryService] Attempting to update category ${categoryId} with:`, updates);
  if (!db) {
    const errorMsg = "[CategoryService] CRITICAL: Firestore db instance is not available for updateCategory. Check Firebase initialization.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  const trimmedUpdateName = updates.name ? updates.name.trim() : undefined;

  if (updates.name !== undefined && trimmedUpdateName === "") { 
    const validationError = "[CategoryService] Validation Error: Category name cannot be empty for update.";
    console.error(validationError);
    throw new Error(validationError);
  }

  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const updatePayload: any = { ...updates };
    
    if (trimmedUpdateName && updates.name) { 
      const newNameLower = trimmedUpdateName.toLowerCase();
      const qCheck = query(collection(db, CATEGORIES_COLLECTION), where("nameLower", "==", newNameLower));
      const querySnapshot = await getDocs(qCheck);
      if (!querySnapshot.empty && querySnapshot.docs.some(doc => doc.id !== categoryId)) {
        const duplicateError = `[CategoryService] Another category with the name "${trimmedUpdateName}" already exists.`;
        console.warn(duplicateError);
        throw new Error(`Another category with the name "${trimmedUpdateName}" already exists.`);
      }
      updatePayload.name = trimmedUpdateName;
      updatePayload.nameLower = newNameLower;
    } else if (updates.name === undefined && 'name' in updates) {
        // If name is explicitly set to undefined in updates, it's a problem unless we want to allow unnamed categories (which we don't)
        // If 'name' is not in updates, it means it's not being changed, so we don't touch updatePayload.name or nameLower
        delete updatePayload.name; // remove if it was set to undefined
    }
    
    if (!('icon' in updates)) {
        delete updatePayload.icon;
    }

    updatePayload.updatedAt = serverTimestamp();

    await updateDoc(categoryRef, updatePayload);
    console.log(`[CategoryService] Category ${categoryId} updated successfully in Firestore.`);
    
    const updatedDocSnapshot = await getDoc(categoryRef);
    if (!updatedDocSnapshot.exists()) {
        const fetchError = `[CategoryService] Category with ID ${categoryId} not found after update.`;
        console.error(fetchError);
        throw new Error(fetchError);
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
    const originalError = error as any;
    const errorMessage = `CategoryService Error (updateCategory: ${categoryId}): ${originalError.name || 'Unknown Error'} (Code: ${originalError.code || 'N/A'}) - ${originalError.message || 'No message'}. **CHECK SERVER LOGS (Google Cloud Logging for Firebase App Hosting) for full details.** Common issues: Firestore security rules.`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}
