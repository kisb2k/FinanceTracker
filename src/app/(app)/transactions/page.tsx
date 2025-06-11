
'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PlusCircle, Upload, Filter, MoreHorizontal, Trash2, Edit3, Copy, Tag, Search, Loader2, AlertCircle, FolderPlus, Settings2 } from "lucide-react";
import type { Transaction, Account, Category } from '@/lib/types';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAccounts } from '@/services/accountService';
import { getCategories, addCategory, deleteCategory as deleteCategoryService } from '@/services/categoryService';
import { getTransactions, addTransaction, updateTransaction, deleteTransaction as deleteTransactionService } from '@/services/transactionService';
import { format } from 'date-fns';

interface EditFormState {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  category: string; // Stores category NAME for select, or new name
}

const defaultAddTransactionData = {
  accountId: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  amount: '',
  category: '', // Store category NAME
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  const [isAddTransactionDialogOpen, setIsAddTransactionDialogOpen] = useState(false);
  const [newTransactionData, setNewTransactionData] = useState(defaultAddTransactionData);

  const [isEditTransactionDialogOpen, setIsEditTransactionDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editFormState, setEditFormState] = useState<EditFormState>({ id: '', accountId: '', date: '', description: '', amount: '', category: '' });

  const [isDeleteTransactionDialogOpen, setIsDeleteTransactionDialogOpen] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);

  const [isManageCategoriesDialogOpen, setIsManageCategoriesDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isDeletingCategory, setIsDeletingCategory] = useState<Category | null>(null);


  const { toast } = useToast();

  const fetchPageData = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);
    try {
      const [fetchedAccounts, fetchedCategories, fetchedTransactions] = await Promise.all([
        getAccounts(),
        getCategories(),
        getTransactions()
      ]);
      setAccounts(fetchedAccounts || []);
      setCategories(fetchedCategories || []);
      setTransactions(fetchedTransactions || []);
    } catch (e) {
      const errorMsg = (e as Error).message || "Failed to load page data. Check console for details.";
      setPageError(errorMsg);
      console.error("Error fetching page data for Transactions:", e);
      toast({ title: "Error Loading Data", description: errorMsg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useEffect(() => {
    if (editingTransaction) {
      setEditFormState({
        id: editingTransaction.id,
        accountId: editingTransaction.accountId,
        date: editingTransaction.date ? format(new Date(editingTransaction.date), 'yyyy-MM-dd') : '',
        description: editingTransaction.description,
        amount: String(editingTransaction.amount),
        category: editingTransaction.category || '', // Use category name
      });
    }
  }, [editingTransaction]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const accountName = accounts.find(acc => acc.id === tx.accountId)?.name || '';
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        tx.description.toLowerCase().includes(searchLower) ||
        (tx.category && tx.category.toLowerCase().includes(searchLower)) ||
        accountName.toLowerCase().includes(searchLower);
      const matchesAccount = selectedAccountFilter === 'all' || tx.accountId === selectedAccountFilter;
      const matchesCategory = selectedCategoryFilter === 'all' || tx.category === categories.find(c => c.id === selectedCategoryFilter)?.name;
      return matchesSearch && matchesAccount && matchesCategory;
    });
  }, [transactions, searchTerm, selectedAccountFilter, selectedCategoryFilter, accounts, categories]);

  const getAccountName = (accountId: string) => accounts.find(acc => acc.id === accountId)?.name || 'Unknown Account';

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, setState: Function) => {
    const { name, value } = e.target;
    setState((prev: any) => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (name: string, value: string, setState: Function) => {
     setState((prev: any) => ({ ...prev, [name]: value}));
  };

  const handleAddTransactionSubmit = async () => {
    const amountValue = parseFloat(newTransactionData.amount);
    if (!newTransactionData.accountId || !newTransactionData.date || !newTransactionData.description || isNaN(amountValue) || !newTransactionData.category) {
      toast({ title: "Validation Error", description: "Please fill all fields: Account, Date, Description, valid Amount, and Category.", variant: "destructive" });
      return;
    }
    if (accounts.length === 0) {
        toast({ title: "Action Required", description: "Please add at least one account before adding transactions.", variant: "destructive" });
        return;
    }
    if (categories.length === 0) {
        toast({ title: "Action Required", description: "Please add at least one category before adding transactions.", variant: "destructive" });
        return;
    }
    
    try {
      const newTx = await addTransaction({
        accountId: newTransactionData.accountId,
        date: newTransactionData.date, 
        description: newTransactionData.description,
        amount: amountValue,
        category: newTransactionData.category, 
      });
      setTransactions(prev => [newTx, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      toast({ title: "Success", description: "Transaction added successfully." });
      setIsAddTransactionDialogOpen(false);
      setNewTransactionData(defaultAddTransactionData);
    } catch (e) {
      toast({ title: "Error Adding Transaction", description: (e as Error).message || "Failed to add transaction.", variant: "destructive" });
    }
  };

  const handleOpenEditDialog = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditTransactionDialogOpen(true);
  };

  const handleEditTransactionSubmit = async () => {
    if (!editingTransaction) return;

    const amountValue = parseFloat(editFormState.amount);
    if (!editFormState.accountId || !editFormState.date || !editFormState.description || isNaN(amountValue) || !editFormState.category) {
      toast({ title: "Validation Error", description: "Please fill all fields: Account, Date, Description, valid Amount, and Category.", variant: "destructive" });
      return;
    }
    
    try {
      const updatedTx = await updateTransaction(editingTransaction.id, {
        accountId: editFormState.accountId,
        date: editFormState.date, 
        description: editFormState.description,
        amount: amountValue,
        category: editFormState.category, 
      });
      setTransactions(prev => prev.map(tx => tx.id === updatedTx.id ? updatedTx : tx).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      toast({ title: "Success", description: "Transaction updated successfully." });
      setIsEditTransactionDialogOpen(false);
      setEditingTransaction(null);
    } catch (e) {
      toast({ title: "Error Updating Transaction", description: (e as Error).message || "Failed to update transaction.", variant: "destructive" });
    }
  };

  const handleOpenDeleteDialog = (transactionId: string) => {
    setDeletingTransactionId(transactionId);
    setIsDeleteTransactionDialogOpen(true);
  };

  const handleDeleteTransactionConfirm = async () => {
    if (!deletingTransactionId) return;
    const txToDelete = transactions.find(tx => tx.id === deletingTransactionId);
    try {
      await deleteTransactionService(deletingTransactionId);
      setTransactions(prev => prev.filter(tx => tx.id !== deletingTransactionId));
      toast({ title: "Success", description: `Transaction "${txToDelete?.description}" deleted.`, variant: "destructive" });
      setIsDeleteTransactionDialogOpen(false);
      setDeletingTransactionId(null);
    } catch (e) {
       toast({ title: "Error Deleting Transaction", description: (e as Error).message || "Failed to delete transaction.", variant: "destructive" });
    }
  };

  const handleAddCategorySubmit = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Validation Error", description: "Category name cannot be empty.", variant: "destructive" });
      return;
    }
    try {
      const newCat = await addCategory({ name: newCategoryName.trim() });
      setCategories(prev => [...prev, newCat].sort((a,b) => a.name.localeCompare(b.name)));
      toast({ title: "Success", description: `Category "${newCat.name}" added.`});
      setNewCategoryName('');
    } catch (e) {
      toast({ title: "Error Adding Category", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!isDeletingCategory) return;
    try {
      await deleteCategoryService(isDeletingCategory.id);
      // Optimistically remove from UI, also remove from category filter if it was selected
      if (selectedCategoryFilter === isDeletingCategory.id) {
        setSelectedCategoryFilter('all');
      }
      setCategories(prev => prev.filter(cat => cat.id !== isDeletingCategory.id));
      toast({ title: "Success", description: `Category "${isDeletingCategory.name}" deleted.`, variant: "destructive" });
      setIsDeletingCategory(null);
    } catch (e) {
      toast({ title: "Error Deleting Category", description: (e as Error).message, variant: "destructive" });
    }
  };
  
  const resetAddTransactionDialog = () => setNewTransactionData(defaultAddTransactionData);
  const resetEditTransactionDialog = () => setEditingTransaction(null);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading transactions data...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <Card className="text-center py-10 border-destructive">
        <CardHeader>
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <CardTitle className="mt-4 text-destructive">Error Loading Data</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-destructive-foreground">{pageError}</CardDescription>
        </CardContent>
        <CardFooter className="justify-center">
          <Button onClick={fetchPageData}>
            <PlusCircle className="mr-2 h-5 w-5" /> Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Transactions</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setIsManageCategoriesDialogOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" /> Manage Categories
          </Button>
           <Button onClick={() => setIsAddTransactionDialogOpen(true)} disabled={accounts.length === 0 || categories.length === 0}>
            <FolderPlus className="mr-2 h-4 w-4" /> Add Transaction
          </Button>
          <Button variant="outline" asChild>
            <Link href="/transactions/import">
              <Upload className="mr-2 h-4 w-4" /> Import File
            </Link>
          </Button>
        </div>
        {(accounts.length === 0 || categories.length === 0) && !isLoading && (
            <p className="text-sm text-muted-foreground w-full sm:w-auto text-center sm:text-left">
                Please {accounts.length === 0 ? 'add accounts' : ''}
                {accounts.length === 0 && categories.length === 0 ? ' and ' : ''}
                {categories.length === 0 ? 'create categories' : ''} to start adding transactions.
            </p>
        )}
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search descriptions, categories, accounts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={selectedAccountFilter} onValueChange={setSelectedAccountFilter} disabled={accounts.length === 0}>
              <SelectTrigger><SelectValue placeholder="Filter by Account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter} disabled={categories.length === 0}>
              <SelectTrigger><SelectValue placeholder="Filter by Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
              </SelectContent>
            </Select>
             <Button variant="outline" onClick={() => { setSearchTerm(''); setSelectedAccountFilter('all'); setSelectedCategoryFilter('all');}}>
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
                  <TableCell>{tx.date ? format(new Date(tx.date), 'MM/dd/yyyy') : 'N/A'}</TableCell>
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
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEditDialog(tx)}><Edit3 className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
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
                    {isLoading ? 'Loading transactions...' : 'No transactions found. Try adjusting your filters or add a new transaction.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Transaction Dialog */}
      <Dialog open={isAddTransactionDialogOpen} onOpenChange={(isOpen) => { setIsAddTransactionDialogOpen(isOpen); if (!isOpen) resetAddTransactionDialog(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Add New Transaction</DialogTitle><DialogDescription>Enter the details for your new transaction.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-accountId" className="text-right">Account</Label>
              {accounts.length > 0 ? (
                <Select name="accountId" value={newTransactionData.accountId} onValueChange={(value) => handleSelectChange("accountId", value, setNewTransactionData)}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select an account" /></SelectTrigger>
                  <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : <p className="col-span-3 text-sm text-muted-foreground">No accounts available. Please add an account first.</p>}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-date" className="text-right">Date</Label>
              <Input id="add-date" name="date" type="date" value={newTransactionData.date} onChange={(e) => handleFormChange(e, setNewTransactionData)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-description" className="text-right">Description</Label>
              <Input id="add-description" name="description" value={newTransactionData.description} onChange={(e) => handleFormChange(e, setNewTransactionData)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-amount" className="text-right">Amount</Label>
              <Input id="add-amount" name="amount" type="number" step="0.01" value={newTransactionData.amount} onChange={(e) => handleFormChange(e, setNewTransactionData)} className="col-span-3" placeholder="e.g., -25.50 or 100" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-category" className="text-right">Category</Label>
              {categories.length > 0 ? (
                <Select name="category" value={newTransactionData.category} onValueChange={(value) => handleSelectChange("category", value, setNewTransactionData)}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>{categories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}</SelectContent>
                </Select>
              ): <p className="col-span-3 text-sm text-muted-foreground">No categories available. Please add a category first.</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleAddTransactionSubmit} disabled={accounts.length === 0 || categories.length === 0}>Add Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={isEditTransactionDialogOpen} onOpenChange={(isOpen) => { setIsEditTransactionDialogOpen(isOpen); if (!isOpen) resetEditTransactionDialog(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle><DialogDescription>Update transaction details.</DialogDescription></DialogHeader>
          {editingTransaction && (
            <div className="grid gap-4 py-4">
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-accountId" className="text-right">Account</Label>
                {accounts.length > 0 ? (
                  <Select name="accountId" value={editFormState.accountId} onValueChange={(value) => handleSelectChange("accountId", value, setEditFormState)}>
                    <SelectTrigger className="col-span-3"><SelectValue placeholder="Select an account" /></SelectTrigger>
                    <SelectContent>{accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <p className="col-span-3 text-sm text-muted-foreground">No accounts available.</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-date" className="text-right">Date</Label>
                <Input id="edit-date" name="date" type="date" value={editFormState.date} onChange={(e) => handleFormChange(e, setEditFormState)} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-description" className="text-right">Description</Label>
                <Input id="edit-description" name="description" value={editFormState.description} onChange={(e) => handleFormChange(e, setEditFormState)} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-amount" className="text-right">Amount</Label>
                <Input id="edit-amount" name="amount" type="number" step="0.01" value={editFormState.amount} onChange={(e) => handleFormChange(e, setEditFormState)} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-category" className="text-right">Category</Label>
                 {categories.length > 0 ? (
                    <Select name="category" value={editFormState.category} onValueChange={(value) => handleSelectChange("category", value, setEditFormState)}>
                      <SelectTrigger className="col-span-3"><SelectValue placeholder="Select a category" /></SelectTrigger>
                      <SelectContent>{categories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}</SelectContent>
                    </Select>
                 ) : <p className="col-span-3 text-sm text-muted-foreground">No categories available.</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleEditTransactionSubmit} disabled={accounts.length === 0 || categories.length === 0}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Confirmation Dialog */}
      <AlertDialog open={isDeleteTransactionDialogOpen} onOpenChange={setIsDeleteTransactionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>This action will permanently delete the transaction: "{transactions.find(tx => tx.id === deletingTransactionId)?.description}". This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingTransactionId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTransactionConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Transaction</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

       {/* Manage Categories Dialog */}
      <Dialog open={isManageCategoriesDialogOpen} onOpenChange={setIsManageCategoriesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Manage Categories</DialogTitle><DialogDescription>Add or remove spending categories.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              <Button onClick={handleAddCategorySubmit}><PlusCircle className="mr-2 h-4 w-4" /> Add</Button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-md p-2">
              {categories.length > 0 ? categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                  <span>{cat.name}</span>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setIsDeletingCategory(cat)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-2">No categories yet. Add one above.</p>}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <AlertDialog open={!!isDeletingCategory} onOpenChange={(open) => !open && setIsDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Category: {isDeletingCategory?.name}?</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to delete this category? This action cannot be undone. Transactions using this category will NOT be automatically re-categorized.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeletingCategory(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategoryConfirm} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
