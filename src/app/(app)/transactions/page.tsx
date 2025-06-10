
'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Upload, Filter, MoreHorizontal, Trash2, Edit3, Copy, Tag, Search } from "lucide-react";
import type { Transaction, Account, Category } from '@/lib/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

// Placeholder data
const initialTransactions: Transaction[] = [
  { id: 't1', accountId: '1', date: '2024-07-28', description: 'Starbucks Coffee', amount: -5.75, category: 'Food & Drink', isDebit: true, fileName: 'chase_import_07_2024.csv', loadDateTime: new Date().toISOString() },
  { id: 't2', accountId: '1', date: '2024-07-27', description: 'Monthly Salary', amount: 3200.00, category: 'Income', isDebit: false, fileName: 'chase_import_07_2024.csv', loadDateTime: new Date().toISOString() },
  { id: 't3', accountId: '2', date: '2024-07-26', description: 'Netflix Subscription', amount: -15.99, category: 'Entertainment', isDebit: true, fileName: 'amex_import_07_2024.csv', loadDateTime: new Date().toISOString() },
  { id: 't4', accountId: '1', date: '2024-07-25', description: 'Groceries Whole Foods', amount: -85.20, category: 'Groceries', isDebit: true, fileName: 'chase_import_07_2024.csv', loadDateTime: new Date().toISOString() },
  { id: 't5', accountId: '1', date: '2024-07-25', description: 'Groceries Whole Foods', amount: -85.20, category: 'Groceries', isDebit: true, fileName: 'manual_entry.csv', loadDateTime: new Date(Date.now() - 86400000).toISOString() }, // Potential duplicate
];

const accounts: Account[] = [
  { id: '1', name: 'Chase Checking', type: 'debit', balance: 0, currency: 'USD' },
  { id: '2', name: 'Amex Gold', type: 'credit', balance: 0, currency: 'USD' },
];

const categories: Category[] = [
  { id: 'c1', name: 'Food & Drink' },
  { id: 'c2', name: 'Income' },
  { id: 'c3', name: 'Entertainment' },
  { id: 'c4', name: 'Groceries' },
  { id: 'c5', name: 'Utilities' },
  { id: 'c6', name: 'Uncategorized' },
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || (tx.category && tx.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesAccount = selectedAccount === 'all' || tx.accountId === selectedAccount;
      const matchesCategory = selectedCategory === 'all' || tx.category === categories.find(c => c.id === selectedCategory)?.name;
      return matchesSearch && matchesAccount && matchesCategory;
    });
  }, [transactions, searchTerm, selectedAccount, selectedCategory, categories]);

  const getAccountName = (accountId: string) => accounts.find(acc => acc.id === accountId)?.name || 'Unknown Account';

  const handleRemoveDuplicates = () => {
    // Basic duplicate detection: same description, amount, date
    const uniqueTransactions: Transaction[] = [];
    const seen = new Set<string>();

    transactions.forEach(tx => {
      const key = `${tx.date}-${tx.description.toLowerCase()}-${tx.amount.toFixed(2)}`;
      if (!seen.has(key)) {
        uniqueTransactions.push(tx);
        seen.add(key);
      }
    });
    // In a real app, you'd confirm with the user or show duplicates
    // setTransactions(uniqueTransactions); 
    alert(`Identified ${transactions.length - uniqueTransactions.length} potential duplicates. (UI for removal TBD)`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Transactions</h1>
        <div className="flex gap-2">
           <Button variant="outline" onClick={handleRemoveDuplicates}>
            <Copy className="mr-2 h-4 w-4" /> Remove Duplicates
          </Button>
          <Button asChild>
            <Link href="/transactions/import">
              <Upload className="mr-2 h-4 w-4" /> Import Transactions
            </Link>
          </Button>
        </div>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search descriptions, categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
              </SelectContent>
            </Select>
             <Button variant="outline" onClick={() => { setSearchTerm(''); setSelectedAccount('all'); setSelectedCategory('all');}}>
                Clear Filters
             </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length > 0 ? filteredTransactions.map((tx) => (
                <TableRow key={tx.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>{new Date(tx.date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium max-w-xs truncate" title={tx.description}>{tx.description}</TableCell>
                  <TableCell>{getAccountName(tx.accountId)}</TableCell>
                  <TableCell>
                    <Badge variant={tx.category === 'Uncategorized' || !tx.category ? "destructive" : "secondary"}>
                      {tx.category || 'Uncategorized'}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {tx.isDebit ? 
                      <Badge variant="outline" className="text-red-600 border-red-600/50">Debit</Badge> : 
                      <Badge variant="outline" className="text-green-600 border-green-600/50">Credit</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem><Edit3 className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem><Tag className="mr-2 h-4 w-4" /> Change Category</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No transactions found. Try adjusting your filters or importing new data.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end">
        {/* Add pagination if needed */}
      </div>
    </div>
  );
}
