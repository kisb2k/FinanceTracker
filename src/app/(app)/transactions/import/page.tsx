
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
import { addTransaction, type AddTransactionData } from '@/services/transactionService';
import { getCategories, addCategory } from '@/services/categoryService';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns, parse as parseDateFns } from 'date-fns';

const expectedTransactionFields = ['date', 'description', 'amount', 'category'];
const UNMAPPED_PLACEHOLDER_VALUE = "__UNMAPPED_PLACEHOLDER__";
const AI_CONFIDENCE_THRESHOLD = 0.7;

type ImportStep = 'upload' | 'map_columns' | 'categorize_ai' | 'review' | 'complete';

interface CsvRow {
  [key: string]: string;
}

export default function ImportTransactionsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null); // Consolidated error state

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
  const [aiCategoryMap, setAiCategoryMap] = useState<Record<string, string>>({});
  const [progressValue, setProgressValue] = useState(0);
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
        setPageError(null); // Clear previous errors
        const reader = new FileReader();
        reader.onload = (e) => {
            setCsvFileContent(e.target?.result as string);
        };
        reader.onerror = (e) => {
            console.error("FileReader error:", e);
            setPageError("Error reading file. Please try again or use a different file.");
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
  
  const handleProceedToAICategorization = async () => {
     if (Object.values(columnMap).filter(field => field !== '').length === 0) {
       setPageError('Please map at least one CSV column to a transaction field.');
       toast({ title: "Mapping Incomplete", description: "At least one column must be mapped.", variant: "destructive"});
       return;
    }
    const mappedCategoryHeader = Object.keys(columnMap).find(header => columnMap[header] === 'category');
    if (!mappedCategoryHeader) {
        toast({ title: "No Category Column Mapped", description: "Skipping AI categorization. You can map a category column to enable this.", variant: "default" });
        setImportStep('review');
        setProgressValue(90);
        return;
    }

    setIsLoading(true);
    setCurrentTaskMessage('Analyzing categories with AI...');
    setProgressValue(60);
    setCategoryProcessingLog([]);

    const csvCategoryColumnName = Object.keys(columnMap).find(h => columnMap[h] === 'category');
    if (!csvCategoryColumnName) {
      setCurrentTaskMessage('Category column not mapped. Skipping AI categorization.');
      setImportStep('review'); 
      setIsLoading(false);
      setProgressValue(80);
      return;
    }

    const uniqueCsvCategories = Array.from(new Set(csvDataRows.map(row => row[csvCategoryColumnName]).filter(cat => cat && cat.trim() !== '')));
    const existingDbCategoryNames = new Set(dbCategories.map(cat => cat.name.toLowerCase()));
    const currentDbCategoriesByName = dbCategories.reduce((acc, cat) => {
      acc[cat.name.toLowerCase()] = cat.name; 
      return acc;
    }, {} as Record<string, string>);


    let tempAiCategoryMap: Record<string, string> = {};
    let categoriesToCreate: string[] = [];
    let localProcessingLog: string[] = [`Found ${uniqueCsvCategories.length} unique categories in CSV.`];

    for (const csvCategory of uniqueCsvCategories) {
      setCurrentTaskMessage(`AI Processing: "${csvCategory}"...`);
      if (existingDbCategoryNames.has(csvCategory.toLowerCase())) {
        const dbMatch = currentDbCategoriesByName[csvCategory.toLowerCase()];
        tempAiCategoryMap[csvCategory] = dbMatch;
        localProcessingLog.push(`"${csvCategory}" matches existing DB category "${dbMatch}".`);
      } else {
        try {
          const aiResult: CategorizeTransactionOutput = await categorizeTransaction({
            transactionDescription: csvCategory, 
            availableCategories: dbCategories.map(c => c.name)
          });

          const suggestedDbCategoryMatch = dbCategories.find(dbCat => dbCat.name.toLowerCase() === aiResult.suggestedCategory.toLowerCase());

          if (suggestedDbCategoryMatch && aiResult.confidence >= AI_CONFIDENCE_THRESHOLD) {
            tempAiCategoryMap[csvCategory] = suggestedDbCategoryMatch.name;
            localProcessingLog.push(`AI mapped CSV "${csvCategory}" to existing DB category "${suggestedDbCategoryMatch.name}" (Confidence: ${aiResult.confidence.toFixed(2)}).`);
          } else {
            tempAiCategoryMap[csvCategory] = csvCategory; 
            if (!existingDbCategoryNames.has(csvCategory.toLowerCase()) && !categoriesToCreate.find(ctc => ctc.toLowerCase() === csvCategory.toLowerCase())) {
              categoriesToCreate.push(csvCategory);
              localProcessingLog.push(`AI suggests "${csvCategory}" is a new category (or low confidence match). Marked for creation.`);
            }
          }
        } catch (aiError) {
          localProcessingLog.push(`Error processing category "${csvCategory}" with AI: ${(aiError as Error).message}. Using original.`);
          tempAiCategoryMap[csvCategory] = csvCategory; 
           if (!existingDbCategoryNames.has(csvCategory.toLowerCase()) && !categoriesToCreate.find(ctc => ctc.toLowerCase() === csvCategory.toLowerCase())) {
              categoriesToCreate.push(csvCategory);
           }
        }
      }
      setCategoryProcessingLog([...localProcessingLog]); 
    }
    
    setAiCategoryMap(tempAiCategoryMap);
    setProgressValue(75);

    if (categoriesToCreate.length > 0) {
      setCurrentTaskMessage(`Creating ${categoriesToCreate.length} new categories...`);
      localProcessingLog.push(`Attempting to create ${categoriesToCreate.length} new categories: ${categoriesToCreate.join(', ')}`);
      setCategoryProcessingLog([...localProcessingLog]);

      let newCategoriesAddedCount = 0;
      for (const catNameToCreate of categoriesToCreate) {
        try {
          const currentExistingLower = new Set([...dbCategories.map(c => c.name.toLowerCase()), ...Object.values(tempAiCategoryMap).map(c => c.toLowerCase())]);
          if (!currentExistingLower.has(catNameToCreate.toLowerCase())) {
            await addCategory({ name: catNameToCreate });
            newCategoriesAddedCount++;
            localProcessingLog.push(`Successfully created new category: "${catNameToCreate}".`);
            dbCategories.push({id: 'temp-' + catNameToCreate, name: catNameToCreate }); 
            existingDbCategoryNames.add(catNameToCreate.toLowerCase());
            currentDbCategoriesByName[catNameToCreate.toLowerCase()] = catNameToCreate;
          } else {
            localProcessingLog.push(`Category "${catNameToCreate}" already exists or was just mapped. Skipping creation.`);
          }
        } catch (createError) {
          localProcessingLog.push(`Failed to create category "${catNameToCreate}": ${(createError as Error).message}. It might already exist.`);
        }
        setCategoryProcessingLog([...localProcessingLog]);
      }
      if (newCategoriesAddedCount > 0) {
        toast({ title: "Categories Created", description: `${newCategoriesAddedCount} new categories added to database.` });
        const updatedDbCats = await getCategories();
        setDbCategories(updatedDbCats);
      }
    }
    
    setCurrentTaskMessage('AI categorization complete.');
    setImportStep('review');
    setIsLoading(false);
    setProgressValue(85);
  };


  const parseDateString = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const commonFormats = ['MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'MM-dd-yyyy', 'dd-MM-yyyy', 'M/d/yy', 'M/dd/yyyy', 'MM/d/yyyy'];
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
    setCurrentTaskMessage('Importing transactions...');
    setProgressValue(90);

      let importedCount = 0;
      let localImportErrors: string[] = [];

      const categoryCol = Object.keys(columnMap).find(h => columnMap[h] === 'category');
      const dateCol = Object.keys(columnMap).find(h => columnMap[h] === 'date')!;
      const descriptionCol = Object.keys(columnMap).find(h => columnMap[h] === 'description')!;
      const amountCol = Object.keys(columnMap).find(h => columnMap[h] === 'amount')!;

      for (let i = 0; i < csvDataRows.length; i++) {
        const rowData = csvDataRows[i];
        
        const transactionDateStr = rowData[dateCol] || '';
        const transactionDescriptionStr = rowData[descriptionCol] || '';
        const transactionAmountStr = rowData[amountCol] || '';
        const originalCsvCategoryStr = categoryCol ? (rowData[categoryCol] || '') : 'Uncategorized';
        
        const finalCategoryName = aiCategoryMap[originalCsvCategoryStr] || originalCsvCategoryStr || 'Uncategorized';
        
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
          category: finalCategoryName,
          fileName: selectedFile.name,
        };

        try {
          await addTransaction(transactionToImport);
          importedCount++;
        } catch (txError) {
          localImportErrors.push(`Row ${i + 2} ("${transactionDescriptionStr.substring(0,20)}..."): ${(txError as Error).message}`);
        }
        setProgressValue(90 + Math.floor(((i + 1) / csvDataRows.length) * 9));
      }

      if (importedCount > 0) {
        try {
            await updateAccountLastImported(selectedAccountId);
        } catch (accUpdateError) {
            localImportErrors.push(`Failed to update account's last import date: ${(accUpdateError as Error).message}`);
        }
        setSuccessMessage(`${importedCount} transaction(s) imported successfully for account ${accounts.find(a=>a.id === selectedAccountId)?.name}.`);
      } else if (localImportErrors.length > 0 && importedCount === 0) {
         setPageError(`No transactions were imported. See issues below.`);
      } else if (localImportErrors.length === 0 && importedCount === 0 && csvDataRows.length > 0) {
         setPageError(`No transactions were imported. The file might have been processed, but no valid transactions were found or created.`);
      } else if (csvDataRows.length === 0) {
         setPageError(`No data rows found in the CSV file after the header.`);
      }


      setImportErrors(localImportErrors);
      setImportStep('complete');
      setIsLoading(false);
      setProgressValue(100);
      setCurrentTaskMessage('');
      toast({
        title: importedCount > 0 ? "Import Complete" : "Import Finished with Issues",
        description: importedCount > 0 ? `${importedCount} transactions imported.` : `Import failed or had issues. Check messages.`,
        variant: importedCount > 0 && localImportErrors.length === 0 ? "default" : "destructive"
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
    setAiCategoryMap({});
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
                disabled={isAccountsLoading || !!pageError || accounts.length === 0}
              >
                <SelectTrigger id="account-select">
                  <SelectValue placeholder={
                    isAccountsLoading ? "Loading accounts..." :
                    pageError && accounts.length === 0 ? "Error loading accounts" : // Show specific error if accounts failed and list is empty
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
               <Button type="button" variant="outline" onClick={() => { setImportStep('upload'); setProgressValue(0); setIsLoading(false); setPageError(null); }}>Back</Button>
               <Button onClick={handleProceedToAICategorization} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Proceed to AI Categorization
              </Button>
            </CardFooter>
        </Card>
      )}

      {importStep === 'review' && (
        <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Step 3: Review and Import</CardTitle>
              <CardDescription>
                Review AI category suggestions and finalize the import. 
                {categoryProcessingLog.length > 0 && " See AI processing log below."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <p>Ready to import <strong>{csvDataRows.length}</strong> transaction rows from <strong>{selectedFile?.name}</strong> into account <strong>{accounts.find(a => a.id === selectedAccountId)?.name}</strong>.</p>
                
                {categoryProcessingLog.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-sm mb-1">AI Category Processing Log:</h4>
                        <div className="max-h-40 overflow-y-auto text-xs p-2 border rounded-md bg-muted/50 space-y-1">
                            {categoryProcessingLog.map((log, idx) => <p key={`cat-log-${idx}`}>{log}</p>)}
                        </div>
                    </div>
                )}

                <p className="text-sm text-muted-foreground">
                    Ensure all mappings and AI suggestions are correct.
                    Date format will be attempted to be parsed from common formats (e.g., MM/DD/YYYY, YYYY-MM-DD).
                    Amount column will be cleaned of non-numeric characters (except decimal and minus).
                </p>
            </CardContent>
            <CardFooter className="justify-between">
                <Button type="button" variant="outline" onClick={() => { setImportStep('map_columns'); setProgressValue(50); }}>Back to Mapping</Button>
                <Button onClick={handleSubmitImport} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    Confirm and Import Transactions
                </Button>
            </CardFooter>
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

