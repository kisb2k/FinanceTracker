
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PlusCircle, Upload, Filter, MoreHorizontal, Trash2, Edit3, Copy, Tag, Search } from "lucide-react";
import type { Transaction, Account, Category } from '@/lib/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

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

const categoriesData: Category[] = [
  { id: 'c1', name: 'Food & Drink' },
  { id: 'c2', name: 'Income' },
  { id: 'c3', name: 'Entertainment' },
  { id: 'c4', name: 'Groceries' },
  { id: 'c5', name: 'Utilities' },
  { id: 'c6', name: 'Uncategorized' },
];

interface EditFormState {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  category: string;
}

const defaultEditFormState: EditFormState = {
  id: '',
  accountId: '',
  date: '',
  description: '',
  amount: '',
  category: 'Uncategorized',
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all'); // Renamed to avoid conflict

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editFormState, setEditFormState] = useState<EditFormState>(defaultEditFormState);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (editingTransaction) {
      setEditFormState({
        id: editingTransaction.id,
        accountId: editingTransaction.accountId,
        date: editingTransaction.date.split('T')[0], // Format for date input
        description: editingTransaction.description,
        amount: String(editingTransaction.amount),
        category: editingTransaction.category || 'Uncategorized',
      });
    } else {
      setEditFormState(defaultEditFormState);
    }
  }, [editingTransaction]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || (tx.category && tx.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesAccount = selectedAccount === 'all' || tx.accountId === selectedAccount;
      const matchesCategory = selectedCategoryFilter === 'all' || tx.category === categoriesData.find(c => c.id === selectedCategoryFilter)?.name;
      return matchesSearch && matchesAccount && matchesCategory;
    });
  }, [transactions, searchTerm, selectedAccount, selectedCategoryFilter]);

  const getAccountName = (accountId: string) => accounts.find(acc => acc.id === accountId)?.name || 'Unknown Account';

  const handleRemoveDuplicates = () => {
    const uniqueTransactions: Transaction[] = [];
    const seen = new Set<string>();
    let duplicateCount = 0;

    transactions.forEach(tx => {
      const key = `${tx.date}-${tx.description.toLowerCase()}-${tx.amount.toFixed(2)}`;
      if (!seen.has(key)) {
        uniqueTransactions.push(tx);
        seen.add(key);
      } else {
        duplicateCount++;
      }
    });
    if (duplicateCount > 0) {
        // For now, just show an alert. Actual removal can be complex.
        // setTransactions(uniqueTransactions);
        // toast({ title: "Duplicates Found", description: `${duplicateCount} potential duplicates identified. UI for removal TBD.`});
        alert(`Identified ${duplicateCount} potential duplicates. (UI for selective removal TBD)`);
    } else {
        toast({ title: "No Duplicates", description: "No obvious duplicate transactions found."});
    }
  };

  const handleOpenEditDialog = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormState(prev => ({ ...prev, [name]: value }));
  };
  
  const handleEditCategoryChange = (value: string) => {
     setEditFormState(prev => ({ ...prev, category: value}));
  }

  const handleSaveTransaction = () => {
    if (!editingTransaction) return;

    const amountValue = parseFloat(editFormState.amount);
    if (isNaN(amountValue)) {
      toast({ title: "Error", description: "Invalid amount.", variant: "destructive" });
      return;
    }

    const updatedTransaction: Transaction = {
      ...editingTransaction,
      date: new Date(editFormState.date).toISOString(),
      description: editFormState.description,
      amount: amountValue,
      category: editFormState.category,
      isDebit: amountValue < 0, // Update isDebit based on amount sign
    };

    setTransactions(prev => prev.map(tx => tx.id === updatedTransaction.id ? updatedTransaction : tx));
    toast({ title: "Success", description: "Transaction updated successfully." });
    setIsEditDialogOpen(false);
    setEditingTransaction(null);
  };

  const handleOpenDeleteDialog = (transactionId: string) => {
    setDeletingTransactionId(transactionId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteTransaction = () => {
    if (!deletingTransactionId) return;
    const txToDelete = transactions.find(tx => tx.id === deletingTransactionId);
    setTransactions(prev => prev.filter(tx => tx.id !== deletingTransactionId));
    toast({ title: "Success", description: `Transaction "${txToDelete?.description}" deleted.`, variant: "destructive" });
    setIsDeleteDialogOpen(false);
    setDeletingTransactionId(null);
  };
  
  const resetEditDialog = () => {
    setEditingTransaction(null);
    setEditFormState(defaultEditFormState);
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
            <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categoriesData.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
              </SelectContent>
            </Select>
             <Button variant="outline" onClick={() => { setSearchTerm(''); setSelectedAccount('all'); setSelectedCategoryFilter('all');}}>
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
                  <TableCell className={`text-right font-semibold ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount >= 0 ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
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
                        <DropdownMenuItem onClick={() => handleOpenEditDialog(tx)}>
                            <Edit3 className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleOpenDeleteDialog(tx.id)}>
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

      {/* Edit Transaction Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => { setIsEditDialogOpen(isOpen); if (!isOpen) resetEditDialog(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              Update the details of your transaction. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          {editingTransaction && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-date" className="text-right">Date</Label>
                <Input id="edit-date" name="date" type="date" value={editFormState.date} onChange={handleEditFormChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-description" className="text-right">Description</Label>
                <Input id="edit-description" name="description" value={editFormState.description} onChange={handleEditFormChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-amount" className="text-right">Amount</Label>
                <Input id="edit-amount" name="amount" type="number" step="0.01" value={editFormState.amount} onChange={handleEditFormChange} className="col-span-3" placeholder="e.g., -25.50 or 100" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-category" className="text-right">Category</Label>
                <Select name="category" value={editFormState.category} onValueChange={handleEditCategoryChange}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesData.map(cat => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-account" className="text-right">Account</Label>
                <Input id="edit-account" value={getAccountName(editFormState.accountId)} className="col-span-3" disabled />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSaveTransaction}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete the transaction: "{transactions.find(tx => tx.id === deletingTransactionId)?.description}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingTransactionId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTransaction} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mt-4 flex justify-end">
        {/* Add pagination if needed */}
      </div>
    </div>
  );
}

