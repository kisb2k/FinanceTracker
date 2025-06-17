
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
  subDays,
  subYears,
  differenceInCalendarDays,
  type Duration
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

export interface DateRangeResult {
  current: {
    startDate: Date | null;
    endDate: Date | null;
  };
  previous: {
    startDate: Date | null;
    endDate: Date | null;
  } | null; // Previous period might not always be applicable (e.g., for 'all_time')
}

export function getDateRanges(period: PeriodOptionValue): DateRangeResult {
  const today = new Date();
  let currentStartDate: Date | null = null;
  let currentEndDate: Date | null = null;
  let previousStartDate: Date | null = null;
  let previousEndDate: Date | null = null;

  switch (period) {
    case 'current_month':
      currentStartDate = startOfMonth(today);
      currentEndDate = endOfMonth(today);
      previousStartDate = startOfMonth(subMonths(today, 1));
      previousEndDate = endOfMonth(subMonths(today, 1));
      break;
    case 'last_month':
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      currentStartDate = lastMonthStart;
      currentEndDate = endOfMonth(lastMonthStart);
      const monthBeforeLastStart = startOfMonth(subMonths(today, 2));
      previousStartDate = monthBeforeLastStart;
      previousEndDate = endOfMonth(monthBeforeLastStart);
      break;
    case 'year_to_date':
      currentStartDate = startOfYear(today);
      currentEndDate = endOfDay(today);
      const prevYearStart = startOfYear(subYears(today, 1));
      // Ensure the 'to-date' part matches for the previous year
      const daysIntoYear = differenceInCalendarDays(today, startOfYear(today));
      previousStartDate = prevYearStart;
      previousEndDate = endOfDay(subDays(startOfDay(prevYearStart), -daysIntoYear)); // Add days to prev year start
      break;
    case 'current_week':
      currentStartDate = startOfWeek(today, { weekStartsOn: 1 });
      currentEndDate = endOfWeek(today, { weekStartsOn: 1 });
      previousStartDate = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      previousEndDate = endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      break;
    case 'last_week':
      const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
      currentStartDate = lastWeekStart;
      currentEndDate = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
      const weekBeforeLastStart = startOfWeek(subWeeks(today, 2), { weekStartsOn: 1 });
      previousStartDate = weekBeforeLastStart;
      previousEndDate = endOfWeek(weekBeforeLastStart, { weekStartsOn: 1 });
      break;
    case 'today':
      currentStartDate = startOfDay(today);
      currentEndDate = endOfDay(today);
      previousStartDate = startOfDay(subDays(today, 1));
      previousEndDate = endOfDay(subDays(today, 1));
      break;
    case 'yesterday':
      const yesterdayStart = startOfDay(subDays(today, 1));
      currentStartDate = yesterdayStart;
      currentEndDate = endOfDay(yesterdayStart);
      const dayBeforeYesterdayStart = startOfDay(subDays(today, 2));
      previousStartDate = dayBeforeYesterdayStart;
      previousEndDate = endOfDay(dayBeforeYesterdayStart);
      break;
    case 'all_time':
      currentStartDate = null;
      currentEndDate = null;
      // No meaningful previous period for 'all_time' comparison in this context
      previousStartDate = null;
      previousEndDate = null;
      break;
    default:
      currentStartDate = null;
      currentEndDate = null;
      previousStartDate = null;
      previousEndDate = null;
  }
  
  return {
    current: { startDate: currentStartDate, endDate: currentEndDate },
    previous: (previousStartDate && previousEndDate) ? { startDate: previousStartDate, endDate: previousEndDate } : null,
  };
}
