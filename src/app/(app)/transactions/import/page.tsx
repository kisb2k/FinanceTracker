
'use client';

import { useState, ChangeEvent, FormEvent, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UploadCloud, FileText, CheckCircle, XCircle, Wand2, ArrowRight, Brain } from "lucide-react";
import type { Account, Category as CategoryType } from '@/lib/types';
import { mapCsvColumns, type MapCsvColumnsOutput, type MappingEntry } from '@/ai/flows/map-csv-columns';
import { categorizeTransaction, type CategorizeTransactionInput, type CategorizeTransactionOutput } from '@/ai/flows/categorize-transaction';
import { Progress } from '@/components/ui/progress';
import { getAccounts, updateAccountLastImported } from '@/services/accountService';
import { addTransaction, type AddTransactionData, updateMultipleTransactions } from '@/services/transactionService';
import { getCategories, addCategory } from '@/services/categoryService';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];
const UNMAPPED_PLACEHOLDER_VALUE = "__UNMAPPED_PLACEHOLDER__";
const AI_CONFIDENCE_THRESHOLD = 0.7;

type ImportStep = 'upload' | 'map_columns' | 'processing' | 'complete';

interface CsvRow {
  [key: string]: string;
}

interface ImportedTransactionDetail {
  id: string;
  originalCategory: string;
}

export default function ImportTransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null); 

  const [dbCategories, setDbCategories] = useState<CategoryType[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTaskMessage, setCurrentTaskMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [categoryProcessingLog, setCategoryProcessingLog] = useState<string[]>([]);

  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvFileContent, setCsvFileContent] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvDataRows, setCsvDataRows] = useState<CsvRow[]>([]);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [progressValue, setProgressValue] = useState(0);
  const [importedTransactionDetails, setImportedTransactionDetails] = useState<ImportedTransactionDetail[]>([]);

  const { toast } = useToast();

  const fetchRequiredData = useCallback(async () => {
    setIsAccountsLoading(true);
    setPageError(null);
    setCurrentTaskMessage('Loading accounts and categories...');
    try {
      const [fetchedAccounts, fetchedCategories] = await Promise.all([
        getAccounts(),
        getCategories()
      ]);
      setAccounts(fetchedAccounts);
      setDbCategories(fetchedCategories);
      setCurrentTaskMessage('');
    } catch (e) {
      const errorMsg = (e as Error).message || "Failed to load accounts or categories for import.";
      setPageError(errorMsg);
      toast({ title: "Error Loading Initial Data", description: errorMsg, variant: "destructive" });
      setCurrentTaskMessage('');
    } finally {
      setIsAccountsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequiredData();
  }, [fetchRequiredData]);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setPageError(null); 
        setCsvFileContent(''); 
        const reader = new FileReader();
        reader.onload = (e) => {
            setCsvFileContent(e.target?.result as string);
        };
        reader.onerror = () => {
            console.error("FileReader error object:", reader.error);
            const specificMessage = reader.error?.message || 'Unknown read error';
            let userFriendlyMessage = `Error reading file: "${file.name}". Message: ${specificMessage}. Please try again or use a different file.`;
            if (reader.error?.name === "NotReadableError" || specificMessage.toLowerCase().includes("notreadableerror") || specificMessage.includes("permission problems") || specificMessage.includes("could not be read")) {
                userFriendlyMessage = `Could not read the file: "${file.name}". This might be due to file permission issues, the file being moved/changed after selection, or browser restrictions. Please check the file and try again, or select a different file.`;
            }
            setPageError(userFriendlyMessage);
            setSelectedFile(null); 
            setCsvFileContent(''); 
        };
        reader.readAsText(file);
      } else {
        setSelectedFile(null);
        setCsvFileContent('');
        setPageError('Invalid file type. Please upload a CSV file.');
      }
    }
  };

  const parseCsvContent = (content: string, previewOnly: boolean = false) => {
    const lines = content.split(/\r\n|\n|\r/);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const dataLines = previewOnly ? lines.slice(1, 6) : lines.slice(1);

    const rows = dataLines.filter(line => line.trim() !== '').map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || '';
        return obj;
      }, {} as CsvRow);
    });
    return { headers, rows };
  };


  const handleProceedToMapping = async () => {
    if (!selectedFile || !selectedAccountId || !csvFileContent) {
      setPageError('Please select a file, an account, and ensure file content is loaded.');
      return;
    }
    setIsLoading(true);
    setPageError(null);
    setCurrentTaskMessage('Parsing CSV and suggesting column mappings...');
    setProgressValue(10);

    const { headers: parsedHeaders, rows: parsedPreviewRows } = parseCsvContent(csvFileContent, true);
    setCsvHeaders(parsedHeaders);
    setCsvPreview(parsedPreviewRows);
    
    const { rows: fullDataRows } = parseCsvContent(csvFileContent, false);
    setCsvDataRows(fullDataRows);

    try {
      setProgressValue(30);
      const aiMapInputCsv = csvFileContent.split(/\r\n|\n|\r/).slice(0, 10).join('\n');
      const aiResult: MapCsvColumnsOutput = await mapCsvColumns({ csvData: aiMapInputCsv });
      if (aiResult && Array.isArray(aiResult.columnMappings)) {
        const newColumnMap = aiResult.columnMappings.reduce((acc, mapping: MappingEntry) => {
          if (mapping.csvHeader && parsedHeaders.includes(mapping.csvHeader)) {
            acc[mapping.csvHeader] = mapping.transactionField || '';
          }
          return acc;
        }, {} as Record<string, string>);
        parsedHeaders.forEach(header => {
          if (!(header in newColumnMap)) {
            newColumnMap[header] = '';
          }
        });
        setColumnMap(newColumnMap);
        toast({ title: "AI Mapping Successful", description: "Column suggestions applied." });
      } else {
        throw new Error("AI mapping result was not in the expected format.");
      }
    } catch (aiMapError) {
      console.error("AI Column Mapping Error:", aiMapError);
      setPageError('AI column mapping failed. Please map columns manually.');
      toast({ title: "AI Mapping Failed", description: (aiMapError as Error).message || "Could not map columns using AI.", variant: "destructive" });
      const fallbackMap = parsedHeaders.reduce((acc, header) => ({ ...acc, [header]: '' }), {});
      setColumnMap(fallbackMap);
    }
    setProgressValue(50);
    setImportStep('map_columns');
    setIsLoading(false);
    setCurrentTaskMessage('');
  };

  const handleColumnMapChange = (csvHeader: string, transactionField: string) => {
    setColumnMap(prev => ({ ...prev, [csvHeader]: transactionField === UNMAPPED_PLACEHOLDER_VALUE ? "" : transactionField }));
  };
  
  const parseDateString = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const commonFormats = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MM-dd-yyyy', 'dd-MM-yyyy', 'M/d/yy', 'M/dd/yyyy', 'MM/d/yyyy', 'yyyy/MM/dd', 'MM/dd/yy'];
    for (const fmt of commonFormats) {
        try {
            const parsed = parseDateFns(dateStr, fmt, new Date());
            if (!isNaN(parsed.valueOf()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) { 
                 return formatDateFns(parsed, 'yyyy-MM-dd');
            }
        } catch (e) { /* try next format */ }
    }
    try { 
        const parsed = new Date(dateStr);
         if (!isNaN(parsed.valueOf()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
            return formatDateFns(parsed, 'yyyy-MM-dd');
        }
    } catch(e) { /* give up */ }
    
    console.warn(`Could not parse date: ${dateStr}`);
    return null; 
  };

  const runAICategorizationAndUpdate = async (
    localImportedDetails: ImportedTransactionDetail[],
    currentDbCategories: CategoryType[]
  ): Promise<{ updatedCategoryCount: number; newCategoriesAddedCount: number; localProcessingLog: string[] }> => {
    
    let updatedCategoryCount = 0;
    let newCategoriesAddedCount = 0;
    const localProcessingLog: string[] = [];
    let categoriesToCreateNames: string[] = [];
    const categoryUpdateMap: Map<string, string> = new Map(); // originalCsvCategory -> finalDbCategoryName

    setCurrentTaskMessage('Starting AI-driven category analysis...');
    setProgressValue(60);
    localProcessingLog.push("Starting AI category processing for imported transactions.");

    const uniqueOriginalCategories = Array.from(new Set(localImportedDetails.map(d => d.originalCategory).filter(cat => cat && cat.trim() !== '' && cat !== 'Uncategorized')));
    localProcessingLog.push(`Found ${uniqueOriginalCategories.length} unique original categories from import to process with AI.`);
    
    let tempDbCategories = [...currentDbCategories];

    for (let i = 0; i < uniqueOriginalCategories.length; i++) {
      const originalCsvCat = uniqueOriginalCategories[i];
      setCurrentTaskMessage(`AI Processing: "${originalCsvCat}" (${i+1}/${uniqueOriginalCategories.length})`);
      setProgressValue(60 + Math.floor(((i + 1) / uniqueOriginalCategories.length) * 20));

      const existingDbMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === originalCsvCat.toLowerCase());

      if (existingDbMatch) {
        localProcessingLog.push(`Original category "${originalCsvCat}" matches existing DB category "${existingDbMatch.name}". No AI needed.`);
        if (originalCsvCat !== existingDbMatch.name) { // Case difference
             categoryUpdateMap.set(originalCsvCat, existingDbMatch.name);
        }
        continue;
      }

      try {
        const aiResult = await categorizeTransaction({
          transactionDescription: originalCsvCat,
          availableCategories: tempDbCategories.map(c => c.name)
        });
        localProcessingLog.push(`AI for "${originalCsvCat}": Suggested "${aiResult.suggestedCategory}", Confidence: ${aiResult.confidence.toFixed(2)}`);

        const aiSuggestedDbCategoryMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === aiResult.suggestedCategory.toLowerCase());

        if (aiSuggestedDbCategoryMatch && aiResult.confidence >= AI_CONFIDENCE_THRESHOLD) {
          localProcessingLog.push(`AI mapped CSV "${originalCsvCat}" to existing DB category "${aiSuggestedDbCategoryMatch.name}".`);
          categoryUpdateMap.set(originalCsvCat, aiSuggestedDbCategoryMatch.name);
        } else {
          const categoryNameToConsider = aiResult.suggestedCategory || originalCsvCat;
          localProcessingLog.push(`AI suggests "${categoryNameToConsider}" for "${originalCsvCat}". Marked for potential creation/check.`);
           if (!tempDbCategories.some(c => c.name.toLowerCase() === categoryNameToConsider.toLowerCase()) && !categoriesToCreateNames.some(n => n.toLowerCase() === categoryNameToConsider.toLowerCase())) {
               categoriesToCreateNames.push(categoryNameToConsider);
           }
           categoryUpdateMap.set(originalCsvCat, categoryNameToConsider); // Tentatively map to this, will be finalized after creation
        }
      } catch (aiError) {
        localProcessingLog.push(`Error processing category "${originalCsvCat}" with AI: ${(aiError as Error).message}. Using original name.`);
        categoryUpdateMap.set(originalCsvCat, originalCsvCat); // Fallback to original
      }
    }
    setCategoryProcessingLog(prev => [...prev, ...localProcessingLog]);


    if (categoriesToCreateNames.length > 0) {
      setCurrentTaskMessage(`Creating ${categoriesToCreateNames.length} new categories...`);
      setProgressValue(80);
      const tempLog: string[] = [`Attempting to create ${categoriesToCreateNames.length} new categories: ${categoriesToCreateNames.join(', ')}`];
      
      for (const catNameToCreate of categoriesToCreateNames) {
        try {
          if (!tempDbCategories.some(c => c.name.toLowerCase() === catNameToCreate.toLowerCase())) {
            const newCat = await addCategory({ name: catNameToCreate });
            tempDbCategories.push(newCat);
            newCategoriesAddedCount++;
            tempLog.push(`Successfully created new category: "${newCat.name}".`);
             // Update categoryUpdateMap for original CSV categories that were supposed to map to this new one
             for (const [originalCsv, mappedTo] of categoryUpdateMap.entries()) {
                if (mappedTo.toLowerCase() === newCat.name.toLowerCase()) {
                    categoryUpdateMap.set(originalCsv, newCat.name);
                }
             }
          } else {
             tempLog.push(`Category "${catNameToCreate}" already exists or was resolved. Ensuring mapping.`);
             const existingCatForUpdate = tempDbCategories.find(c => c.name.toLowerCase() === catNameToCreate.toLowerCase());
             if (existingCatForUpdate) {
                for (const [originalCsv, mappedTo] of categoryUpdateMap.entries()) {
                    if (mappedTo.toLowerCase() === existingCatForUpdate.name.toLowerCase()) {
                        categoryUpdateMap.set(originalCsv, existingCatForUpdate.name);
                    }
                }
             }
          }
        } catch (createError) {
          tempLog.push(`Failed to create category "${catNameToCreate}": ${(createError as Error).message}. It might already exist.`);
        }
      }
      setCategoryProcessingLog(prev => [...prev, ...tempLog]);
      if (newCategoriesAddedCount > 0) {
        toast({ title: "Categories Created", description: `${newCategoriesAddedCount} new categories added.` });
        setDbCategories([...tempDbCategories]); // Update main dbCategories state
      }
    }
    
    setCurrentTaskMessage('Updating transaction categories based on AI analysis...');
    setProgressValue(90);
    const updateLog: string[] = [];

    for (const [originalCsvCat, finalDbCatName] of categoryUpdateMap.entries()) {
      if (originalCsvCat.toLowerCase() !== finalDbCatName.toLowerCase()) { // Only update if different
        const transactionsToUpdateIds = localImportedDetails
          .filter(detail => detail.originalCategory.toLowerCase() === originalCsvCat.toLowerCase())
          .map(detail => detail.id);

        if (transactionsToUpdateIds.length > 0) {
          try {
            await updateMultipleTransactions(transactionsToUpdateIds, { category: finalDbCatName });
            updatedCategoryCount += transactionsToUpdateIds.length;
            updateLog.push(`Updated ${transactionsToUpdateIds.length} transactions from "${originalCsvCat}" to "${finalDbCatName}".`);
          } catch (updateError) {
            updateLog.push(`Error updating transactions for category "${originalCsvCat}": ${(updateError as Error).message}`);
          }
        }
      }
    }
    setCategoryProcessingLog(prev => [...prev, ...updateLog]);
    
    return { updatedCategoryCount, newCategoriesAddedCount, localProcessingLog: [...localProcessingLog, ...updateLog] };
  };


  const handleSubmitImport = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!selectedFile || !selectedAccountId || Object.keys(columnMap).length === 0) {
      setPageError('File, account, and column mappings are required.');
      return;
    }
    
    const mappedFields = Object.values(columnMap).filter(field => field !== '');
    if (mappedFields.length === 0) {
       setPageError('Please map at least one CSV column to a transaction field.');
       return;
    }
    if (!mappedFields.includes('date') || !mappedFields.includes('amount') || !mappedFields.includes('description')) {
        setPageError('Essential fields (date, amount, description) must be mapped.');
        return;
    }

    setIsLoading(true);
    setPageError(null);
    setSuccessMessage(null);
    setImportErrors([]);
    setCategoryProcessingLog([]);
    setImportedTransactionDetails([]);
    setImportStep('processing');
    setCurrentTaskMessage('Phase 1: Importing transactions with original categories...');
    setProgressValue(10);

    let importedCount = 0;
    let localImportErrors: string[] = [];
    const localImportedDetails: ImportedTransactionDetail[] = [];

    const categoryCol = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    const dateCol = Object.keys(columnMap).find(h => columnMap[h] === 'date')!;
    const descriptionCol = Object.keys(columnMap).find(h => columnMap[h] === 'description')!;
    const amountCol = Object.keys(columnMap).find(h => columnMap[h] === 'amount')!;

    for (let i = 0; i < csvDataRows.length; i++) {
      const rowData = csvDataRows[i];
      setProgressValue(10 + Math.floor(((i + 1) / csvDataRows.length) * 40)); // 10% to 50% for initial import
      
      const transactionDateStr = rowData[dateCol] || '';
      const transactionDescriptionStr = rowData[descriptionCol] || '';
      const transactionAmountStr = rowData[amountCol] || '';
      const originalCsvCategoryStr = categoryCol ? (rowData[categoryCol] || '').trim() : 'Uncategorized';
      
      const parsedDate = parseDateString(transactionDateStr);
      const parsedAmount = parseFloat(transactionAmountStr.replace(/[^0-9.-]+/g,""));

      if (!parsedDate) {
        localImportErrors.push(`Row ${i + 2}: Invalid/unparseable date "${transactionDateStr}". Skipping.`);
        continue;
      }
      if (isNaN(parsedAmount)) {
        localImportErrors.push(`Row ${i + 2}: Invalid amount "${transactionAmountStr}". Skipping.`);
        continue;
      }
      if (!transactionDescriptionStr) {
        localImportErrors.push(`Row ${i + 2}: Missing description. Skipping.`);
        continue;
      }
      
      // For initial import, try to match original category to existing DB category for consistent casing, otherwise use raw.
      const existingDbCatMatch = dbCategories.find(c => c.name.toLowerCase() === originalCsvCategoryStr.toLowerCase());
      const categoryForInitialImport = existingDbCatMatch ? existingDbCatMatch.name : originalCsvCategoryStr || 'Uncategorized';

      const transactionToImport: AddTransactionData = {
        accountId: selectedAccountId,
        date: parsedDate,
        description: transactionDescriptionStr,
        amount: parsedAmount,
        category: categoryForInitialImport, 
        fileName: selectedFile.name,
      };

      try {
        const newTx = await addTransaction(transactionToImport);
        localImportedDetails.push({ id: newTx.id, originalCategory: originalCsvCategoryStr || 'Uncategorized' });
        importedCount++;
      } catch (txError) {
        localImportErrors.push(`Row ${i + 2} ("${transactionDescriptionStr.substring(0,20)}..."): ${(txError as Error).message}`);
      }
    }
    setImportedTransactionDetails(localImportedDetails);
    setImportErrors(prev => [...prev, ...localImportErrors]);

    if (importedCount > 0) {
      try {
          await updateAccountLastImported(selectedAccountId);
      } catch (accUpdateError) {
          setImportErrors(prev => [...prev, `Failed to update account's last import date: ${(accUpdateError as Error).message}`]);
      }
      setCategoryProcessingLog(prev => [...prev, `Successfully imported ${importedCount} transactions with their original categories.`]);
    } else if (localImportErrors.length > 0 && importedCount === 0) {
       setPageError(`No transactions were imported. See issues below.`);
    } else if (csvDataRows.length === 0) {
       setPageError(`No data rows found in the CSV file after the header.`);
    }
    setProgressValue(50);

    // --- Phase 2: AI Categorization and Update ---
    if (importedCount > 0) {
        setCurrentTaskMessage('Phase 2: AI processing and updating categories...');
        const { updatedCategoryCount, newCategoriesAddedCount, localProcessingLog: aiLog } = await runAICategorizationAndUpdate(localImportedDetails, dbCategories);
        setCategoryProcessingLog(prev => [...prev, ...aiLog]);
        setSuccessMessage(
          `Import complete. ${importedCount} transactions initially imported. ${updatedCategoryCount} transactions had their categories updated by AI. ${newCategoriesAddedCount} new categories created.`
        );
        if (newCategoriesAddedCount > 0) { // Refresh dbCategories if new ones were added
            const freshCategories = await getCategories();
            setDbCategories(freshCategories);
        }
    } else {
        setSuccessMessage(`Initial import finished. ${importedCount} transactions imported. No AI categorization performed as no transactions were successfully imported initially.`);
    }

    setIsLoading(false);
    setImportStep('complete');
    setProgressValue(100);
    setCurrentTaskMessage('');
    toast({
      title: importedCount > 0 ? "Import & Categorization Complete" : "Import Finished with Issues",
      description: successMessage || `${importedCount} transactions processed. Check logs for details.`,
      variant: importedCount > 0 && importErrors.length === 0 ? "default" : "destructive"
    });
  };

  const resetForm = () => {
    setSelectedFile(null);
    setSelectedAccountId('');
    setPageError(null);
    setSuccessMessage(null);
    setImportErrors([]);
    setCategoryProcessingLog([]);
    setImportStep('upload');
    setCsvFileContent('');
    setCsvHeaders([]);
    setCsvDataRows([]);
    setCsvPreview([]);
    setColumnMap({});
    setProgressValue(0);
    setIsLoading(false);
    setCurrentTaskMessage('');
    setImportedTransactionDetails([]);
    fetchRequiredData();
  };


  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Import Transactions</h1>
        {importStep !== 'upload' && (
            <Button variant="outline" onClick={resetForm}>Start New Import</Button>
        )}
      </div>

      {isLoading && currentTaskMessage && (
        <div className="flex items-center justify-center p-4 my-2 bg-muted rounded-md">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
            <span>{currentTaskMessage}</span>
        </div>
      )}
      {importStep !== 'complete' && <Progress value={progressValue} className="w-full mb-4" />}

      {pageError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
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
                <ul className="list-disc list-inside max-h-40 overflow-y-auto text-xs">
                    {importErrors.slice(0,10).map((err, idx) => <li key={`import-err-${idx}`}>{err}</li>)}
                    {importErrors.length > 10 && <li>And {importErrors.length-10} more errors...</li>}
                </ul>
            </AlertDescription>
        </Alert>
      )}
      {categoryProcessingLog.length > 0 && importStep === 'complete' && (
         <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">AI Categorization Log</CardTitle></CardHeader>
            <CardContent>
                <div className="max-h-60 overflow-y-auto text-xs p-2 border rounded-md bg-muted/50 space-y-1">
                    {categoryProcessingLog.map((log, idx) => <p key={`cat-log-final-${idx}`}>{log}</p>)}
                </div>
            </CardContent>
         </Card>
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
                disabled={isAccountsLoading || !!pageError || accounts.length === 0}
              >
                <SelectTrigger id="account-select">
                  <SelectValue placeholder={
                    isAccountsLoading ? "Loading accounts..." :
                    pageError && accounts.length === 0 ? "Error loading accounts" : 
                    accounts.length === 0 ? "No accounts available" :
                    "Select an account"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {accounts.length > 0 && !isAccountsLoading && accounts.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.type})</SelectItem>
                  ))}
                   {accounts.length === 0 && !isAccountsLoading && !pageError && (
                     <div className="p-2 text-sm text-muted-foreground">No accounts found. Please add an account on the Accounts page.</div>
                   )}
                </SelectContent>
              </Select>
              {pageError && accounts.length === 0 && <p className="text-xs text-destructive">{pageError}</p>}
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
              disabled={!selectedFile || !selectedAccountId || isLoading || isAccountsLoading || !!pageError || !csvFileContent}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
              Proceed to Column Mapping
            </Button>
          </CardFooter>
        </Card>
      )}

      {importStep === 'map_columns' && (
        <Card className="shadow-lg">
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
               <Button type="button" variant="outline" onClick={() => { setImportStep('upload'); setProgressValue(0); setIsLoading(false); setPageError(null); }}>Back to Upload</Button>
               <Button onClick={handleSubmitImport} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Confirm Mappings and Import
              </Button>
            </CardFooter>
        </Card>
      )}
      
      {importStep === 'processing' && (
        <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Processing Import...</CardTitle>
              <CardDescription>
                Your file is being imported and categories are being analyzed. Please wait.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Progress value={progressValue} className="w-full mb-4" />
                 {currentTaskMessage && <p className="text-sm text-muted-foreground text-center animate-pulse">{currentTaskMessage}</p>}
                 {categoryProcessingLog.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-sm mb-1">Processing Log:</h4>
                        <div className="max-h-60 overflow-y-auto text-xs p-2 border rounded-md bg-muted/50 space-y-1">
                            {categoryProcessingLog.map((log, idx) => <p key={`cat-log-proc-${idx}`}>{log}</p>)}
                        </div>
                    </div>
                 )}
            </CardContent>
        </Card>
      )}


      {importStep === 'complete' && (
         <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Import Process Finished</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="mb-4">The import process is complete. Review any messages and logs for details.</p>
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


    