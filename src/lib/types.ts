
export type AccountType = 'debit' | 'credit' | 'savings' | 'investment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number; 
  currency: string; 
  lastImported?: string; 
  createdAt?: string | Date; // Keep as string for ISO dates from Firestore or Date for serverTimestamp
  updatedAt?: string | Date;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // Should be YYYY-MM-DD string for input, stored as ISO string or Timestamp
  description: string;
  amount: number; 
  category: string; // Store category NAME
  isDebit: boolean;
  fileName?: string; // From import
  loadDateTime?: string; // From import
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Category {
  id: string;
  name: string;
  nameLower?: string; // For case-insensitive checks
  icon?: string; 
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BudgetCategoryLimit {
  categoryId: string; // Links to Category.id
  limit: number;
}

export interface Budget {
  id:string;
  name: string;
  isDefault: boolean;
  timePeriod: 'monthly' | 'yearly'; // Simplified from 'quarterly'
  categoryLimits: BudgetCategoryLimit[];
  totalBudgetAmount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
