
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { PlusCircle, Edit3, Trash2, DollarSign, CreditCard, Landmark as LandmarkIcon, TrendingUp } from "lucide-react";
import type { Account, AccountType } from '@/lib/types';

// Placeholder data
const initialAccounts: Account[] = [
  { id: '1', name: 'Chase Checking', type: 'debit', balance: 5230.50, currency: 'USD', lastImported: new Date().toISOString() },
  { id: '2', name: 'Amex Gold', type: 'credit', balance: -875.20, currency: 'USD' },
  { id: '3', name: 'Savings High-Yield', type: 'savings', balance: 15000.00, currency: 'USD' },
];

const accountTypeIcons: Record<AccountType, React.ElementType> = {
  debit: DollarSign,
  credit: CreditCard,
  savings: LandmarkIcon,
  investment: TrendingUp,
};

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const { toast } = useToast();

  // Add Account State
  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<AccountType | ''>('');
  const [newInitialBalance, setNewInitialBalance] = useState('');

  // Edit Account State
  const [isEditAccountDialogOpen, setIsEditAccountDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editedAccountName, setEditedAccountName] = useState('');
  const [editedAccountBalance, setEditedAccountBalance] = useState('');
  // Note: Account type is generally not editable once transactions are associated. For simplicity, we'll allow name and balance edits.

  // Delete Account State
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);


  const handleAddAccount = () => {
    if (!newAccountName || !newAccountType) {
      toast({ title: "Error", description: "Please fill in account name and type.", variant: "destructive" });
      return;
    }
    const newId = `acc_${Date.now()}`;
    const balance = parseFloat(newInitialBalance) || 0;
    const newAcc: Account = {
      id: newId,
      name: newAccountName,
      type: newAccountType as AccountType,
      balance: newAccountType === 'credit' ? -Math.abs(balance) : Math.abs(balance),
      currency: 'USD', // Assuming USD for now
    };
    setAccounts([...accounts, newAcc]);
    toast({ title: "Success", description: `Account "${newAcc.name}" added.` });
    setNewAccountName('');
    setNewAccountType('');
    setNewInitialBalance('');
    setIsAddAccountDialogOpen(false);
  };

  const openEditDialog = (account: Account) => {
    setEditingAccount(account);
    setEditedAccountName(account.name);
    setEditedAccountBalance(String(account.type === 'credit' ? Math.abs(account.balance) : account.balance));
    setIsEditAccountDialogOpen(true);
  };

  const handleUpdateAccount = () => {
    if (!editingAccount || !editedAccountName) {
      toast({ title: "Error", description: "Account name cannot be empty.", variant: "destructive" });
      return;
    }
    const balance = parseFloat(editedAccountBalance) || 0;
    setAccounts(accounts.map(acc => 
      acc.id === editingAccount.id 
      ? { ...acc, 
          name: editedAccountName, 
          balance: acc.type === 'credit' ? -Math.abs(balance) : Math.abs(balance) 
        } 
      : acc
    ));
    toast({ title: "Success", description: `Account "${editedAccountName}" updated.` });
    setIsEditAccountDialogOpen(false);
    setEditingAccount(null);
  };

  const openDeleteConfirm = (accountId: string) => {
    setDeletingAccountId(accountId);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteAccount = () => {
    if (!deletingAccountId) return;
    const accountToDelete = accounts.find(acc => acc.id === deletingAccountId);
    setAccounts(accounts.filter(acc => acc.id !== deletingAccountId));
    toast({ title: "Success", description: `Account "${accountToDelete?.name}" deleted.`, variant: "destructive" });
    setIsDeleteConfirmOpen(false);
    setDeletingAccountId(null);
  };
  
  const resetAddAccountForm = () => {
    setNewAccountName('');
    setNewAccountType('');
    setNewInitialBalance('');
  }

  const resetEditAccountForm = () => {
    setEditedAccountName('');
    setEditedAccountBalance('');
    setEditingAccount(null);
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Accounts</h1>
        <Dialog open={isAddAccountDialogOpen} onOpenChange={(isOpen) => { setIsAddAccountDialogOpen(isOpen); if(!isOpen) resetAddAccountForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="mr-2 h-5 w-5" /> Add Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Account</DialogTitle>
              <DialogDescription>
                Enter the details for your new financial account.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="account-name" className="text-right">
                  Name
                </Label>
                <Input id="account-name" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="col-span-3" placeholder="e.g., My Checking Account" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="account-type" className="text-right">
                  Type
                </Label>
                <Select onValueChange={(value) => setNewAccountType(value as AccountType)} value={newAccountType}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit / Checking</SelectItem>
                    <SelectItem value="credit">Credit Card</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                    <SelectItem value="investment">Investment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="initial-balance" className="text-right">
                  Balance
                </Label>
                <Input id="initial-balance" type="number" value={newInitialBalance} onChange={(e) => setNewInitialBalance(e.target.value)} className="col-span-3" placeholder="e.g., 1000.00 (optional)" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" onClick={handleAddAccount}>Add Account</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <Card className="text-center py-10">
          <CardHeader>
            <LandmarkIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle className="mt-4">No Accounts Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Get started by adding your first bank account or credit card.</CardDescription>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => setIsAddAccountDialogOpen(true)}>
              <PlusCircle className="mr-2 h-5 w-5" /> Add Your First Account
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const Icon = accountTypeIcons[account.type] || DollarSign;
            return (
              <Card key={account.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-xl font-semibold">{account.name}</CardTitle>
                    <CardDescription className="capitalize">{account.type} Account</CardDescription>
                  </div>
                  <Icon className="h-6 w-6 text-primary" />
                </CardHeader>
                <CardContent className="flex-grow">
                  <div className="text-3xl font-bold text-foreground">
                    {account.balance < 0 ? '-' : ''}${Math.abs(account.balance).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">{account.currency}</span>
                  </div>
                  {account.lastImported && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last import: {new Date(account.lastImported).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4 mt-auto">
                  <Button variant="ghost" size="icon" aria-label="Edit account" onClick={() => openEditDialog(account)}>
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Delete account" onClick={() => openDeleteConfirm(account.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                     <Link href={`/transactions?accountId=${account.id}`}>View Transactions</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Account Dialog */}
      <Dialog open={isEditAccountDialogOpen} onOpenChange={(isOpen) => { setIsEditAccountDialogOpen(isOpen); if(!isOpen) resetEditAccountForm(); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update the details for {editingAccount?.name}. Account type cannot be changed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-account-name" className="text-right">
                Name
              </Label>
              <Input id="edit-account-name" value={editedAccountName} onChange={(e) => setEditedAccountName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-account-type" className="text-right">
                Type
              </Label>
              <Input id="edit-account-type" value={editingAccount?.type || ''} className="col-span-3 capitalize" disabled />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-account-balance" className="text-right">
                Balance
              </Label>
              <Input id="edit-account-balance" type="number" value={editedAccountBalance} onChange={(e) => setEditedAccountBalance(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" onClick={handleUpdateAccount}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete the account "{accounts.find(acc => acc.id === deletingAccountId)?.name}". 
              This cannot be undone and will remove all associated transactions (feature to be fully implemented).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingAccountId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

    