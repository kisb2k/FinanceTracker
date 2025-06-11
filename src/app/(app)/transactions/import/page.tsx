
'use client';

import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UploadCloud, FileText, CheckCircle, XCircle, Wand2, ArrowRight } from "lucide-react";
import type { Account } from '@/lib/types';
import { mapCsvColumns, type MapCsvColumnsOutput, type MappingEntry } from '@/ai/flows/map-csv-columns';
import { Progress } from '@/components/ui/progress';
import { getAccounts, updateAccountLastImported } from '@/services/accountService';
import { addTransaction, type AddTransactionData } from '@/services/transactionService';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];
const UNMAPPED_PLACEHOLDER_VALUE = "__UNMAPPED_PLACEHOLDER__";

type ImportStep = 'upload' | 'map_columns' | 'review' | 'complete';

interface CsvRow {
  [key: string]: string;
}

export default function ImportTransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [progressValue, setProgressValue] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const fetchAccountsForImport = async () => {
      setIsAccountsLoading(true);
      setAccountsError(null);
      try {
        const fetchedAccounts = await getAccounts();
        setAccounts(fetchedAccounts);
      } catch (e) {
        const errorMsg = (e as Error).message || "Failed to load accounts for import.";
        setAccountsError(errorMsg);
        toast({ title: "Error Loading Accounts", description: errorMsg, variant: "destructive" });
      } finally {
        setIsAccountsLoading(false);
      }
    };
    fetchAccountsForImport();
  }, [toast]);

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
      const lines = text.split(/\r\n|\n|\r/).slice(0, 6); 
      if (lines.length > 0) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        setCsvHeaders(headers);
        const previewData = lines.slice(1).filter(line => line.trim() !== '').map(line => {
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

    parseCsvPreview(selectedFile);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvDataContent = e.target?.result as string;
        setProgressValue(30);
        try {
            const aiResult: MapCsvColumnsOutput = await mapCsvColumns({ csvData: csvDataContent.split(/\r\n|\n|\r/).slice(0, 10).join('\\n') });
            if (aiResult && Array.isArray(aiResult.columnMappings)) {
              const newColumnMap = aiResult.columnMappings.reduce((acc, mapping: MappingEntry) => {
                if (mapping.csvHeader && csvHeaders.includes(mapping.csvHeader)) { // Ensure AI mapped header exists in actual CSV
                  acc[mapping.csvHeader] = mapping.transactionField || '';
                }
                return acc;
              }, {} as Record<string, string>);
              // Ensure all actual headers have an entry, even if unmapped by AI
              csvHeaders.forEach(header => {
                if (!(header in newColumnMap)) {
                    newColumnMap[header] = '';
                }
              });
              setColumnMap(newColumnMap);
              toast({ title: "AI Mapping Successful", description: "Column suggestions applied." });
            } else {
              throw new Error("AI mapping result was not in the expected format (expected an array of mappings).");
            }
        } catch (aiMapError) {
            console.error("AI Mapping Error:", aiMapError);
            setError('AI column mapping failed. Please map columns manually or verify CSV format.');
            toast({ title: "AI Mapping Failed", description: (aiMapError as Error).message || "Could not map columns using AI.", variant: "destructive" });
            const fallbackMap = csvHeaders.reduce((acc, header) => ({...acc, [header]: ''}), {});
            setColumnMap(fallbackMap);
        }
        setProgressValue(50);
        setImportStep('map_columns');
        setIsLoading(false);
      };
      reader.onerror = () => {
        setError("Failed to read the selected file.");
        setIsLoading(false);
        setProgressValue(0);
      };
      reader.readAsText(selectedFile);
    } catch (fileReadError) {
      console.error("File Reading Error:", fileReadError);
      setError('Error processing the file. Please try again.');
      setIsLoading(false);
      setProgressValue(0);
    }
  };

  const handleColumnMapChange = (csvHeader: string, transactionField: string) => {
    setColumnMap(prev => ({ ...prev, [csvHeader]: transactionField === UNMAPPED_PLACEHOLDER_VALUE ? "" : transactionField }));
  };

  // Helper to parse date string from CSV - very basic, extend as needed
  const parseDateString = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // Attempt to parse common formats, default to YYYY-MM-DD if direct
    const commonFormats = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MM-dd-yyyy', 'dd-MM-yyyy'];
    for (const fmt of commonFormats) {
        try {
            const parsed = parseDateFns(dateStr, fmt, new Date());
            if (!isNaN(parsed.valueOf())) return formatDateFns(parsed, 'yyyy-MM-dd');
        } catch (e) { /* try next format */ }
    }
    // Fallback for ISO-like strings or directly YYYY-MM-DD
    try {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.valueOf())) return formatDateFns(parsed, 'yyyy-MM-dd');
    } catch(e) { /* give up */ }
    
    console.warn(`Could not parse date: ${dateStr}`);
    return null; 
  };


  const handleSubmitImport = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !selectedAccountId || Object.keys(columnMap).length === 0) {
      setError('File, account, and column mappings are required.');
      return;
    }
    
    const mappedFields = Object.values(columnMap).filter(field => field !== '');
    if (mappedFields.length === 0) {
       setError('Please map at least one CSV column to a transaction field.');
       return;
    }
    if (!mappedFields.includes('date') || !mappedFields.includes('amount') || !mappedFields.includes('description')) {
        setError('Essential fields (date, amount, description) must be mapped.');
        return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setImportErrors([]);
    setProgressValue(60);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target?.result as string;
      const lines = fileContent.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
      if (lines.length < 2) { // Must have header + at least one data row
        setError("CSV file is empty or has no data rows.");
        setIsLoading(false);
        setProgressValue(0);
        return;
      }

      const fileHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const dataRows = lines.slice(1);
      let importedCount = 0;
      let localImportErrors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const rowString = dataRows[i];
        const rowValues = rowString.split(',').map(v => v.trim().replace(/"/g, ''));
        const rowData: Record<string, string> = fileHeaders.reduce((obj, header, index) => {
          obj[header] = rowValues[index] || '';
          return obj;
        }, {} as Record<string, string>);

        const transactionDateStr = rowData[Object.keys(columnMap).find(h => columnMap[h] === 'date') || ''];
        const transactionDescriptionStr = rowData[Object.keys(columnMap).find(h => columnMap[h] === 'description') || ''];
        const transactionAmountStr = rowData[Object.keys(columnMap).find(h => columnMap[h] === 'amount') || ''];
        const transactionCategoryStr = rowData[Object.keys(columnMap).find(h => columnMap[h] === 'category') || ''] || 'Uncategorized';
        
        const parsedDate = parseDateString(transactionDateStr);
        const parsedAmount = parseFloat(transactionAmountStr);

        if (!parsedDate) {
          localImportErrors.push(`Row ${i + 1}: Invalid or unparseable date "${transactionDateStr}". Skipping.`);
          continue;
        }
        if (isNaN(parsedAmount)) {
          localImportErrors.push(`Row ${i + 1}: Invalid amount "${transactionAmountStr}". Skipping.`);
          continue;
        }
        if (!transactionDescriptionStr) {
          localImportErrors.push(`Row ${i + 1}: Missing description. Skipping.`);
          continue;
        }

        const transactionToImport: AddTransactionData = {
          accountId: selectedAccountId,
          date: parsedDate,
          description: transactionDescriptionStr,
          amount: parsedAmount,
          category: transactionCategoryStr,
          fileName: selectedFile.name,
        };

        try {
          await addTransaction(transactionToImport);
          importedCount++;
        } catch (txError) {
          localImportErrors.push(`Row ${i + 1} ("${transactionDescriptionStr.substring(0,20)}..."): ${(txError as Error).message}`);
        }
        setProgressValue(60 + Math.floor(((i + 1) / dataRows.length) * 35)); // 60% to 95% for this part
      }

      if (importedCount > 0) {
        try {
            await updateAccountLastImported(selectedAccountId);
        } catch (accUpdateError) {
            localImportErrors.push(`Failed to update account's last import date: ${(accUpdateError as Error).message}`);
        }
        setSuccessMessage(`${importedCount} transaction(s) imported successfully for account ${accounts.find(a=>a.id === selectedAccountId)?.name}.`);
      } else if (localImportErrors.length > 0 && importedCount === 0) {
         setError(`No transactions were imported. See errors below.`);
      } else if (localImportErrors.length === 0 && importedCount === 0 && dataRows.length > 0) {
         setError(`No transactions were imported. The file might have been processed, but no valid transactions were found or created.`);
      } else if (dataRows.length === 0) {
         setError(`No data rows found in the CSV file after the header.`);
      }


      setImportErrors(localImportErrors);
      setImportStep('complete');
      setIsLoading(false);
      setProgressValue(100);
      toast({
        title: importedCount > 0 ? "Import Complete" : "Import Finished with Issues",
        description: importedCount > 0 ? `${importedCount} transactions imported.` : `Import failed or had issues. Check messages.`,
        variant: importedCount > 0 && localImportErrors.length === 0 ? "default" : "destructive"
      });

    };
    reader.onerror = () => {
      setError("Failed to read the selected file for final import.");
      setIsLoading(false);
      setProgressValue(0);
    };
    reader.readAsText(selectedFile);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setSelectedAccountId('');
    setError(null);
    setSuccessMessage(null);
    setImportErrors([]);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvPreview([]);
    setColumnMap({});
    setProgressValue(0);
    setIsLoading(false);
  };


  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Import Transactions</h1>
        {importStep !== 'upload' && (
            <Button variant="outline" onClick={resetForm}>Start New Import</Button>
        )}
      </div>

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
          <AlertTitle>Import Process Finished!</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      {importErrors.length > 0 && importStep === 'complete' && (
        <Alert variant="destructive" className="mt-4">
            <XCircle className="h-4 w-4"/>
            <AlertTitle>Import Issues ({importErrors.length})</AlertTitle>
            <AlertDescription>
                <ul className="list-disc list-inside max-h-40 overflow-y-auto">
                    {importErrors.slice(0,10).map((err, idx) => <li key={idx}>{err}</li>)}
                    {importErrors.length > 10 && <li>And {importErrors.length-10} more errors...</li>}
                </ul>
            </AlertDescription>
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
              <Select
                value={selectedAccountId}
                onValueChange={setSelectedAccountId}
                disabled={isAccountsLoading || !!accountsError || accounts.length === 0}
              >
                <SelectTrigger id="account-select">
                  <SelectValue placeholder={
                    isAccountsLoading ? "Loading accounts..." :
                    accountsError ? "Error loading accounts" :
                    accounts.length === 0 ? "No accounts available" :
                    "Select an account"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 && !isAccountsLoading && !accountsError && accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                  ))}
                   {accounts.length === 0 && !isAccountsLoading && !accountsError && (
                     <div className="p-2 text-sm text-muted-foreground">No accounts found. Please add an account on the Accounts page.</div>
                   )}
                </SelectContent>
              </Select>
              {accountsError && <p className="text-xs text-destructive">{accountsError}</p>}
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
            <Button
              onClick={handleProceedToMapping}
              disabled={!selectedFile || !selectedAccountId || isLoading || isAccountsLoading || !!accountsError}
            >
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
                Match your CSV columns to the standard transaction fields. AI suggestions are pre-filled if successful.
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
                    {csvHeaders.map((header, index) => (
                      <TableRow key={`${header}-${index}`}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell>
                          <Select
                            value={columnMap[header] || UNMAPPED_PLACEHOLDER_VALUE}
                            onValueChange={(value) => handleColumnMapChange(header, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select field or leave unmapped" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNMAPPED_PLACEHOLDER_VALUE}>-- Unmapped --</SelectItem>
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
                  <h3 className="text-md font-semibold mb-2">Data Preview (First {csvPreview.length} Rows)</h3>
                  <div className="overflow-x-auto border rounded-md p-2 bg-muted/30 max-h-60">
                    <Table className="text-xs">
                       <TableHeader><TableRow>{csvHeaders.map((h, index) => <TableHead key={`${h}-preview-header-${index}`}>{h}</TableHead>)}</TableRow></TableHeader>
                       <TableBody>
                        {csvPreview.map((row, rowIndex) => (
                          <TableRow key={`preview-row-${rowIndex}`}>{csvHeaders.map((h, cellIndex) => <TableCell key={`${h}-preview-cell-${rowIndex}-${cellIndex}`} className="max-w-[100px] truncate" title={row[h]}>{row[h]}</TableCell>)}</TableRow>
                        ))}
                       </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-between">
               <Button type="button" variant="outline" onClick={() => { setImportStep('upload'); setProgressValue(0); setIsLoading(false); setError(null); }}>Back</Button>
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
                <p className="mb-4">The import process is complete. Review any messages above for details.</p>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-2">
                <Button variant="outline" onClick={resetForm}>Import Another File</Button>
                <Button asChild><Link href="/transactions">View Transactions</Link></Button>
            </CardFooter>
         </Card>
      )}

    </div>
  );
}
