import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, DollarSign, CreditCard, Users, Activity, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

// Placeholder data - replace with actual data fetching
const summaryStats = [
  { title: "Total Balance", value: "$12,345.67", change: "+2.1%", changeType: "positive" as const, icon: DollarSign, href:"/accounts" },
  { title: "Total Spending (Month)", value: "$1,234.56", change: "-5.3%", changeType: "negative" as const, icon: TrendingDown, href:"/transactions" },
  { title: "Total Income (Month)", value: "$3,456.78", change: "+10.2%", changeType: "positive" as const, icon: TrendingUp, href:"/transactions" },
  { title: "Budget Progress", value: "65% Utilized", change: "On Track", changeType: "neutral" as const, icon: Activity, href:"/budgets" },
];

const recentTransactions = [
  { id: "1", description: "Coffee Shop", amount: -5.50, date: "2024-07-28", category: "Food & Drink" },
  { id: "2", description: "Salary Deposit", amount: 2500.00, date: "2024-07-27", category: "Income" },
  { id: "3", description: "Online Subscription", amount: -12.99, date: "2024-07-26", category: "Bills" },
  { id: "4", description: "Grocery Store", amount: -75.20, date: "2024-07-25", category: "Groceries" },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Dashboard</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/transactions/import">Import Transactions</Link>
          </Button>
          <Button asChild>
            <Link href="/budgets/new">Create Budget</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className={`text-xs ${stat.changeType === 'positive' ? 'text-green-600' : stat.changeType === 'negative' ? 'text-red-600' : 'text-muted-foreground'}`}>
                {stat.change}
              </p>
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
            <CardDescription>Your latest financial activities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentTransactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors">
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-sm text-muted-foreground">{transaction.date} - {transaction.category}</p>
                </div>
                <p className={`font-semibold ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {transaction.amount > 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
                </p>
              </div>
            ))}
             <Button variant="outline" className="w-full mt-4" asChild>
                <Link href="/transactions">View All Transactions</Link>
             </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-lg">
          <CardHeader>
            <CardTitle>Spending Overview</CardTitle>
            <CardDescription>Visual breakdown of your expenses by category.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[300px]">
            {/* Placeholder for chart */}
            <Image 
              src="https://placehold.co/300x200.png" 
              alt="Spending chart placeholder" 
              width={300} 
              height={200}
              data-ai-hint="pie chart" 
              className="rounded-md"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Button variant="outline" asChild><Link href="/accounts/new">Add New Account</Link></Button>
            <Button variant="outline" asChild><Link href="/transactions/import">Import Statement</Link></Button>
            <Button variant="outline" asChild><Link href="/transactions/new">Log Expense/Income</Link></Button>
            <Button variant="outline" asChild><Link href="/budgets">Manage Budgets</Link></Button>
        </CardContent>
      </Card>

    </div>
  );
}
