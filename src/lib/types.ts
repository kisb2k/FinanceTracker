export type AccountType = 'debit' | 'credit' | 'savings' | 'investment';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number; // This would typically be calculated or fetched
  currency: string; // e.g., 'USD'
  lastImported?: string; // ISO date string
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // ISO date string
  description: string;
  amount: number; // Positive for income/credit, negative for expenses/debit
  category?: string; // Category ID or name
  fileName?: string;
  loadDateTime?: string; // ISO date string
  isDebit: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon?: string; // Lucide icon name or SVG string
}

export interface BudgetCategoryLimit {
  categoryId: string;
  limit: number;
}

export interface Budget {
  id:string;
  name: string;
  isDefault: boolean;
  timePeriod: 'monthly' | 'quarterly' | 'yearly'; // Or custom start/end dates
  categoryLimits: BudgetCategoryLimit[];
  totalBudgetAmount?: number; // Optional: overall budget limit
}
