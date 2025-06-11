
'use server';

/**
 * @fileOverview Maps CSV columns to transaction data fields using AI.
 *
 * - mapCsvColumns - A function that maps CSV columns.
 * - MapCsvColumnsInput - The input type for the mapCsvColumns function.
 * - MapCsvColumnsOutput - The return type for the mapCsvColumns function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MapCsvColumnsInputSchema = z.object({
  csvData: z.string().describe('The CSV data to map. Provide at least the header row and a few data rows.'),
});

export type MapCsvColumnsInput = z.infer<typeof MapCsvColumnsInputSchema>;

const MappingEntrySchema = z.object({
  csvHeader: z.string().describe("The original CSV column header from the input data."),
  transactionField: z.string().describe("The standard transaction data field this CSV header maps to (e.g., 'date', 'description', 'amount', 'category', 'account'). Use an empty string if the column is unmapped or should be ignored.")
});

const MapCsvColumnsOutputSchema = z.object({
  columnMappings: z.array(MappingEntrySchema).describe('A list of mappings, where each mapping links a CSV column header to a standard transaction data field.'),
});

export type MapCsvColumnsOutput = z.infer<typeof MapCsvColumnsOutputSchema>;

export async function mapCsvColumns(input: MapCsvColumnsInput): Promise<MapCsvColumnsOutput> {
  return mapCsvColumnsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'mapCsvColumnsPrompt',
  input: {schema: MapCsvColumnsInputSchema},
  output: {schema: MapCsvColumnsOutputSchema},
  prompt: `You are an expert in mapping CSV column names to transaction data fields.

  Given the following CSV data (header row and potentially a few sample data rows):
  {{{csvData}}}

  Your task is to return a JSON object containing a single key "columnMappings".
  The value of "columnMappings" MUST be an array of objects.
  Each object in the array MUST have two string properties:
  1. "csvHeader": This should be a string exactly matching one of the column headers from the provided CSV data.
  2. "transactionField": This should be a string representing the standard transaction data field that the "csvHeader" maps to.

  Example standard transaction data fields include: "date", "description", "amount", "category", "account".
  
  If a CSV column header from the input does not clearly map to any standard transaction field, its corresponding "transactionField" value in the object should be an empty string ("").
  Ensure every CSV header from the input data is represented in the "columnMappings" array.

  Ensure the output is a valid JSON object that can be parsed by JSON.parse(), and strictly adheres to the schema:
  {
    "columnMappings": [
      { "csvHeader": "Header1FromCSV", "transactionField": "date" },
      { "csvHeader": "Header2FromCSV", "transactionField": "description" },
      { "csvHeader": "UnmappedHeader", "transactionField": "" }
    ]
  }
  `,
});

const mapCsvColumnsFlow = ai.defineFlow(
  {
    name: 'mapCsvColumnsFlow',
    inputSchema: MapCsvColumnsInputSchema,
    outputSchema: MapCsvColumnsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
