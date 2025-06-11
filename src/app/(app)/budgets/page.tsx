
'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { getBudgets, addBudget, updateBudget, deleteBudget as deleteBudgetService, type AddBudgetData } from '@/services/budgetService';
import { getCategories } from '@/services/categoryService';
import { useToast } from '@/hooks/use-toast';

// Simulated current spending - will be 0 until transaction integration
const currentSpending: Record<string, Record<string, number>> = {};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Partial<Budget> & { tempCategoryLimits?: BudgetCategoryLimit[] } | null>(null);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);

  const fetchPageData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [fetchedBudgets, fetchedCategories] = await Promise.all([
        getBudgets(),
        getCategories()
      ]);
      setBudgets(fetchedBudgets || []);
      setAllCategories(fetchedCategories || []);
    } catch (e) {
      const errorMsg = (e as Error).message || "Failed to load budget data. Check console for details.";
      setError(errorMsg);
      console.error("Error fetching page data for Budgets:", e);
      toast({ title: "Error Loading Data", description: errorMsg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  const resetBudgetForm = () => {
    setEditingBudget(null);
  };

  const openBudgetDialog = (budgetToEdit?: Budget) => {
    if (allCategories.length === 0) {
        toast({ title: "Action Required", description: "Please add categories on the Transactions page before creating budgets.", variant: "default" });
        return;
    }
    if (budgetToEdit) {
      // Ensure tempCategoryLimits includes all available categories, preserving existing limits
      const existingLimitsMap = new Map(budgetToEdit.categoryLimits?.map(cl => [cl.categoryId, cl.limit]));
      const synchronizedLimits = allCategories.map(cat => ({
        categoryId: cat.id,
        limit: existingLimitsMap.get(cat.id) || 0,
      }));
      setEditingBudget({ 
        ...budgetToEdit, 
        tempCategoryLimits: synchronizedLimits
      });
    } else {
      const initialLimits = allCategories.map(cat => ({ categoryId: cat.id, limit: 0 }));
      setEditingBudget({ name: '', isDefault: false, timePeriod: 'monthly', tempCategoryLimits: initialLimits });
    }
    setIsBudgetDialogOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!editingBudget || !editingBudget.name || !editingBudget.timePeriod || !editingBudget.tempCategoryLimits) {
      toast({ title: "Validation Error", description: "Please fill in name, time period, and at least one category limit.", variant: "destructive" });
      return;
    }

    const validCategoryLimits = editingBudget.tempCategoryLimits.filter(cl => cl.limit > 0);
    if (validCategoryLimits.length === 0) {
        toast({ title: "Validation Error", description: "Please set a limit for at least one category.", variant: "destructive" });
        return;
    }

    const totalBudget = validCategoryLimits.reduce((sum, cl) => sum + (cl.limit || 0), 0);
    
    const budgetDataPayload = {
      name: editingBudget.name!,
      isDefault: editingBudget.isDefault || false,
      timePeriod: editingBudget.timePeriod!,
      categoryLimits: validCategoryLimits,
      totalBudgetAmount: totalBudget,
    };

    try {
      if (editingBudget.id) {
        await updateBudget(editingBudget.id, budgetDataPayload);
        setBudgets(budgets.map(b => b.id === editingBudget!.id ? { ...b, ...budgetDataPayload, id: editingBudget!.id } as Budget : b).sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "Success", description: `Budget "${budgetDataPayload.name}" updated.` });
      } else { 
        const newBudget = await addBudget(budgetDataPayload as AddBudgetData);
        setBudgets(prev => [...prev, newBudget].sort((a,b) => a.name.localeCompare(b.name)));
        toast({ title: "Success", description: `Budget "${newBudget.name}" created.` });
      }
      resetBudgetForm();
      setIsBudgetDialogOpen(false);
    } catch (e) {
      toast({ title: "Error Saving Budget", description: (e as Error).message || "Failed to save budget.", variant: "destructive" });
    }
  };
  
  const handleCategoryLimitChange = (categoryId: string, limitStr: string) => {
    if (!editingBudget) return;
    const limit = parseFloat(limitStr) || 0; 

    setEditingBudget(prev => {
      if (!prev) return null;
      let existingLimits = prev.tempCategoryLimits ? [...prev.tempCategoryLimits] : allCategories.map(cat => ({ categoryId: cat.id, limit: 0 }));
      const limitIndex = existingLimits.findIndex(cl => cl.categoryId === categoryId);

      if (limitIndex > -1) {
        existingLimits[limitIndex] = { ...existingLimits[limitIndex], limit };
      } else {
        // This case should ideally not happen if tempCategoryLimits is initialized correctly
        existingLimits.push({ categoryId, limit });
      }
      
      return { 
        ...prev, 
        tempCategoryLimits: existingLimits.sort((a,b) => 
          allCategories.findIndex(c=>c.id===a.categoryId) - allCategories.findIndex(c=>c.id===b.categoryId)
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
      await deleteBudgetService(deletingBudgetId);
      setBudgets(budgets.filter(b => b.id !== deletingBudgetId));
      toast({ title: "Success", description: `Budget "${budgetToDelete?.name}" deleted.`, variant: "destructive" });
      setIsDeleteDialogOpen(false);
      setDeletingBudgetId(null);
    } catch (e) {
      toast({ title: "Error Deleting Budget", description: (e as Error).message || "Failed to delete budget.", variant: "destructive" });
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
          <Button onClick={fetchPageData}>
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
        <Button onClick={() => openBudgetDialog()} disabled={allCategories.length === 0 && !isLoading}>
          <PlusCircle className="mr-2 h-5 w-5" /> Create Budget
        </Button>
      </div>
      {allCategories.length === 0 && !isLoading && <p className="text-sm text-muted-foreground text-center">Please add categories on the Transactions page first to create budgets.</p>}


      {budgets.length === 0 && !isLoading ? (
        <Card className="text-center py-10">
          <CardHeader>
             <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <CardTitle className="mt-4">No Budgets Created</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Start managing your finances by creating your first budget.</CardDescription>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => openBudgetDialog()} disabled={allCategories.length === 0}>
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
                    const category = allCategories.find(c => c.id === cl.categoryId);
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
                  }) : <p className="text-sm text-muted-foreground">No specific category limits set for this budget.</p>}
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
              {allCategories.length > 0 ? allCategories.map(category => {
                 const currentLimitObj = editingBudget.tempCategoryLimits?.find(cl => cl.categoryId === category.id);
                 const currentLimitValue = currentLimitObj ? currentLimitObj.limit : 0;
                 return (
                  <div key={category.id} className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`limit-${category.id}`} className="text-right">{category.name}</Label>
                      <Input 
                          id={`limit-${category.id}`} 
                          type="number" 
                          value={String(currentLimitValue)} 
                          onChange={(e) => handleCategoryLimitChange(category.id, e.target.value)}
                          className="col-span-3" 
                          placeholder="e.g., 200" 
                      />
                  </div>
                 );
              }) : <p className="col-span-4 text-sm text-muted-foreground">No categories available. Please add categories on the Transactions page first.</p>}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" onClick={handleSaveBudget} disabled={allCategories.length === 0}>Save Budget</Button>
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

