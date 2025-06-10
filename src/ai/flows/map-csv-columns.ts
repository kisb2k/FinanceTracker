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
  csvData: z.string().describe('The CSV data to map.'),
});

export type MapCsvColumnsInput = z.infer<typeof MapCsvColumnsInputSchema>;

const MapCsvColumnsOutputSchema = z.object({
  columnMap: z.record(z.string(), z.string()).describe('A map of CSV column names to transaction data fields.'),
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

  Given the following CSV data:

  {{csvData}}

  Return a JSON object that maps the CSV column names to the correct transaction data fields. The keys of the JSON object should be the CSV column names, and the values should be the corresponding transaction data fields.

  Example transaction data fields include: date, description, amount, category, account.

  Ensure that the JSON object is valid and can be parsed by JSON.parse().
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
