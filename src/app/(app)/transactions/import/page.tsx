
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
import type { Account, Category as CategoryType } from '@/lib/types';
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

type ImportStep = 'upload' | 'map_columns' | 'review_categories' | 'processing' | 'complete';

interface CsvRow {
  [key: string]: string;
}

interface ImportedTransactionDetail {
  id: string;
  originalCategory: string;
}

interface CategoryProcessingResult {
  originalCsvCategory: string;
  aiSuggestedCategory?: string;
  aiConfidence?: number;
  finalCategoryToUse: string;
  actionTaken: 'matched_existing_db' | 'ai_matched_existing_db' | 'ai_suggested_new_or_unclear' | 'used_original_as_fallback' | 'newly_created_in_db';
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
  
  const [uniqueCsvCategories, setUniqueCsvCategories] = useState<string[]>([]);
  const [categoryProcessingResultsLog, setCategoryProcessingResultsLog] = useState<CategoryProcessingResult[]>([]);
  const [categoryUpdateMap, setCategoryUpdateMap] = useState<Map<string, string>>(new Map()); // originalCsvCategory -> finalDbCategoryName

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
      const aiMapInputCsv = csvFileContent.split(/\r\n|\n|\r/).slice(0, 10).join('\n'); // Use first 10 lines for AI mapping
      const aiResult: MapCsvColumnsOutput = await mapCsvColumns({ csvData: aiMapInputCsv });
      
      if (aiResult && Array.isArray(aiResult.columnMappings)) {
        const newColumnMap = aiResult.columnMappings.reduce((acc, mapping: MappingEntry) => {
          // Ensure the CSV header from AI exists in the actual parsed headers
          if (mapping.csvHeader && parsedHeaders.includes(mapping.csvHeader)) {
            acc[mapping.csvHeader] = mapping.transactionField || '';
          }
          return acc;
        }, {} as Record<string, string>);
        // Ensure all actual headers have an entry, defaulting to empty if not mapped by AI
        parsedHeaders.forEach(header => {
          if (!(header in newColumnMap)) {
            newColumnMap[header] = '';
          }
        });
        setColumnMap(newColumnMap);
        toast({ title: "AI Mapping Successful", description: "Column suggestions applied." });
      } else {
        // This case might indicate an issue with the AI flow's output structure not matching MapCsvColumnsOutput
        throw new Error("AI mapping result was not in the expected array format or was undefined.");
      }
    } catch (aiMapError) {
      console.error("AI Column Mapping Error:", aiMapError);
      setPageError('AI column mapping failed. Please map columns manually.');
      toast({ title: "AI Mapping Failed", description: (aiMapError as Error).message || "Could not map columns using AI.", variant: "destructive" });
      // Fallback to manual mapping: initialize columnMap with all headers pointing to empty string
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
        const parsed = new Date(dateStr); // Fallback to direct Date constructor parsing
         if (!isNaN(parsed.valueOf()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
            return formatDateFns(parsed, 'yyyy-MM-dd');
        }
    } catch(e) { /* give up */ }
    
    console.warn(`Could not parse date: ${dateStr}`);
    return null; 
  };

  const handleProceedToAICategorization = async () => {
    const categoryCsvHeader = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    if (!categoryCsvHeader) {
        toast({ title: "Category Column Not Mapped", description: "Please map a CSV column to 'category' to use AI categorization, or proceed to import directly.", variant: "destructive"});
        // Optionally, allow skipping AI categorization if no category column is mapped
        // For now, we'll require it for this flow.
        return;
    }

    setIsLoading(true);
    setCurrentTaskMessage("Preparing for AI category review...");
    setProgressValue(55);

    const uniqueCatsFromCsv = Array.from(new Set(
        csvDataRows.map(row => (row[categoryCsvHeader] || '').trim()).filter(cat => cat !== '')
    ));
    setUniqueCsvCategories(uniqueCatsFromCsv);
    
    if (uniqueCatsFromCsv.length === 0) {
        toast({ title: "No Categories Found", description: "No categories found in the mapped CSV column. Proceeding to direct import.", variant: "default" });
        setImportStep('processing'); // Go directly to processing/saving
        setIsLoading(false);
        setCurrentTaskMessage("");
        setProgressValue(60);
        return;
    }

    setCategoryProcessingResultsLog([]); // Clear previous logs
    setImportStep('review_categories');
    setIsLoading(false);
    setCurrentTaskMessage("");
    setProgressValue(60);
  };

  const runAICategorization = async () => {
    if (uniqueCsvCategories.length === 0) {
        toast({ title: "Skipping AI", description: "No categories to process with AI.", variant: "default" });
        return new Map(); // Return empty map
    }

    setIsLoading(true);
    setCurrentTaskMessage('AI processing categories...');
    setProgressValue(65);

    const localProcessingLog: CategoryProcessingResult[] = [];
    const tempFinalCategoryMap = new Map<string, string>(); // originalCsvCategory -> finalTargetDbCategoryName
    let tempDbCategories = [...dbCategories]; // Operate on a copy that can be updated

    for (let i = 0; i < uniqueCsvCategories.length; i++) {
        const originalCsvCat = uniqueCsvCategories[i];
        setCurrentTaskMessage(`AI Processing: "${originalCsvCat}" (${i+1}/${uniqueCsvCategories.length})`);
        setProgressValue(65 + Math.floor(((i + 1) / uniqueCsvCategories.length) * 20)); // 65% to 85%

        const existingDbMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === originalCsvCat.toLowerCase());

        if (existingDbMatch) {
            localProcessingLog.push({
                originalCsvCategory: originalCsvCat,
                finalCategoryToUse: existingDbMatch.name,
                actionTaken: 'matched_existing_db',
                notes: `Matched to existing DB category: "${existingDbMatch.name}".`
            });
            tempFinalCategoryMap.set(originalCsvCat, existingDbMatch.name);
            continue;
        }

        try {
            const aiResult = await categorizeTransaction({
                transactionDescription: originalCsvCat, // Using the category string as "description"
                availableCategories: tempDbCategories.map(c => c.name)
            });

            const aiSuggestedDbCategoryMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === aiResult.suggestedCategory.toLowerCase());

            if (aiSuggestedDbCategoryMatch && aiResult.confidence >= AI_CONFIDENCE_THRESHOLD) {
                localProcessingLog.push({
                    originalCsvCategory: originalCsvCat,
                    aiSuggestedCategory: aiResult.suggestedCategory,
                    aiConfidence: aiResult.confidence,
                    finalCategoryToUse: aiSuggestedDbCategoryMatch.name,
                    actionTaken: 'ai_matched_existing_db',
                    notes: `AI mapped to existing DB category "${aiSuggestedDbCategoryMatch.name}" (Confidence: ${aiResult.confidence.toFixed(2)}).`
                });
                tempFinalCategoryMap.set(originalCsvCat, aiSuggestedDbCategoryMatch.name);
            } else {
                // AI suggests a new category or is not confident enough to match existing
                const categoryNameToConsider = aiResult.suggestedCategory || originalCsvCat;
                let actionTaken: CategoryProcessingResult['actionTaken'] = 'ai_suggested_new_or_unclear';
                let notes = `AI suggested "${categoryNameToConsider}" (Confidence: ${aiResult.confidence.toFixed(2)}). Will attempt to use or create.`;
                
                // Check if this "newly suggested" category *now* exists (e.g. AI suggested "Groceries" and it's in DB)
                const newlyConsideredMatch = tempDbCategories.find(dbCat => dbCat.name.toLowerCase() === categoryNameToConsider.toLowerCase());
                if (newlyConsideredMatch) {
                    tempFinalCategoryMap.set(originalCsvCat, newlyConsideredMatch.name);
                    notes += ` Matched to DB category "${newlyConsideredMatch.name}" after AI suggestion.`;
                } else {
                    // Attempt to create it if it doesn't exist in our tempDbCategories
                    try {
                        const newCat = await addCategory({ name: categoryNameToConsider });
                        tempDbCategories.push(newCat); // Add to our temporary list
                        notes += ` Successfully created new DB category: "${newCat.name}".`;
                        actionTaken = 'newly_created_in_db';
                        tempFinalCategoryMap.set(originalCsvCat, newCat.name); // Map to the newly created one
                    } catch (createError) {
                       // If creation fails (e.g. it *just* got created by another process or a near duplicate exists)
                       // Try to find it again in case of race condition or near match not caught earlier
                       const finalCheckCat = await getCategories(); // Re-fetch latest
                       setDbCategories(finalCheckCat); // Update main state
                       tempDbCategories = [...finalCheckCat]; // Update local temp
                       const raceConditionMatch = tempDbCategories.find(c => c.name.toLowerCase() === categoryNameToConsider.toLowerCase());
                       if (raceConditionMatch) {
                           tempFinalCategoryMap.set(originalCsvCat, raceConditionMatch.name);
                           notes += ` Category "${raceConditionMatch.name}" found after creation attempt (possibly race condition). Using it.`;
                       } else {
                           tempFinalCategoryMap.set(originalCsvCat, originalCsvCat); // Fallback to original
                           notes += ` Failed to create new category "${categoryNameToConsider}": ${(createError as Error).message}. Using original CSV category as fallback.`;
                           actionTaken = 'used_original_as_fallback';
                       }
                    }
                }
                localProcessingLog.push({ originalCsvCategory: originalCsvCat, aiSuggestedCategory: aiResult.suggestedCategory, aiConfidence: aiResult.confidence, finalCategoryToUse: tempFinalCategoryMap.get(originalCsvCat) || originalCsvCat, actionTaken, notes });
            }
        } catch (aiError) {
            localProcessingLog.push({
                originalCsvCategory: originalCsvCat,
                finalCategoryToUse: originalCsvCat, // Fallback to original
                actionTaken: 'used_original_as_fallback',
                notes: `Error during AI processing for "${originalCsvCat}": ${(aiError as Error).message}. Using original CSV category.`
            });
            tempFinalCategoryMap.set(originalCsvCat, originalCsvCat);
        }
    }
    
    setCategoryProcessingResultsLog(prev => [...prev, ...localProcessingLog]);
    if (tempDbCategories.length !== dbCategories.length) { // If new categories were added
        setDbCategories(tempDbCategories); // Update main state
    }
    setIsLoading(false);
    setCurrentTaskMessage("");
    setProgressValue(85);
    toast({title: "AI Categorization Complete", description: "Review the suggestions and proceed to import."});
    return tempFinalCategoryMap;
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
    // categoryProcessingResultsLog is already populated or skipped.
    setImportStep('processing');
    setCurrentTaskMessage('Phase 1: Importing transactions with processed categories...');
    setProgressValue(85);

    let importedCount = 0;
    let localImportErrors: string[] = [];

    const categoryCsvHeader = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    const dateCol = Object.keys(columnMap).find(h => columnMap[h] === 'date')!;
    const descriptionCol = Object.keys(columnMap).find(h => columnMap[h] === 'description')!;
    const amountCol = Object.keys(columnMap).find(h => columnMap[h] === 'amount')!;

    for (let i = 0; i < csvDataRows.length; i++) {
      const rowData = csvDataRows[i];
      setProgressValue(85 + Math.floor(((i + 1) / csvDataRows.length) * 10)); // 85% to 95% for final import
      
      const transactionDateStr = rowData[dateCol] || '';
      const transactionDescriptionStr = rowData[descriptionCol] || '';
      const transactionAmountStr = rowData[amountCol] || '';
      const originalCsvCategoryStr = categoryCsvHeader ? (rowData[categoryCsvHeader] || '').trim() : 'Uncategorized';
      
      const parsedDate = parseDateString(transactionDateStr);
      const parsedAmount = parseFloat(transactionAmountStr.replace(/[^0-9.-]+/g,"")); // Strip currency symbols etc.

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
      
      const finalCategory = categoryUpdateMap.get(originalCsvCategoryStr) || originalCsvCategoryStr || 'Uncategorized';

      const transactionToImport: AddTransactionData = {
        accountId: selectedAccountId,
        date: parsedDate,
        description: transactionDescriptionStr,
        amount: parsedAmount,
        category: finalCategory, 
        fileName: selectedFile.name,
      };

      try {
        await addTransaction(transactionToImport);
        importedCount++;
      } catch (txError) {
        localImportErrors.push(`Row ${i + 2} ("${transactionDescriptionStr.substring(0,20)}..."): ${(txError as Error).message}`);
      }
    }
    setImportErrors(prev => [...prev, ...localImportErrors]);

    if (importedCount > 0) {
      try {
          await updateAccountLastImported(selectedAccountId);
      } catch (accUpdateError) {
          setImportErrors(prev => [...prev, `Failed to update account's last import date: ${(accUpdateError as Error).message}`]);
      }
      setSuccessMessage(
        `Import complete. ${importedCount} transactions imported. Check AI categorization log for details on category processing.`
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
    setCategoryProcessingResultsLog([]);
    setImportStep('upload');
    setCsvFileContent('');
    setCsvHeaders([]);
    setCsvDataRows([]);
    setCsvPreview([]);
    setColumnMap({});
    setProgressValue(0);
    setIsLoading(false);
    setCurrentTaskMessage('');
    setUniqueCsvCategories([]);
    setCategoryUpdateMap(new Map());
    fetchRequiredData(); // Re-fetch accounts and categories
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
               <Button onClick={handleProceedToAICategorization} disabled={isLoading || !Object.values(columnMap).includes('category')}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Review Categories with AI
              </Button>
            </CardFooter>
        </Card>
      )}

      {importStep === 'review_categories' && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Step 3: AI Category Review & Processing</CardTitle>
            <CardDescription>
              AI will analyze unique categories from your CSV ({uniqueCsvCategories.length} found). 
              It will try to match them to your existing database categories or suggest new ones.
              Review the log after processing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryProcessingResultsLog.length > 0 && (
                 <div className="space-y-3">
                    <h4 className="font-semibold">AI Categorization Log:</h4>
                    <div className="max-h-80 overflow-y-auto text-xs p-3 border rounded-md bg-muted/50 space-y-1.5">
                        {categoryProcessingResultsLog.map((log, idx) => (
                            <div key={`cat-log-entry-${idx}`} className="p-1.5 border-b last:border-b-0">
                                <p><strong>Original CSV:</strong> "{log.originalCsvCategory}"</p>
                                {log.aiSuggestedCategory && <p><strong>AI Suggestion:</strong> "{log.aiSuggestedCategory}" (Confidence: {log.aiConfidence?.toFixed(2)})</p>}
                                <p><strong>Action:</strong> <span className={`font-medium ${log.actionTaken === 'newly_created_in_db' ? 'text-green-600' : log.actionTaken === 'used_original_as_fallback' ? 'text-orange-600' : ''}`}>{log.actionTaken.replace(/_/g, ' ')}</span></p>
                                <p><strong>Final Category:</strong> "{log.finalCategoryToUse}"</p>
                                <p className="text-muted-foreground text-[0.7rem]"><em>Notes: {log.notes}</em></p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {uniqueCsvCategories.length === 0 && <p>No categories found in CSV to process with AI.</p>}
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="outline" onClick={() => { setImportStep('map_columns'); setProgressValue(50); setIsLoading(false); setCategoryProcessingResultsLog([]); setCategoryUpdateMap(new Map()); }}>Back to Column Mapping</Button>
            {uniqueCsvCategories.length > 0 && categoryProcessingResultsLog.length === 0 && ( // Only show "Run AI" if not yet run
                 <Button onClick={async () => {
                    const finalMap = await runAICategorization();
                    setCategoryUpdateMap(finalMap);
                 }} disabled={isLoading || isDbCategoriesLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                    Run AI Category Analysis
                </Button>
            )}
            {(categoryProcessingResultsLog.length > 0 || uniqueCsvCategories.length === 0) && ( // Show "Proceed" if AI run or no categories
                <Button onClick={handleStartActualImport} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
                    Proceed to Final Import
                </Button>
            )}
          </CardFooter>
        </Card>
      )}
      
      {importStep === 'processing' && (
        <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Processing Import...</CardTitle>
              <CardDescription>
                Your file is being imported. Categories have been analyzed. Please wait.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Progress value={progressValue} className="w-full mb-4" />
                 {currentTaskMessage && <p className="text-sm text-muted-foreground text-center animate-pulse">{currentTaskMessage}</p>}
                 {categoryProcessingResultsLog.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-sm mb-1">AI Categorization Summary (Final):</h4>
                        <div className="max-h-60 overflow-y-auto text-xs p-2 border rounded-md bg-muted/50 space-y-1">
                            {categoryProcessingResultsLog.map((log, idx) => <p key={`cat-log-proc-${idx}`}>"{log.originalCsvCategory}" <ArrowRight className="inline h-3 w-3"/> "{log.finalCategoryToUse}" ({log.actionTaken.replace(/_/g, ' ')})</p>)}
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
                 {categoryProcessingResultsLog.length > 0 && (
                     <div className="space-y-3">
                        <h4 className="font-semibold">AI Categorization Log:</h4>
                        <div className="max-h-80 overflow-y-auto text-xs p-3 border rounded-md bg-muted/50 space-y-1.5">
                            {categoryProcessingResultsLog.map((log, idx) => (
                                <div key={`cat-log-final-${idx}`} className="p-1.5 border-b last:border-b-0">
                                    <p><strong>Original CSV:</strong> "{log.originalCsvCategory}"</p>
                                    {log.aiSuggestedCategory && <p><strong>AI Suggestion:</strong> "{log.aiSuggestedCategory}" (Confidence: {log.aiConfidence?.toFixed(2)})</p>}
                                    <p><strong>Action:</strong> <span className={`font-medium ${log.actionTaken === 'newly_created_in_db' ? 'text-green-600' : log.actionTaken === 'used_original_as_fallback' ? 'text-orange-600' : ''}`}>{log.actionTaken.replace(/_/g, ' ')}</span></p>
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

