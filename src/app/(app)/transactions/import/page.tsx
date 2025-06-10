'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UploadCloud, FileText, CheckCircle, XCircle, Wand2, ArrowRight } from "lucide-react";
import type { Account } from '@/lib/types';
import { mapCsvColumns, type MapCsvColumnsOutput } from '@/ai/flows/map-csv-columns'; // Assuming this path
import { Progress } from '@/components/ui/progress';

// Placeholder data
const accounts: Account[] = [
  { id: '1', name: 'Chase Checking', type: 'debit', balance: 0, currency: 'USD' },
  { id: '2', name: 'Amex Gold', type: 'credit', balance: 0, currency: 'USD' },
  { id: '3', name: 'Bank of America Savings', type: 'savings', balance: 0, currency: 'USD'},
];

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];

type ImportStep = 'upload' | 'map_columns' | 'review' | 'complete';

interface CsvRow {
  [key: string]: string;
}

export default function ImportTransactionsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [progressValue, setProgressValue] = useState(0);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setSelectedFile(null);
        setError('Invalid file type. Please upload a CSV file.');
      }
    }
  };

  const parseCsvPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').slice(0, 6); // Headers + 5 preview rows
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        setCsvHeaders(headers);
        const previewData = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          return headers.reduce((obj, header, index) => {
            obj[header] = values[index] || '';
            return obj;
          }, {} as CsvRow);
        });
        setCsvPreview(previewData);
      }
    };
    reader.readAsText(file);
  };

  const handleProceedToMapping = async () => {
    if (!selectedFile || !selectedAccountId) {
      setError('Please select a file and an account.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setProgressValue(10);

    parseCsvPreview(selectedFile); // Parse for preview and headers
    
    // Simulate AI mapping
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvData = e.target?.result as string;
        setProgressValue(30);
        // Call Genkit flow
        // For now, using a placeholder response. Replace with actual AI call.
        // const aiResult: MapCsvColumnsOutput = await mapCsvColumns({ csvData });
        // setColumnMap(aiResult.columnMap);
        
        // Placeholder mapping logic
        const placeholderMap: Record<string, string> = {};
        csvHeaders.forEach(header => {
            const lowerHeader = header.toLowerCase();
            if (lowerHeader.includes('date')) placeholderMap[header] = 'date';
            else if (lowerHeader.includes('desc') || lowerHeader.includes('narrative')) placeholderMap[header] = 'description';
            else if (lowerHeader.includes('amount') || lowerHeader.includes('value')) placeholderMap[header] = 'amount';
            else if (lowerHeader.includes('category') || lowerHeader.includes('type')) placeholderMap[header] = 'category';
            else placeholderMap[header] = ''; // Unmapped
        });
        setColumnMap(placeholderMap);
        setProgressValue(50);
        setImportStep('map_columns');
        setIsLoading(false);
      };
      reader.readAsText(selectedFile);
    } catch (aiError) {
      console.error("AI Mapping Error:", aiError);
      setError('AI column mapping failed. Please map columns manually.');
      // Fallback to manual mapping setup
      const fallbackMap = csvHeaders.reduce((acc, header) => ({...acc, [header]: ''}), {});
      setColumnMap(fallbackMap);
      setProgressValue(50);
      setImportStep('map_columns');
      setIsLoading(false);
    }
  };

  const handleColumnMapChange = (csvHeader: string, transactionField: string) => {
    setColumnMap(prev => ({ ...prev, [csvHeader]: transactionField }));
  };

  const handleSubmitImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !selectedAccountId || Object.keys(columnMap).length === 0) {
      setError('File, account, and column mappings are required.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setProgressValue(70);

    // Simulate processing and saving
    // In a real app, you would parse the full CSV based on columnMap,
    // transform data, detect debit/credit, save to DB.
    console.log('Importing with:', { fileName: selectedFile.name, accountId: selectedAccountId, columnMap });
    
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay

    // Placeholder: Assume 100 transactions imported
    const transactionsImportedCount = 100; 
    setSuccessMessage(`${transactionsImportedCount} transactions imported successfully for account ${accounts.find(a=>a.id === selectedAccountId)?.name}.`);
    setSelectedFile(null);
    setSelectedAccountId('');
    setColumnMap({});
    setCsvHeaders([]);
    setCsvPreview([]);
    setImportStep('complete');
    setIsLoading(false);
    setProgressValue(100);
  };
  
  const resetForm = () => {
    setSelectedFile(null);
    setSelectedAccountId('');
    setError(null);
    setSuccessMessage(null);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvPreview([]);
    setColumnMap({});
    setProgressValue(0);
  };


  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight font-headline">Import Transactions</h1>
      
      {importStep !== 'complete' && <Progress value={progressValue} className="w-full mb-4" />}

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {successMessage && importStep === 'complete' && (
        <Alert variant="default" className="bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400">
          <CheckCircle className="h-4 w-4 !text-green-500" />
          <AlertTitle>Import Successful!</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      {importStep === 'upload' && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Step 1: Upload File & Select Account</CardTitle>
            <CardDescription>Choose a CSV file and the account to import transactions into.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="account-select">Account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger id="account-select">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file-upload">CSV File</Label>
              <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-md hover:border-primary transition-colors">
                <UploadCloud className="h-10 w-10 text-muted-foreground" />
                <div className="flex-1">
                  <Input id="file-upload" type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                  <Button type="button" variant="outline" onClick={() => document.getElementById('file-upload')?.click()}>
                    {selectedFile ? 'Change File' : 'Choose File'}
                  </Button>
                  {selectedFile && <p className="text-sm text-muted-foreground mt-1 ml-2">{selectedFile.name}</p>}
                  {!selectedFile && <p className="text-sm text-muted-foreground mt-1 ml-2">No file selected. Only .csv files are supported.</p>}
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button onClick={handleProceedToMapping} disabled={!selectedFile || !selectedAccountId || isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Proceed to Column Mapping
            </Button>
          </CardFooter>
        </Card>
      )}

      {importStep === 'map_columns' && (
        <Card className="shadow-lg">
          <form onSubmit={handleSubmitImport}>
            <CardHeader>
              <CardTitle>Step 2: Map CSV Columns</CardTitle>
              <CardDescription>
                Match your CSV columns to the standard transaction fields. AI suggestions are pre-filled.
                <Wand2 className="inline ml-2 h-4 w-4 text-primary" />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground">File: <strong>{selectedFile?.name}</strong> for Account: <strong>{accounts.find(a => a.id === selectedAccountId)?.name}</strong></p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CSV Column Header</TableHead>
                      <TableHead>Maps To Transaction Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvHeaders.map(header => (
                      <TableRow key={header}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell>
                          <Select 
                            value={columnMap[header] || ''} 
                            onValueChange={(value) => handleColumnMapChange(header, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select field or leave unmapped" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">-- Unmapped --</SelectItem>
                              {expectedTransactionFields.map(field => (
                                <SelectItem key={field} value={field} className="capitalize">{field}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {csvPreview.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold mb-2">Data Preview (First 5 Rows)</h3>
                  <div className="overflow-x-auto border rounded-md p-2 bg-muted/30 max-h-60">
                    <Table className="text-xs">
                       <TableHeader><TableRow>{csvHeaders.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                       <TableBody>
                        {csvPreview.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>{csvHeaders.map(h => <TableCell key={h} className="max-w-[100px] truncate" title={row[h]}>{row[h]}</TableCell>)}</TableRow>
                        ))}
                       </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between">
               <Button type="button" variant="outline" onClick={() => setImportStep('upload')}>Back</Button>
               <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Confirm and Import
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
      
      {importStep === 'complete' && (
         <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Import Process Finished</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="mb-4">Your transactions have been processed.</p>
            </CardContent>
            <CardFooter className="flex justify-between">
                <Button variant="outline" onClick={resetForm}>Import Another File</Button>
                <Button asChild><a href="/transactions">View Transactions</a></Button>
            </CardFooter>
         </Card>
      )}

    </div>
  );
}
