
import { 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  startOfYear, 
  endOfYear,
  startOfWeek,
  endOfWeek,
  subWeeks,
  startOfDay,
  endOfDay,
  subDays
} from 'date-fns';

export type PeriodOptionValue = 
  | 'current_month' 
  | 'last_month' 
  | 'year_to_date' 
  | 'all_time'
  | 'current_week'
  | 'last_week'
  | 'today'
  | 'yesterday';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

export function getDateRange(period: PeriodOptionValue): DateRange {
  const today = new Date();
  let startDate: Date | null = null;
  let endDate: Date | null = null;

  switch (period) {
    case 'current_month':
      startDate = startOfMonth(today);
      endDate = endOfMonth(today);
      break;
    case 'last_month':
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      startDate = lastMonthStart;
      endDate = endOfMonth(lastMonthStart);
      break;
    case 'year_to_date':
      startDate = startOfYear(today);
      endDate = endOfDay(today); // Use endOfDay to include all transactions of today
      break;
    case 'current_week':
      startDate = startOfWeek(today, { weekStartsOn: 1 }); // Assuming week starts on Monday
      endDate = endOfWeek(today, { weekStartsOn: 1 });
      break;
    case 'last_week':
      const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      startDate = lastWeekStart;
      endDate = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
      break;
    case 'today':
      startDate = startOfDay(today);
      endDate = endOfDay(today);
      break;
    case 'yesterday':
      const yesterdayStart = startOfDay(subDays(today, 1));
      startDate = yesterdayStart;
      endDate = endOfDay(yesterdayStart);
      break;
    case 'all_time':
      startDate = null; // Indicate no start date filter
      endDate = null;   // Indicate no end date filter
      break;
    default: // Should not happen with TypeScript, but good for safety
      startDate = null;
      endDate = null;
  }
  return { startDate, endDate };
}
