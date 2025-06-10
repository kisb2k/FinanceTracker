// src/ai/flows/categorize-transaction.ts
'use server';

/**
 * @fileOverview An AI agent that suggests categories for transactions.
 *
 * - categorizeTransaction - A function that suggests categories for a transaction.
 * - CategorizeTransactionInput - The input type for the categorizeTransaction function.
 * - CategorizeTransactionOutput - The return type for the categorizeTransaction function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CategorizeTransactionInputSchema = z.object({
  transactionDescription: z
    .string()
    .describe('The description of the transaction.'),
  availableCategories: z
    .string()
    .array()
    .describe('The available categories for the transaction.'),
});
export type CategorizeTransactionInput = z.infer<
  typeof CategorizeTransactionInputSchema
>;

const CategorizeTransactionOutputSchema = z.object({
  suggestedCategory: z
    .string()
    .describe('The suggested category for the transaction.'),
  confidence: z
    .number()
    .describe('The confidence level of the suggested category.'),
});
export type CategorizeTransactionOutput = z.infer<
  typeof CategorizeTransactionOutputSchema
>;

export async function categorizeTransaction(
  input: CategorizeTransactionInput
): Promise<CategorizeTransactionOutput> {
  return categorizeTransactionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'categorizeTransactionPrompt',
  input: {schema: CategorizeTransactionInputSchema},
  output: {schema: CategorizeTransactionOutputSchema},
  prompt: `You are a personal finance expert. Given a transaction description and a list of available categories, you will suggest the most appropriate category for the transaction.

Transaction Description: {{{transactionDescription}}}
Available Categories: {{#each availableCategories}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

Output the suggested category and a confidence level (0-1) for your suggestion. The confidence level should reflect how certain you are that the suggested category is correct.

{
  "suggestedCategory": "",
  "confidence": 0.0
}`,
});

const categorizeTransactionFlow = ai.defineFlow(
  {
    name: 'categorizeTransactionFlow',
    inputSchema: CategorizeTransactionInputSchema,
    outputSchema: CategorizeTransactionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
