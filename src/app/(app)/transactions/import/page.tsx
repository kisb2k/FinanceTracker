
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
import { Loader2, UploadCloud, FileText, CheckCircle, XCircle, Wand2, ArrowRight, Brain, ListChecks, Review, Edit3 } from "lucide-react";
import type { Account, Category as CategoryType, Transaction } from '@/lib/types';
import { mapCsvColumns, type MapCsvColumnsOutput, type MappingEntry } from '@/ai/flows/map-csv-columns';
import { categorizeTransaction } from '@/ai/flows/categorize-transaction';
import { Progress } from '@/components/ui/progress';
import { getAccounts, updateAccountLastImported } from '@/services/accountService';
import { addTransaction, type AddTransactionData } from '@/services/transactionService';
import { getCategories, addCategory } from '@/services/categoryService';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];
const UNMAPPED_PLACEHOLDER_VALUE = "__UNMAPPED_PLACEHOLDER__";
const AI_CONFIDENCE_THRESHOLD = 0.7;
const AI_NEW_CATEGORY_CONFIDENCE_THRESHOLD = 0.5;

type ImportStep = 'upload' | 'map_columns' | 'ai_category_analysis' | 'review_ai_categories' | 'processing' | 'complete';

interface CsvRow {
  [key: string]: string;
}

interface AiCategoryReviewItem {
  id: string; // typically originalCsvCategory, or a generated ID if original is empty
  originalCsvCategory: string;
  aiSuggestedDbCategoryMatch?: string; // If AI matched to an existing DB category
  aiSuggestedNewCategoryName?: string; // If AI suggests creating a new one
  aiConfidence?: number;
  
  // User's choice for this originalCsvCategory
  userDecision: 'ai_suggestion_db_match' | 'ai_suggestion_new' | 'pick_existing' | 'keep_original_as_new' | 'custom_new' | 'no_ai_suggestion_keep_original';
  finalCategoryName: string; // What will be used for transactions / created. Editable.
  selectedExistingDbCategoryId?: string; // if userDecision is 'pick_existing'
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
  
  const [aiCategoryReviewItems, setAiCategoryReviewItems] = useState<AiCategoryReviewItem[]>([]);
  
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
      setProgressValue(20);
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
    setProgressValue(30);
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


  const handleStartAiCategoryAnalysis = async () => {
    if (!csvDataRows.length) {
      setPageError("No data rows to analyze.");
      return;
    }
    const categoryCsvHeader = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    if (!categoryCsvHeader) {
      toast({ title: "Skipping AI Categorization", description: "Category column not mapped. Proceeding to import.", variant: "default"});
      setAiCategoryReviewItems([]); // Ensure it's empty
      setImportStep('processing'); // Skip review if no category column
      setProgressValue(70);
      setCurrentTaskMessage("Preparing to import transactions...");
      // Directly call handleStartActualImport or a similar function if review is skipped
      // For now, let's assume it goes to 'processing' and then 'complete'
      // This might need a direct path to saving transactions if review is truly skipped.
      // For simplicity now, we'll rely on user clicking "Confirm & Import" even if review list is empty.
      handleStartActualImport();
      return;
    }

    setIsLoading(true);
    setImportStep('ai_category_analysis');
    setCurrentTaskMessage('AI analyzing CSV categories...');
    setProgressValue(40);

    const uniqueCsvCategories = Array.from(new Set(
      csvDataRows.map(row => (row[categoryCsvHeader] || "").trim())
                 .filter(cat => cat !== "" && cat.toLowerCase() !== "uncategorized")
    ));

    if (uniqueCsvCategories.length === 0) {
        toast({ title: "No Categories for AI", description: "No unique categories found in CSV data for AI analysis (excluding empty or 'uncategorized').", variant: "default"});
        setAiCategoryReviewItems([]);
        setImportStep('review_ai_categories'); // Still go to review step, it will show empty
        setIsLoading(false);
        setProgressValue(60);
        setCurrentTaskMessage("AI analysis complete. Ready for review.");
        return;
    }

    const reviewItemsPromises = uniqueCsvCategories.map(async (originalCsvCat, index) => {
      setProgressValue(40 + Math.floor(((index + 1) / uniqueCsvCategories.length) * 20));
      const existingDbMatch = dbCategories.find(dbCat => dbCat.name.toLowerCase() === originalCsvCat.toLowerCase());

      if (existingDbMatch) {
        return {
          id: originalCsvCat,
          originalCsvCategory: originalCsvCat,
          aiSuggestedDbCategoryMatch: existingDbMatch.name,
          userDecision: 'ai_suggestion_db_match',
          finalCategoryName: existingDbMatch.name,
        } as AiCategoryReviewItem;
      }

      try {
        const aiResult = await categorizeTransaction({
          transactionDescription: originalCsvCat,
          availableCategories: dbCategories.map(c => c.name)
        });
        const aiSuggestedName = aiResult.suggestedCategory.trim();
        const aiConfidence = aiResult.confidence;

        const aiSuggestionMatchesExistingDb = dbCategories.find(dbCat => dbCat.name.toLowerCase() === aiSuggestedName.toLowerCase());

        if (aiSuggestionMatchesExistingDb && aiConfidence >= AI_CONFIDENCE_THRESHOLD) {
          return {
            id: originalCsvCat,
            originalCsvCategory: originalCsvCat,
            aiSuggestedDbCategoryMatch: aiSuggestionMatchesExistingDb.name,
            aiConfidence: aiConfidence,
            userDecision: 'ai_suggestion_db_match',
            finalCategoryName: aiSuggestionMatchesExistingDb.name,
          } as AiCategoryReviewItem;
        } else if (aiSuggestedName && aiConfidence >= AI_NEW_CATEGORY_CONFIDENCE_THRESHOLD && !aiSuggestionMatchesExistingDb) {
          return {
            id: originalCsvCat,
            originalCsvCategory: originalCsvCat,
            aiSuggestedNewCategoryName: aiSuggestedName,
            aiConfidence: aiConfidence,
            userDecision: 'ai_suggestion_new',
            finalCategoryName: aiSuggestedName,
          } as AiCategoryReviewItem;
        }
      } catch (aiError) {
        console.error(`AI categorization error for "${originalCsvCat}":`, aiError);
        // Fall through to default (keep original)
      }
      
      // Default if AI fails or doesn't give a confident suggestion
      return {
        id: originalCsvCat,
        originalCsvCategory: originalCsvCat,
        userDecision: 'no_ai_suggestion_keep_original', // Or 'keep_original_as_new'
        finalCategoryName: originalCsvCat,
      } as AiCategoryReviewItem;
    });

    const resolvedReviewItems = await Promise.all(reviewItemsPromises);
    setAiCategoryReviewItems(resolvedReviewItems);
    setImportStep('review_ai_categories');
    setIsLoading(false);
    setProgressValue(60);
    setCurrentTaskMessage("AI analysis complete. Please review category suggestions.");
  };

  const handleCategoryReviewChange = (originalCatId: string, field: keyof AiCategoryReviewItem, value: any) => {
    setAiCategoryReviewItems(prevItems => 
      prevItems.map(item => {
        if (item.id === originalCatId) {
          const updatedItem = { ...item, [field]: value };
          // If userDecision changes, reset finalCategoryName or selectedExistingDbCategoryId accordingly
          if (field === 'userDecision') {
            if (value === 'ai_suggestion_db_match') updatedItem.finalCategoryName = item.aiSuggestedDbCategoryMatch || item.originalCsvCategory;
            else if (value === 'ai_suggestion_new') updatedItem.finalCategoryName = item.aiSuggestedNewCategoryName || item.originalCsvCategory;
            else if (value === 'pick_existing') { /* Keep existing finalCategoryName or prompt user */ }
            else if (value === 'keep_original_as_new' || value === 'no_ai_suggestion_keep_original') updatedItem.finalCategoryName = item.originalCsvCategory;
            else if (value === 'custom_new') updatedItem.finalCategoryName = ""; // Clear for user input
            updatedItem.selectedExistingDbCategoryId = undefined;
          }
          if (field === 'selectedExistingDbCategoryId' && value !== "") {
             updatedItem.finalCategoryName = dbCategories.find(c => c.id === value)?.name || item.finalCategoryName;
          }
          return updatedItem;
        }
        return item;
      })
    );
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
    setImportStep('processing');
    setCurrentTaskMessage('Phase 1: Processing category decisions...');
    setProgressValue(70); 

    const categoryNameToDbNameMap = new Map<string, string>();
    let currentDbCategories = [...dbCategories];

    for (const reviewItem of aiCategoryReviewItems) {
        let categoryForTransaction = reviewItem.finalCategoryName.trim();
        if (!categoryForTransaction) { // If user cleared it or it was empty
            categoryForTransaction = reviewItem.originalCsvCategory; // Fallback to original
        }
        
        const needsCreation = (reviewItem.userDecision === 'keep_original_as_new' || 
                               reviewItem.userDecision === 'custom_new' ||
                              (reviewItem.userDecision === 'ai_suggestion_new' && reviewItem.aiSuggestedNewCategoryName)) &&
                              !currentDbCategories.some(c => c.name.toLowerCase() === categoryForTransaction.toLowerCase());

        if (needsCreation && categoryForTransaction) {
            try {
                const newCat = await addCategory({ name: categoryForTransaction });
                currentDbCategories.push(newCat); // Update local cache of DB categories
                categoryNameToDbNameMap.set(reviewItem.originalCsvCategory, newCat.name);
                 toast({title: "Category Created", description: `Category "${newCat.name}" was successfully created.`});
            } catch (catError) {
                const errorMsg = (catError as Error).message || `Failed to create category "${categoryForTransaction}"`;
                toast({ title: "Category Creation Failed", description: errorMsg, variant: "destructive" });
                setImportErrors(prev => [...prev, errorMsg]);
                // Fallback: use original CSV category string for transactions if creation fails
                categoryNameToDbNameMap.set(reviewItem.originalCsvCategory, reviewItem.originalCsvCategory);
            }
        } else if (categoryForTransaction) {
             const existingMatch = currentDbCategories.find(c => c.name.toLowerCase() === categoryForTransaction.toLowerCase());
             categoryNameToDbNameMap.set(reviewItem.originalCsvCategory, existingMatch ? existingMatch.name : categoryForTransaction);
        } else { // Fallback if finalCategoryName ended up empty
            categoryNameToDbNameMap.set(reviewItem.originalCsvCategory, reviewItem.originalCsvCategory);
        }
    }
    
    // Refresh dbCategories if any were added
    if (aiCategoryReviewItems.some(item => item.userDecision === 'keep_original_as_new' || item.userDecision === 'custom_new' || (item.userDecision === 'ai_suggestion_new' && item.aiSuggestedNewCategoryName))) {
        try {
            const fetchedCategories = await getCategories();
            setDbCategories(fetchedCategories);
            currentDbCategories = [...fetchedCategories]; // Ensure currentDbCategories is fully up-to-date
            // Re-populate categoryNameToDbNameMap with exact names from DB for any newly created ones
             for (const reviewItem of aiCategoryReviewItems) {
                let finalName = categoryNameToDbNameMap.get(reviewItem.originalCsvCategory) || reviewItem.originalCsvCategory;
                const dbMatch = currentDbCategories.find(c => c.name.toLowerCase() === finalName.toLowerCase());
                if (dbMatch) categoryNameToDbNameMap.set(reviewItem.originalCsvCategory, dbMatch.name);
             }

        } catch (fetchErr) {
            setImportErrors(prev => [...prev, "Error refreshing categories after additions. Original names will be used."]);
        }
    }


    setCurrentTaskMessage('Phase 2: Importing transactions...');
    setProgressValue(80);
    let importedCount = 0;
    let localImportErrors: string[] = [];

    const categoryCsvHeader = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    const dateCol = Object.keys(columnMap).find(h => columnMap[h] === 'date')!;
    const descriptionCol = Object.keys(columnMap).find(h => columnMap[h] === 'description')!;
    const amountCol = Object.keys(columnMap).find(h => columnMap[h] === 'amount')!;

    for (let i = 0; i < csvDataRows.length; i++) {
      const rowData = csvDataRows[i];
      setProgressValue(80 + Math.floor(((i + 1) / csvDataRows.length) * 15)); 
      
      const transactionDateStr = rowData[dateCol] || '';
      const transactionDescriptionStr = rowData[descriptionCol] || '';
      const transactionAmountStr = rowData[amountCol] || '';
      
      let originalCsvCategoryStr = "Uncategorized"; 
      if (categoryCsvHeader && rowData[categoryCsvHeader] && rowData[categoryCsvHeader].trim() !== '') {
          originalCsvCategoryStr = rowData[categoryCsvHeader].trim();
      }
      
      const finalCategoryForTx = categoryCsvHeader ? (categoryNameToDbNameMap.get(originalCsvCategoryStr) || originalCsvCategoryStr) : "Uncategorized";

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
        category: finalCategoryForTx, 
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
        `Import complete. ${importedCount} transactions saved with reviewed categories.`
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
      title: importedCount > 0 ? "Import Process Complete" : "Import Finished with Issues",
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
    setAiCategoryReviewItems([]);
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
                <Wand2 className="inline ml-2 h-4 w-4 text-primary" /> Essential fields: Date, Description, Amount. Category is recommended.
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
               <Button 
                 onClick={handleStartAiCategoryAnalysis} 
                 disabled={isLoading || !Object.values(columnMap).includes('date') || !Object.values(columnMap).includes('description') || !Object.values(columnMap).includes('amount')}
               >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Analyze Categories with AI
              </Button>
            </CardFooter>
        </Card>
      )}
      
      {importStep === 'ai_category_analysis' && (
         <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>AI Analyzing Categories...</CardTitle>
              <CardDescription>Please wait while AI processes the categories from your CSV file.</CardDescription>
            </CardHeader>
            <CardContent>
                <Progress value={progressValue} className="w-full" />
                {currentTaskMessage && <p className="text-sm text-muted-foreground text-center mt-3 animate-pulse">{currentTaskMessage}</p>}
            </CardContent>
         </Card>
      )}

      {importStep === 'review_ai_categories' && (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Step 3: Review AI Category Suggestions</CardTitle>
                <CardDescription>Review AI's suggestions for your CSV categories. Adjust as needed before importing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {aiCategoryReviewItems.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No categories required AI review or no categories were mapped for processing.</p>
                ) : (
                <div className="overflow-x-auto max-h-[60vh]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[25%]">Original CSV Category</TableHead>
                                <TableHead className="w-[30%]">AI Suggestion</TableHead>
                                <TableHead className="w-[45%]">Your Decision & Final Category</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {aiCategoryReviewItems.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-medium align-top">{item.originalCsvCategory}</TableCell>
                                    <TableCell className="align-top">
                                        {item.aiSuggestedDbCategoryMatch && <p>Match: <span className="font-semibold">{item.aiSuggestedDbCategoryMatch}</span> (Conf: {item.aiConfidence?.toFixed(2)})</p>}
                                        {item.aiSuggestedNewCategoryName && <p>Suggest New: <span className="font-semibold">{item.aiSuggestedNewCategoryName}</span> (Conf: {item.aiConfidence?.toFixed(2)})</p>}
                                        {!item.aiSuggestedDbCategoryMatch && !item.aiSuggestedNewCategoryName && <p className="text-muted-foreground italic">No confident AI suggestion.</p>}
                                    </TableCell>
                                    <TableCell className="space-y-2 align-top">
                                        <Select 
                                            value={item.userDecision} 
                                            onValueChange={(value) => handleCategoryReviewChange(item.id, 'userDecision', value)}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Choose action" /></SelectTrigger>
                                            <SelectContent>
                                                {item.aiSuggestedDbCategoryMatch && <SelectItem value="ai_suggestion_db_match">Use AI Match: "{item.aiSuggestedDbCategoryMatch}"</SelectItem>}
                                                {item.aiSuggestedNewCategoryName && <SelectItem value="ai_suggestion_new">Use AI New: "{item.aiSuggestedNewCategoryName}"</SelectItem>}
                                                <SelectItem value="pick_existing">Pick Existing DB Category</SelectItem>
                                                <SelectItem value="keep_original_as_new">Keep Original: "{item.originalCsvCategory}" (as new if needed)</SelectItem>
                                                <SelectItem value="custom_new">Define Custom New Category</SelectItem>
                                                {!item.aiSuggestedDbCategoryMatch && !item.aiSuggestedNewCategoryName && <SelectItem value="no_ai_suggestion_keep_original">Keep Original: "{item.originalCsvCategory}"</SelectItem>}
                                            </SelectContent>
                                        </Select>
                                        
                                        {(item.userDecision === 'pick_existing') && (
                                             <Select
                                                value={item.selectedExistingDbCategoryId || ""}
                                                onValueChange={(value) => handleCategoryReviewChange(item.id, 'selectedExistingDbCategoryId', value)}
                                            >
                                                <SelectTrigger><SelectValue placeholder="Select DB category..." /></SelectTrigger>
                                                <SelectContent>
                                                    {dbCategories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        )}
                                        {(item.userDecision === 'custom_new') && (
                                            <Input 
                                                placeholder="Enter custom category name" 
                                                value={item.finalCategoryName === item.originalCsvCategory || item.finalCategoryName === item.aiSuggestedDbCategoryMatch || item.finalCategoryName === item.aiSuggestedNewCategoryName ? "" : item.finalCategoryName}
                                                onChange={(e) => handleCategoryReviewChange(item.id, 'finalCategoryName', e.target.value)}
                                            />
                                        )}
                                        {(item.userDecision !== 'custom_new' && item.userDecision !== 'pick_existing') && (
                                           <p className="text-sm text-muted-foreground mt-1">Final: <span className="font-medium">{item.finalCategoryName}</span></p>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                )}
            </CardContent>
            <CardFooter className="justify-between">
                 <Button type="button" variant="outline" onClick={() => setImportStep('map_columns')}>Back to Column Mapping</Button>
                 <Button onClick={handleStartActualImport} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
                    Confirm Categories & Import Transactions
                </Button>
            </CardFooter>
        </Card>
      )}

      {importStep === 'processing' && (
        <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Processing Import...</CardTitle>
              <CardDescription>
                Your file is being imported with reviewed categories. Please wait. This may take a few moments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <Progress value={progressValue} className="w-full mb-4" />
                 {currentTaskMessage && <p className="text-sm text-muted-foreground text-center animate-pulse">{currentTaskMessage}</p>}
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

