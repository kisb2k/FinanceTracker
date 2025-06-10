'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { PlusCircle, Edit3, Trash2, Target, CheckSquare, AlertTriangle, FileText } from "lucide-react";
import type { Budget, Category, BudgetCategoryLimit } from '@/lib/types';

// Placeholder data
const initialCategories: Category[] = [
  { id: 'c1', name: 'Food & Drink' },
  { id: 'c2', name: 'Groceries' },
  { id: 'c3', name: 'Transportation' },
  { id: 'c4', name: 'Housing' },
  { id: 'c5', name: 'Entertainment' },
  { id: 'c6', name: 'Shopping' },
];

const initialBudgets: Budget[] = [
  { 
    id: 'b1', 
    name: 'Monthly Essentials', 
    isDefault: true, 
    timePeriod: 'monthly', 
    categoryLimits: [
      { categoryId: 'c1', limit: 300 },
      { categoryId: 'c2', limit: 400 },
      { categoryId: 'c3', limit: 150 },
      { categoryId: 'c4', limit: 1200 },
    ],
    totalBudgetAmount: 2050,
  },
  { 
    id: 'b2', 
    name: 'Vacation Fund', 
    isDefault: false, 
    timePeriod: 'yearly', 
    categoryLimits: [
      { categoryId: 'c5', limit: 1000 }, // Entertainment during vacation
      { categoryId: 'c6', limit: 500 }, // Shopping during vacation
    ],
    totalBudgetAmount: 1500,
  },
];

// Simulated current spending (replace with actual data)
const currentSpending: Record<string, Record<string, number>> = {
  b1: { c1: 250, c2: 380, c3: 100, c4: 1200 },
  b2: { c5: 100, c6: 50 },
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
  const [isAddBudgetDialogOpen, setIsAddBudgetDialogOpen] = useState(false);
  // Form state for new/edit budget
  const [editingBudget, setEditingBudget] = useState<Partial<Budget> & { tempCategoryLimits?: BudgetCategoryLimit[] }>({});

  const handleSaveBudget = () => {
    // Basic validation
    if (!editingBudget.name || !editingBudget.timePeriod || !editingBudget.tempCategoryLimits || editingBudget.tempCategoryLimits.length === 0) {
      alert("Please fill in name, time period, and at least one category limit.");
      return;
    }

    const totalBudget = editingBudget.tempCategoryLimits.reduce((sum, cl) => sum + cl.limit, 0);

    if (editingBudget.id) { // Editing existing budget
      setBudgets(budgets.map(b => b.id === editingBudget.id ? { ...b, ...editingBudget, categoryLimits: editingBudget.tempCategoryLimits!, totalBudgetAmount: totalBudget } as Budget : b));
    } else { // Adding new budget
      const newBudget: Budget = {
        id: `b${budgets.length + 1}`,
        name: editingBudget.name!,
        isDefault: editingBudget.isDefault || false,
        timePeriod: editingBudget.timePeriod!,
        categoryLimits: editingBudget.tempCategoryLimits!,
        totalBudgetAmount: totalBudget,
      };
      setBudgets([...budgets, newBudget]);
    }
    setEditingBudget({});
    setIsAddBudgetDialogOpen(false);
  };
  
  const openAddBudgetDialog = (budgetToEdit?: Budget) => {
    if (budgetToEdit) {
      setEditingBudget({ ...budgetToEdit, tempCategoryLimits: [...budgetToEdit.categoryLimits] });
    } else {
      setEditingBudget({ isDefault: false, timePeriod: 'monthly', tempCategoryLimits: [] });
    }
    setIsAddBudgetDialogOpen(true);
  };

  const handleCategoryLimitChange = (categoryId: string, limitStr: string) => {
    const limit = parseFloat(limitStr) || 0;
    setEditingBudget(prev => {
      const existingLimits = prev.tempCategoryLimits || [];
      const newLimits = existingLimits.filter(cl => cl.categoryId !== categoryId);
      if (limit > 0) { // Only add if limit is positive, or keep if editing existing
         newLimits.push({ categoryId, limit });
      } else { // If limit is 0 or negative, effectively remove it unless it was pre-existing with 0
         const preExisting = (prev.id && budgets.find(b=>b.id === prev.id)?.categoryLimits.find(cl=>cl.categoryId === categoryId));
         if (preExisting && limit <=0) {
            // Keep it to show it was zeroed out
             newLimits.push({ categoryId, limit });
         }
      }
      return { ...prev, tempCategoryLimits: newLimits.sort((a,b) => initialCategories.findIndex(c=>c.id===a.categoryId) - initialCategories.findIndex(c=>c.id===b.categoryId)) };
    });
  };


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Budgets</h1>
        <Button onClick={() => openAddBudgetDialog()}>
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
            <Button onClick={() => openAddBudgetDialog()}>
              <PlusCircle className="mr-2 h-5 w-5" /> Create Your First Budget
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => {
            const totalSpent = budget.categoryLimits.reduce((sum, cl) => sum + (currentSpending[budget.id]?.[cl.categoryId] || 0), 0);
            const overallProgress = budget.totalBudgetAmount ? (totalSpent / budget.totalBudgetAmount) * 100 : 0;
            const isOverBudget = budget.totalBudgetAmount && totalSpent > budget.totalBudgetAmount;

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
                        {isOverBudget && <p className="text-xs text-destructive mt-1 font-medium flex items-center"><AlertTriangle className="h-3 w-3 mr-1"/> Over budget by ${(totalSpent - budget.totalBudgetAmount).toFixed(2)}!</p>}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground">Category Limits:</h4>
                  {budget.categoryLimits.map(cl => {
                    const category = initialCategories.find(c => c.id === cl.categoryId);
                    const spent = currentSpending[budget.id]?.[cl.categoryId] || 0;
                    const progress = cl.limit > 0 ? (spent / cl.limit) * 100 : 0;
                    const categoryIsOverBudget = spent > cl.limit;
                    return (
                      <div key={cl.categoryId}>
                        <div className="flex justify-between text-sm">
                          <span>{category?.name || 'Unknown Category'}</span>
                          <span className={categoryIsOverBudget ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                            ${spent.toFixed(2)} / ${cl.limit.toFixed(2)}
                          </span>
                        </div>
                        <Progress value={Math.min(progress, 100)} size="sm" className={`mt-1 ${categoryIsOverBudget ? '[&>div]:bg-destructive': ''}`} />
                      </div>
                    );
                  })}
                  {budget.categoryLimits.length === 0 && <p className="text-sm text-muted-foreground">No specific category limits set.</p>}
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4 mt-auto">
                  <Button variant="ghost" size="icon" onClick={() => openAddBudgetDialog(budget)} aria-label="Edit budget">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Delete budget">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isAddBudgetDialogOpen} onOpenChange={setIsAddBudgetDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBudget.id ? 'Edit' : 'Create New'} Budget</DialogTitle>
            <DialogDescription>
              Define your budget name, period, and category spending limits.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="budget-name" className="text-right">Name</Label>
              <Input id="budget-name" value={editingBudget.name || ''} onChange={(e) => setEditingBudget(p => ({ ...p, name: e.target.value }))} className="col-span-3" placeholder="e.g., Monthly Expenses" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="budget-period" className="text-right">Period</Label>
              <Select value={editingBudget.timePeriod || 'monthly'} onValueChange={(v) => setEditingBudget(p => ({ ...p, timePeriod: v as 'monthly' | 'yearly' }))}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  {/* Add more options like quarterly if needed */}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="budget-default" className="text-right">Default</Label>
              <Checkbox id="budget-default" checked={editingBudget.isDefault} onCheckedChange={(checked) => setEditingBudget(p => ({...p, isDefault: !!checked}))} className="col-span-3 justify-self-start" />
            </div>
            
            <h4 className="font-medium mt-4 col-span-4">Category Limits</h4>
            {initialCategories.map(category => {
               const currentLimit = editingBudget.tempCategoryLimits?.find(cl => cl.categoryId === category.id)?.limit;
               return (
                <div key={category.id} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={`limit-${category.id}`} className="text-right">{category.name}</Label>
                    <Input 
                        id={`limit-${category.id}`} 
                        type="number" 
                        value={currentLimit === undefined ? '' : String(currentLimit)}
                        onChange={(e) => handleCategoryLimitChange(category.id, e.target.value)}
                        className="col-span-3" 
                        placeholder="e.g., 200" 
                    />
                </div>
               );
            })}

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setIsAddBudgetDialogOpen(false); setEditingBudget({}); }}>Cancel</Button>
            <Button type="submit" onClick={handleSaveBudget}>Save Budget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
