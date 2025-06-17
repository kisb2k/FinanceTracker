
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  ArrowUpRight, DollarSign, TrendingUp, TrendingDown, Activity, PieChart as PieChartIcon, ListFilter, FileText, Loader2, AlertCircle, CalendarDays
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts';

import type { Account, Transaction, Budget, Category } from '@/lib/types';
import { getAccounts } from '@/services/accountService';
import { getTransactions } from '@/services/transactionService';
import { getBudgets } from '@/services/budgetService';
import { getCategories } from '@/services/categoryService'; // Needed if budgets don't store category names
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { getDateRange, type PeriodOptionValue } from '@/lib/date-utils';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82Ca9D', '#FFC0CB', '#A52A2A'];

interface DashboardMetrics {
  totalBalance: number;
  periodIncome: number;
  periodSpending: number;
  budgetTotal: number | null;
  budgetSpent: number | null;
  budgetProgress: number | null;
  isOverBudget: boolean;
  topSpendingCategories: { name: string; value: number }[];
}

const initialMetrics: DashboardMetrics = {
  totalBalance: 0,
  periodIncome: 0,
  periodSpending: 0,
  budgetTotal: null,
  budgetSpent: null,
  budgetProgress: null,
  isOverBudget: false,
  topSpendingCategories: [],
};

const periodOptions: { value: PeriodOptionValue; label: string }[] = [
  { value: 'current_month', label: 'Current Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'all_time', label: 'All Time' },
];


export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]); // Store all categories

  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOptionValue>('current_month');

  const [metrics, setMetrics] = useState<DashboardMetrics>(initialMetrics);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [accData, txData, budgetData, catData] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getBudgets(),
        getCategories()
      ]);
      setAccounts(accData);
      setTransactions(txData);
      setBudgets(budgetData);
      setCategories(catData);

      const defaultBudget = budgetData.find(b => b.isDefault) || (budgetData.length > 0 ? budgetData[0] : null);
      setSelectedBudgetId(defaultBudget?.id || null);

    } catch (e) {
      const msg = (e as Error).message || "Failed to load dashboard data.";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isLoading || error) return;

    const { startDate, endDate } = getDateRange(selectedPeriod);

    const filteredTransactions = transactions.filter(tx => {
      if (selectedPeriod === 'all_time') return true;
      const txDate = parseISO(tx.date);
      return txDate >= startDate! && txDate <= endDate!;
    });

    const newTotalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const newPeriodIncome = filteredTransactions.filter(tx => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0);
    const newPeriodSpending = filteredTransactions.filter(tx => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    
    let budgetTotal: number | null = null;
    let budgetSpent: number | null = null;
    let budgetProgress: number | null = null;
    let isOverBudget = false;
    let topSpendingCategoriesData: { name: string; value: number }[] = [];

    const currentBudget = budgets.find(b => b.id === selectedBudgetId);

    if (currentBudget && currentBudget.categoryLimits) {
      budgetTotal = currentBudget.totalBudgetAmount || currentBudget.categoryLimits.reduce((sum, cl) => sum + cl.limit, 0);
      let totalSpentForBudget = 0;
      
      const spendingByCat: Record<string, number> = {};

      currentBudget.categoryLimits.forEach(limit => {
        const categoryName = categories.find(c => c.id === limit.categoryId)?.name || 'Unknown Category';
        const spendingInCat = filteredTransactions
          .filter(tx => tx.category === categoryName && tx.amount < 0)
          .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
        
        totalSpentForBudget += spendingInCat;
        if (spendingInCat > 0) {
            spendingByCat[categoryName] = (spendingByCat[categoryName] || 0) + spendingInCat;
        }
      });
      
      budgetSpent = totalSpentForBudget;
      if (budgetTotal > 0) {
        budgetProgress = (budgetSpent / budgetTotal) * 100;
        isOverBudget = budgetSpent > budgetTotal;
      } else {
        budgetProgress = budgetSpent > 0 ? 100 : 0; // If limit is 0, any spending is "over"
        isOverBudget = budgetSpent > 0;
      }
      topSpendingCategoriesData = Object.entries(spendingByCat)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5); // Top 5 categories
    }

    setMetrics({
      totalBalance: newTotalBalance,
      periodIncome: newPeriodIncome,
      periodSpending: newPeriodSpending,
      budgetTotal,
      budgetSpent,
      budgetProgress,
      isOverBudget,
      topSpendingCategories: topSpendingCategoriesData,
    });

    setRecentTransactions(
      transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
    );

  }, [transactions, accounts, budgets, categories, selectedBudgetId, selectedPeriod, isLoading, error]);


  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-10 border-destructive">
        <CardHeader>
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <CardTitle className="mt-4 text-destructive">Error Loading Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text-destructive-foreground">{error}</CardDescription>
        </CardContent>
        <CardFooter className="justify-center">
          <Button onClick={fetchData}> Try Again </Button>
        </CardFooter>
      </Card>
    );
  }
  
  const selectedBudgetName = budgets.find(b => b.id === selectedBudgetId)?.name || "No Budget Selected";

  const summaryStats = [
    { title: "Total Balance", value: `$${metrics.totalBalance.toFixed(2)}`, icon: DollarSign, href:"/accounts" },
    { title: "Spending", value: `$${metrics.periodSpending.toFixed(2)}`, icon: TrendingDown, href:"/transactions" },
    { title: "Income", value: `$${metrics.periodIncome.toFixed(2)}`, icon: TrendingUp, href:"/transactions" },
    { 
      title: selectedBudgetId ? `Budget: ${selectedBudgetName}` : "Budget Progress", 
      value: metrics.budgetProgress !== null ? `${metrics.budgetProgress.toFixed(0)}% Utilized` : "N/A", 
      subValue: metrics.budgetSpent !== null && metrics.budgetTotal !== null ? `$${metrics.budgetSpent.toFixed(2)} of $${metrics.budgetTotal.toFixed(2)}` : '',
      isOver: metrics.isOverBudget,
      icon: Activity, 
      href:"/budgets" 
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedPeriod} onValueChange={(val) => setSelectedPeriod(val as PeriodOptionValue)}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {periodOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedBudgetId || ''} onValueChange={(val) => setSelectedBudgetId(val === 'none' ? null : val)} disabled={budgets.length === 0}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <ListFilter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Select budget" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Budget Selected</SelectItem>
              {budgets.map(b => <SelectItem key={b.id} value={b.id}>{b.name} {b.isDefault ? '(Default)' : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.isOver ? 'text-destructive' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.isOver ? 'text-destructive' : ''}`}>{stat.value}</div>
              {stat.subValue && <p className={`text-xs ${stat.isOver ? 'text-destructive/80' : 'text-muted-foreground'}`}>{stat.subValue}</p>}
              {stat.href && (
                 <Button variant="link" size="sm" className="px-0 -ml-1 mt-1 text-primary" asChild>
                    <Link href={stat.href}>View Details <ArrowUpRight className="h-4 w-4 ml-1" /></Link>
                 </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-lg">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest financial activities. Displaying last 5 transactions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentTransactions.length > 0 ? recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-sm text-muted-foreground">{format(parseISO(transaction.date), 'MM/dd/yyyy')} - {transaction.category}</p>
                </div>
                <p className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {transaction.amount > 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
                </p>
              </div>
            )) : <p className="text-muted-foreground p-3 text-center">No recent transactions found.</p>}
             <Button variant="outline" className="w-full mt-4" asChild>
                <Link href="/transactions">View All Transactions</Link>
             </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-lg">
          <CardHeader>
            <CardTitle>Spending Overview</CardTitle>
            <CardDescription>Top spending categories for {periodOptions.find(p=>p.value === selectedPeriod)?.label.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center">
            {metrics.topSpendingCategories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.topSpendingCategories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {metrics.topSpendingCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <RechartsLegend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center text-muted-foreground flex flex-col items-center">
                <PieChartIcon className="h-12 w-12 mb-2" />
                <p>No spending data available for this period/budget to display a chart.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Button variant="outline" asChild><Link href="/accounts">Manage Accounts</Link></Button>
            <Button variant="outline" asChild><Link href="/transactions/import">Import Statement</Link></Button>
            <Button variant="outline" asChild><Link href="/transactions">Log Expense/Income</Link></Button>
            <Button variant="outline" asChild><Link href="/budgets">Manage Budgets</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}

