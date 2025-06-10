
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Edit3, Trash2, Target, AlertTriangle, FileText, Loader2, AlertCircleIcon } from "lucide-react";
import type { Budget, Category, BudgetCategoryLimit } from '@/lib/types';
import { getBudgets, addBudget, updateBudget, deleteBudget, type AddBudgetData } from '@/services/budgetService';
import { useToast } from '@/hooks/use-toast';

// Kept as a predefined list for now. Could be fetched from Firestore in the future.
const initialCategories: Category[] = [
  { id: 'c1', name: 'Food & Drink' },
  { id: 'c2', name: 'Groceries' },
  { id: 'c3', name: 'Transportation' },
  { id: 'c4', name: 'Housing' },
  { id: 'c5', name: 'Entertainment' },
  { id: 'c6', name: 'Shopping' },
  { id: 'c7', name: 'Utilities' },
  { id: 'c8', name: 'Healthcare' },
  { id: 'c9', name: 'Personal Care' },
  { id: 'c10', name: 'Education' },
  { id: 'c11', name: 'Gifts & Donations' },
  { id: 'c12', name: 'Other' },
];

// Simulated current spending. This would ideally come from actual transaction data.
// For now, progress bars will show 0% until this is integrated.
const currentSpending: Record<string, Record<string, number>> = {};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Partial<Budget> & { tempCategoryLimits?: BudgetCategoryLimit[] } | null>(null);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);


  useEffect(() => {
    fetchBudgets();
  }, []);

  const fetchBudgets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedBudgets = await getBudgets();
      setBudgets(fetchedBudgets);
    } catch (e) {
      setError((e as Error).message || "Failed to load budgets.");
      toast({ title: "Error", description: "Could not fetch budgets.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const resetBudgetForm = () => {
    setEditingBudget(null);
  };

  const openBudgetDialog = (budgetToEdit?: Budget) => {
    if (budgetToEdit) {
      setEditingBudget({ 
        ...budgetToEdit, 
        tempCategoryLimits: budgetToEdit.categoryLimits ? [...budgetToEdit.categoryLimits] : [] 
      });
    } else {
      setEditingBudget({ isDefault: false, timePeriod: 'monthly', tempCategoryLimits: [] });
    }
    setIsBudgetDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!editingBudget || !editingBudget.name || !editingBudget.timePeriod || !editingBudget.tempCategoryLimits) {
      toast({ title: "Validation Error", description: "Please fill in name, time period, and at least one category limit.", variant: "destructive" });
      return;
    }

    const totalBudget = editingBudget.tempCategoryLimits.reduce((sum, cl) => sum + (cl.limit || 0), 0);
    
    const budgetDataPayload = {
      name: editingBudget.name!,
      isDefault: editingBudget.isDefault || false,
      timePeriod: editingBudget.timePeriod!,
      categoryLimits: editingBudget.tempCategoryLimits!,
      totalBudgetAmount: totalBudget,
    };

    try {
      if (editingBudget.id) { // Editing existing budget
        await updateBudget(editingBudget.id, budgetDataPayload);
        setBudgets(budgets.map(b => b.id === editingBudget!.id ? { ...b, ...budgetDataPayload, id: editingBudget!.id } as Budget : b).sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "Success", description: `Budget "${budgetDataPayload.name}" updated.` });
      } else { // Adding new budget
        const newBudget = await addBudget(budgetDataPayload as AddBudgetData);
        setBudgets(prev => [...prev, newBudget].sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "Success", description: `Budget "${newBudget.name}" created.` });
      }
      resetBudgetForm();
      setIsBudgetDialogOpen(false);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Failed to save budget.", variant: "destructive" });
    }
  };
  
  const handleCategoryLimitChange = (categoryId: string, limitStr: string) => {
    if (!editingBudget) return;
    const limit = parseFloat(limitStr) || 0; // Treat empty or invalid as 0

    setEditingBudget(prev => {
      if (!prev) return null;
      const existingLimits = prev.tempCategoryLimits || [];
      let newLimits = existingLimits.filter(cl => cl.categoryId !== categoryId);
      
      // Only add/update if the category is intended to be part of the budget
      // This means if a user types then erases, it should effectively remove it or set to 0
      // The check for limit > 0 has been removed to allow zero limits.
      // Consider if a 0 limit means "not budgeted" or "budgeted at $0". For now, it's kept.
      newLimits.push({ categoryId, limit });
      
      return { 
        ...prev, 
        tempCategoryLimits: newLimits.sort((a,b) => 
          initialCategories.findIndex(c=>c.id===a.categoryId) - initialCategories.findIndex(c=>c.id===b.categoryId)
        ) 
      };
    });
  };

  const openDeleteDialog = (budgetId: string) => {
    setDeletingBudgetId(budgetId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteBudget = async () => {
    if (!deletingBudgetId) return;
    const budgetToDelete = budgets.find(b => b.id === deletingBudgetId);
    try {
      await deleteBudget(deletingBudgetId);
      setBudgets(budgets.filter(b => b.id !== deletingBudgetId));
      toast({ title: "Success", description: `Budget "${budgetToDelete?.name}" deleted.`, variant: "destructive" });
      setIsDeleteDialogOpen(false);
      setDeletingBudgetId(null);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Failed to delete budget.", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading budgets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-10 border-destructive">
        <CardHeader>
          <AlertCircleIcon className="mx-auto h-12 w-12 text-destructive" />
          <CardTitle className="mt-4 text-destructive">Error Loading Budgets</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-destructive-foreground">{error}</CardDescription>
        </CardContent>
        <CardFooter className="justify-center">
          <Button onClick={fetchBudgets}>
            <PlusCircle className="mr-2 h-5 w-5" /> Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Budgets</h1>
        <Button onClick={() => openBudgetDialog()}>
          <PlusCircle className="mr-2 h-5 w-5" /> Create Budget
        </Button>
      </div>

      {budgets.length === 0 ? (
        <Card className="text-center py-10">
          <CardHeader>
             <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle className="mt-4">No Budgets Created</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Start managing your finances by creating your first budget.</CardDescription>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => openBudgetDialog()}>
              <PlusCircle className="mr-2 h-5 w-5" /> Create Your First Budget
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => {
            const totalSpent = budget.categoryLimits.reduce((sum, cl) => sum + (currentSpending[budget.id]?.[cl.categoryId] || 0), 0);
            const overallProgress = budget.totalBudgetAmount && budget.totalBudgetAmount > 0 ? (totalSpent / budget.totalBudgetAmount) * 100 : 0;
            const isOverBudget = budget.totalBudgetAmount !== undefined && totalSpent > budget.totalBudgetAmount;

            return (
              <Card key={budget.id} className={`shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col ${budget.isDefault ? 'border-primary border-2' : ''}`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl font-semibold">{budget.name}</CardTitle>
                      <CardDescription className="capitalize">{budget.timePeriod} Budget {budget.isDefault && <Badge className="ml-2">Default</Badge>}</CardDescription>
                    </div>
                    <Target className={`h-6 w-6 ${isOverBudget ? 'text-destructive' : 'text-primary'}`} />
                  </div>
                   {budget.totalBudgetAmount !== undefined && (
                    <div className="mt-2">
                        <div className="flex justify-between text-sm mb-1">
                            <span>Spent: ${totalSpent.toFixed(2)}</span>
                            <span className={isOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                                Limit: ${budget.totalBudgetAmount.toFixed(2)}
                            </span>
                        </div>
                        <Progress value={Math.min(overallProgress, 100)} className={isOverBudget ? '[&>div]:bg-destructive' : ''} />
                        {isOverBudget && <p className="text-xs text-destructive mt-1 font-medium flex items-center"><AlertTriangle className="h-3 w-3 mr-1"/> Over budget by ${(totalSpent - budget.totalBudgetAmount!).toFixed(2)}!</p>}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Category Limits:</h4>
                  {budget.categoryLimits && budget.categoryLimits.length > 0 ? budget.categoryLimits.map(cl => {
                    const category = initialCategories.find(c => c.id === cl.categoryId);
                    const spent = currentSpending[budget.id]?.[cl.categoryId] || 0;
                    const progress = cl.limit > 0 ? (spent / cl.limit) * 100 : 0;
                    const categoryIsOverBudget = cl.limit !== undefined && spent > cl.limit;
                    return (
                      <div key={cl.categoryId}>
                        <div className="flex justify-between text-sm">
                          <span>{category?.name || 'Unknown Category'}</span>
                          <span className={categoryIsOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                            ${spent.toFixed(2)} / ${cl.limit.toFixed(2)}
                          </span>
                        </div>
                        <Progress value={Math.min(progress, 100)} className={`mt-1 ${categoryIsOverBudget ? '[&>div]:bg-destructive': ''}`} />
                      </div>
                    );
                  }) : <p className="text-sm text-muted-foreground">No specific category limits set.</p>}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4 mt-auto">
                  <Button variant="ghost" size="icon" onClick={() => openBudgetDialog(budget)} aria-label="Edit budget">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                   <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Delete budget" onClick={() => openDeleteDialog(budget.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isBudgetDialogOpen} onOpenChange={(isOpen) => { setIsBudgetDialogOpen(isOpen); if(!isOpen) resetBudgetForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBudget?.id ? 'Edit' : 'Create New'} Budget</DialogTitle>
            <DialogDescription>
              Define your budget name, period, and category spending limits.
            </DialogDescription>
          </DialogHeader>
          {editingBudget && (
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="budget-name" className="text-right">Name</Label>
                <Input id="budget-name" value={editingBudget.name || ''} onChange={(e) => setEditingBudget(p => p ? ({ ...p, name: e.target.value }) : null)} className="col-span-3" placeholder="e.g., Monthly Expenses" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="budget-period" className="text-right">Period</Label>
                <Select value={editingBudget.timePeriod || 'monthly'} onValueChange={(v) => setEditingBudget(p => p ? ({ ...p, timePeriod: v as 'monthly' | 'yearly' }) : null)}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="budget-default" className="text-right">Default</Label>
                <Checkbox id="budget-default" checked={editingBudget.isDefault} onCheckedChange={(checked) => setEditingBudget(p => p ? ({...p, isDefault: !!checked}) : null)} className="col-span-3 justify-self-start" />
              </div>
              
              <h4 className="font-medium mt-4 col-span-4">Category Limits ($)</h4>
              {initialCategories.map(category => {
                 const currentLimitObj = editingBudget.tempCategoryLimits?.find(cl => cl.categoryId === category.id);
                 const currentLimitValue = currentLimitObj ? currentLimitObj.limit : undefined;
                 return (
                  <div key={category.id} className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`limit-${category.id}`} className="text-right">{category.name}</Label>
                      <Input 
                          id={`limit-${category.id}`} 
                          type="number" 
                          value={currentLimitValue === undefined ? '' : String(currentLimitValue)}
                          onChange={(e) => handleCategoryLimitChange(category.id, e.target.value)}
                          className="col-span-3" 
                          placeholder="e.g., 200" 
                      />
                  </div>
                 );
              })}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" onClick={handleSaveBudget}>Save Budget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently delete the budget: "{budgets.find(b => b.id === deletingBudgetId)?.name}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingBudgetId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBudget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Budget
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

