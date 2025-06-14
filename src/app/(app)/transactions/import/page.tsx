
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
import { Loader2, UploadCloud, FileText, CheckCircle, XCircle, Wand2, ArrowRight, Brain, ListChecks, Review } from "lucide-react";
import type { Account, Category as CategoryType, Transaction } from '@/lib/types';
import { mapCsvColumns, type MapCsvColumnsOutput, type MappingEntry } from '@/ai/flows/map-csv-columns';
import { categorizeTransaction } from '@/ai/flows/categorize-transaction';
import { Progress } from '@/components/ui/progress';
import { getAccounts, updateAccountLastImported } from '@/services/accountService';
import { addTransaction, type AddTransactionData, updateMultipleTransactions } from '@/services/transactionService';
import { getCategories, addCategory } from '@/services/categoryService';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];
const UNMAPPED_PLACEHOLDER_VALUE = "__UNMAPPED_PLACEHOLDER__";
const AI_CONFIDENCE_THRESHOLD = 0.7; 
const AI_NEW_CATEGORY_CONFIDENCE_THRESHOLD = 0.5; 

type ImportStep = 'upload' | 'map_columns' | 'processing' | 'complete';

interface CsvRow {
  [key: string]: string;
}

interface ImportedTransactionPlaceholder {
  id: string; 
  originalData: AddTransactionData; 
  originalCsvCategory: string; // The category string as it appeared in the CSV or "Uncategorized" if empty/unmapped
}

interface CategoryProcessingResult {
  originalCsvCategory: string;
  aiSuggestedCategory?: string;
  aiConfidence?: number;
  finalCategoryToUse: string; 
  actionTaken: 'direct_db_match' | 'ai_matched_to_db' | 'ai_suggested_new_and_created' | 'original_used_as_new_and_created' | 'ai_suggestion_resolved_to_existing_db' | 'creation_failed_resolved_to_existing_db' | 'creation_failed_defaulted_to_uncategorized' | 'ai_error_defaulted_to_uncategorized';
  notes: string;
}


export default function ImportTransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [dbCategories, setDbCategories] = useState<CategoryType[]>([]);
  const [isDbCategoriesLoading, setIsDbCategoriesLoading] = useState(true);

  const [pageError, setPageError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTaskMessage, setCurrentTaskMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvFileContent, setCsvFileContent] = useState<string>('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvDataRows, setCsvDataRows] = useState<CsvRow[]>([]);
  const [csvPreview, setCsvPreview] = useState<CsvRow[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [progressValue, setProgressValue] = useState(0);
  
  const [categoryProcessingLog, setCategoryProcessingLog] = useState<CategoryProcessingResult[]>([]);
  
  const { toast } = useToast();

  const fetchRequiredData = useCallback(async () => {
    setIsAccountsLoading(true);
    setIsDbCategoriesLoading(true);
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
      setIsDbCategoriesLoading(false);
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
        throw new Error("AI mapping result was not in the expected array format or was undefined.");
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

  const runAICategorizationAndUpdateTransactions = async (
    initiallyImportedPlaceholders: ImportedTransactionPlaceholder[],
    currentDbCategories: CategoryType[]
  ): Promise<{ updatedTransactionsCount: number; log: CategoryProcessingResult[] }> => {
    
    const localProcessingLog: CategoryProcessingResult[] = [];
    let tempDbCategories = [...currentDbCategories];
    const categoryUpdateMap = new Map<string, string>(); // originalCsvCategory -> finalDbCategoryName
    let transactionsToUpdateCount = 0;

    const uniqueOriginalCsvCategories = Array.from(new Set(
      initiallyImportedPlaceholders
        .map(p => p.originalCsvCategory)
        .filter(cat => cat && cat.trim() !== '' && cat.toLowerCase() !== 'uncategorized') // Exclude "Uncategorized" and empty strings
    ));

    setCurrentTaskMessage('Phase 2: AI analyzing categories...');
    for (let i = 0; i < uniqueOriginalCsvCategories.length; i++) {
      const originalCsvCat = uniqueOriginalCsvCategories[i];
      setProgressValue(70 + Math.floor(((i + 1) / uniqueOriginalCsvCategories.length) * 15)); // 70-85%

      let finalCategoryToUse = "Uncategorized"; // Default fallback for this originalCsvCat
      let actionTaken: CategoryProcessingResult['actionTaken'] = 'ai_error_defaulted_to_uncategorized'; // Default action
      let notes = `Starting analysis for CSV category: "${originalCsvCat}".`;
      let aiSuggestedName: string | undefined = undefined;
      let aiConfidence: number | undefined = undefined;

      const existingDbMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === originalCsvCat.toLowerCase());

      if (existingDbMatch) {
        finalCategoryToUse = existingDbMatch.name;
        actionTaken = 'direct_db_match';
        notes = `Directly matched to existing DB category: "${existingDbMatch.name}".`;
      } else {
        try {
          const aiResult = await categorizeTransaction({
            transactionDescription: originalCsvCat, // Use original category string from CSV as "description"
            availableCategories: tempDbCategories.map(c => c.name)
          });
          aiSuggestedName = aiResult.suggestedCategory.trim();
          aiConfidence = aiResult.confidence;

          const aiSuggestionMatchesExistingDb = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === aiSuggestedName.toLowerCase());

          if (aiSuggestionMatchesExistingDb && aiConfidence >= AI_CONFIDENCE_THRESHOLD) {
            finalCategoryToUse = aiSuggestionMatchesExistingDb.name;
            actionTaken = 'ai_matched_to_db';
            notes = `AI mapped to existing DB category "${aiSuggestionMatchesExistingDb.name}" (Confidence: ${aiConfidence.toFixed(2)}).`;
          } else {
            let candidateForNewCategory = (aiSuggestedName && aiConfidence >= AI_NEW_CATEGORY_CONFIDENCE_THRESHOLD) ? aiSuggestedName : originalCsvCat;
            candidateForNewCategory = candidateForNewCategory.trim(); // Ensure no leading/trailing spaces

            if (!candidateForNewCategory) { // If candidate becomes empty string
                notes = `AI suggestion and original CSV category were effectively empty. Defaulting to "Uncategorized".`;
                actionTaken = 'ai_error_defaulted_to_uncategorized'; // Or a more specific one
                // finalCategoryToUse remains "Uncategorized"
            } else {
                const candidateAlreadyExistsInDb = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === candidateForNewCategory.toLowerCase());

                if (candidateAlreadyExistsInDb) {
                    finalCategoryToUse = candidateAlreadyExistsInDb.name;
                    actionTaken = 'ai_suggestion_resolved_to_existing_db';
                    notes = `AI suggestion ("${aiSuggestedName}") or original ("${originalCsvCat}") resolved to existing DB category "${candidateAlreadyExistsInDb.name}".`;
                } else {
                    try {
                        const newDbCat = await addCategory({ name: candidateForNewCategory });
                        tempDbCategories.push(newDbCat); 
                        finalCategoryToUse = newDbCat.name;
                        actionTaken = candidateForNewCategory === originalCsvCat ? 'original_used_as_new_and_created' : 'ai_suggested_new_and_created';
                        notes = `Successfully created new DB category: "${newDbCat.name}" based on "${candidateForNewCategory}".`;
                    } catch (createError) {
                        notes = `Failed to create new category "${candidateForNewCategory}": ${(createError as Error).message}.`;
                        const refreshedDbCategories = await getCategories(); // Re-fetch
                        setDbCategories(refreshedDbCategories);
                        tempDbCategories = [...refreshedDbCategories];
                        const finalCheckMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === candidateForNewCategory.toLowerCase());
                        if (finalCheckMatch) {
                            finalCategoryToUse = finalCheckMatch.name;
                            actionTaken = 'creation_failed_resolved_to_existing_db';
                            notes += ` Found matching DB category "${finalCheckMatch.name}" after re-fetch. Using it.`;
                        } else {
                            actionTaken = 'creation_failed_defaulted_to_uncategorized';
                            notes += ` Defaulting to "Uncategorized".`;
                            // finalCategoryToUse remains "Uncategorized"
                        }
                    }
                }
            }
          }
        } catch (aiError) {
          actionTaken = 'ai_error_defaulted_to_uncategorized';
          notes = `Error during AI processing for "${originalCsvCat}": ${(aiError as Error).message}. Defaulting to "Uncategorized".`;
          // finalCategoryToUse remains "Uncategorized"
        }
      }
      
      categoryUpdateMap.set(originalCsvCat, finalCategoryToUse);
      localProcessingLog.push({
        originalCsvCategory: originalCsvCat,
        aiSuggestedCategory: aiSuggestedName,
        aiConfidence: aiConfidence,
        finalCategoryToUse: finalCategoryToUse,
        actionTaken: actionTaken,
        notes: notes
      });
    }
    setCategoryProcessingLog(prev => [...prev, ...localProcessingLog]);

    setCurrentTaskMessage('Phase 2.2: Updating transaction categories in database...');
    setProgressValue(85);
    const transactionIdsToUpdateByCategory = new Map<string, string[]>();

    for(const placeholder of initiallyImportedPlaceholders) {
        // Only consider updating if its original category was part of the AI processing
        if (placeholder.originalCsvCategory && placeholder.originalCsvCategory.toLowerCase() !== 'uncategorized') {
            const finalCategoryName = categoryUpdateMap.get(placeholder.originalCsvCategory);
            // Update if a mapping exists and it's different from what was initially saved
            if (finalCategoryName && finalCategoryName !== placeholder.originalData.category) { 
                if (!transactionIdsToUpdateByCategory.has(finalCategoryName)) {
                    transactionIdsToUpdateByCategory.set(finalCategoryName, []);
                }
                transactionIdsToUpdateByCategory.get(finalCategoryName)!.push(placeholder.id);
            }
        }
    }
    
    let currentUpdateProgress = 0;
    const totalUpdatesToMake = Array.from(transactionIdsToUpdateByCategory.values()).reduce((sum, ids) => sum + ids.length, 0);

    for (const [finalCategoryName, txIds] of transactionIdsToUpdateByCategory) {
      if (txIds.length > 0) {
        try {
          await updateMultipleTransactions(txIds, { category: finalCategoryName });
          transactionsToUpdateCount += txIds.length;
        } catch (updateError) {
          setImportErrors(prev => [...prev, `Failed to update ${txIds.length} transactions to category "${finalCategoryName}": ${(updateError as Error).message}`]);
        }
      }
      currentUpdateProgress += txIds.length;
      setProgressValue(85 + Math.floor((currentUpdateProgress / (totalUpdatesToMake || 1)) * 10)); // 85-95%
    }

    // Reflect newly added categories in the main state if tempDbCategories was modified
    const finalDbCategories = await getCategories();
    setDbCategories(finalDbCategories);


    return { updatedTransactionsCount: transactionsToUpdateCount, log: localProcessingLog };
  };


  const handleStartActualImport = async () => {
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
    setImportStep('processing');
    setCurrentTaskMessage('Phase 1: Saving initial transactions...');
    setProgressValue(55); 

    let importedCount = 0;
    let localImportErrors: string[] = [];
    const newlyImportedPlaceholders: ImportedTransactionPlaceholder[] = [];

    const categoryCsvHeader = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    const dateCol = Object.keys(columnMap).find(h => columnMap[h] === 'date')!;
    const descriptionCol = Object.keys(columnMap).find(h => columnMap[h] === 'description')!;
    const amountCol = Object.keys(columnMap).find(h => columnMap[h] === 'amount')!;

    for (let i = 0; i < csvDataRows.length; i++) {
      const rowData = csvDataRows[i];
      setProgressValue(55 + Math.floor(((i + 1) / csvDataRows.length) * 15)); // 55-70% for initial save
      
      const transactionDateStr = rowData[dateCol] || '';
      const transactionDescriptionStr = rowData[descriptionCol] || '';
      const transactionAmountStr = rowData[amountCol] || '';
      
      let originalCsvCategoryStr = "Uncategorized"; // Default
      if (categoryCsvHeader && rowData[categoryCsvHeader] && rowData[categoryCsvHeader].trim() !== '') {
          originalCsvCategoryStr = rowData[categoryCsvHeader].trim();
      }
      
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
      
      const transactionToImport: AddTransactionData = {
        accountId: selectedAccountId,
        date: parsedDate,
        description: transactionDescriptionStr,
        amount: parsedAmount,
        category: originalCsvCategoryStr, // Use processed original category string
        fileName: selectedFile.name,
      };

      try {
        const savedTx = await addTransaction(transactionToImport);
        newlyImportedPlaceholders.push({ 
            id: savedTx.id, 
            originalData: transactionToImport, // Store original data for reference
            originalCsvCategory: originalCsvCategoryStr // This is the key for AI processing
        });
        importedCount++;
      } catch (txError) {
        localImportErrors.push(`Row ${i + 2} ("${transactionDescriptionStr.substring(0,20)}..."): ${(txError as Error).message}`);
      }
    }
    setImportErrors(prev => [...prev, ...localImportErrors]);

    if (newlyImportedPlaceholders.length > 0) {
      const { updatedTransactionsCount, log } = await runAICategorizationAndUpdateTransactions(newlyImportedPlaceholders, dbCategories);
      // categoryProcessingLog is updated within runAICategorizationAndUpdateTransactions

      try {
          await updateAccountLastImported(selectedAccountId);
      } catch (accUpdateError) {
          setImportErrors(prev => [...prev, `Failed to update account's last import date: ${(accUpdateError as Error).message}`]);
      }
      setSuccessMessage(
        `Import complete. ${importedCount} transactions initially saved. ${updatedTransactionsCount} transactions had their categories updated by AI. Check AI log for details.`
      );
    } else if (localImportErrors.length > 0 && importedCount === 0) {
       setPageError(`No transactions were imported. See issues below.`);
       setSuccessMessage(null);
    } else if (csvDataRows.length === 0) {
       setPageError(`No data rows found in the CSV file after the header.`);
       setSuccessMessage(null);
    } else {
      setSuccessMessage(`No transactions were imported, but no explicit errors occurred. The file might have been empty or all rows were skipped.`);
    }

    setIsLoading(false);
    setImportStep('complete');
    setProgressValue(100);
    setCurrentTaskMessage('');
    toast({
      title: importedCount > 0 ? "Import & Categorization Process Complete" : "Import Finished with Issues",
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
                disabled={isAccountsLoading || accounts.length === 0 || !!pageError }
              >
                <SelectTrigger id="account-select">
                  <SelectValue placeholder={
                    isAccountsLoading ? "Loading accounts..." :
                    !isAccountsLoading && accounts.length === 0 && !pageError ? "No accounts available. Add one first." :
                    "Select an account"
                  } />
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
            <Button
              onClick={handleProceedToMapping}
              disabled={!selectedFile || !selectedAccountId || isLoading || isAccountsLoading || !!pageError || !csvFileContent || isDbCategoriesLoading}
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
                      <TableRow key={`${header}-${index}-maprow`}>
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
               <Button onClick={handleStartActualImport} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Confirm Mappings & Start Import
              </Button>
            </CardFooter>
        </Card>
      )}
      
      {importStep === 'processing' && (
        <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Processing Import...</CardTitle>
              <CardDescription>
                Your file is being imported and categories analyzed. Please wait. This may take a few moments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Progress value={progressValue} className="w-full mb-4" />
                 {currentTaskMessage && <p className="text-sm text-muted-foreground text-center animate-pulse">{currentTaskMessage}</p>}
                 {categoryProcessingLog.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-sm mb-1">AI Categorization Summary (Live):</h4>
                        <div className="max-h-60 overflow-y-auto text-xs p-2 border rounded-md bg-muted/50 space-y-1">
                            {categoryProcessingLog.slice(-5).map((log, idx) => <p key={`cat-log-proc-${idx}`}>"{log.originalCsvCategory}" <ArrowRight className="inline h-3 w-3"/> "{log.finalCategoryToUse}" ({log.actionTaken.replace(/_/g, ' ')})</p>)}
                            {categoryProcessingLog.length > 5 && <p>...and more</p>}
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
                 {categoryProcessingLog.length > 0 && (
                     <div className="space-y-3">
                        <h4 className="font-semibold">AI Categorization Log (Full):</h4>
                        <div className="max-h-80 overflow-y-auto text-xs p-3 border rounded-md bg-muted/50 space-y-1.5">
                            {categoryProcessingLog.map((log, idx) => (
                                <div key={`cat-log-final-${idx}`} className="p-1.5 border-b last:border-b-0">
                                    <p><strong>Original CSV:</strong> "{log.originalCsvCategory}"</p>
                                    {log.aiSuggestedCategory && <p><strong>AI Suggestion:</strong> "{log.aiSuggestedCategory}" (Confidence: {log.aiConfidence !== undefined ? log.aiConfidence.toFixed(2) : 'N/A'})</p>}
                                    <p><strong>Action:</strong> <span className={`font-medium ${log.actionTaken.includes('created') ? 'text-green-600' : log.actionTaken.includes('failed') || log.actionTaken.includes('error') || log.actionTaken.includes('uncategorized') ? 'text-orange-600' : ''}`}>{log.actionTaken.replace(/_/g, ' ')}</span></p>
                                    <p><strong>Final Category Used:</strong> "{log.finalCategoryToUse}"</p>
                                    <p className="text-muted-foreground text-[0.7rem]"><em>Notes: {log.notes}</em></p>
                                </div>
                            ))}
                        </div>
                    </div>
                 )}
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

