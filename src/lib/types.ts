
export type AccountType = 'debit' | 'credit' | 'savings' | 'investment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  lastImported?: string; // ISO string date
  createdAt?: string | Date; 
  updatedAt?: string | Date;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; 
  description: string;
  amount: number;
  category: string; 
  isDebit: boolean;
  fileName?: string; 
  loadDateTime?: string; // ISO string date
  uploadedBy?: string; 
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Category {
  id: string;
  name: string;
  nameLower?: string; 
  icon?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface BudgetCategoryLimit {
  categoryId: string; 
  limit: number;
}

export interface Budget {
  id:string;
  name: string;
  isDefault: boolean;
  timePeriod: 'monthly' | 'yearly'; 
  categoryLimits: BudgetCategoryLimit[];
  totalBudgetAmount?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
