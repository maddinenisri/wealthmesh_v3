import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createSchedule,
  dismissSuggestion,
  getRecurring,
  reviewSchedule,
  type ScheduleBody,
  type Suggestion,
} from '../api/recurring'

export const recurringKey = ['recurring'] as const

export function useRecurring() {
  return useQuery({ queryKey: recurringKey, queryFn: getRecurring })
}

/** A review writes nothing: it asks the server what the schedule would look like. */
export function useReviewSchedule() {
  return useMutation({ mutationFn: (body: ScheduleBody) => reviewSchedule(body) })
}

export function useDismissSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ suggestion, memberId }: { suggestion: Suggestion; memberId: string }) =>
      dismissSuggestion(suggestion, memberId),
    onSuccess: (overview) => queryClient.setQueryData(recurringKey, overview),
  })
}

/** A schedule moves no money, so only the recurring list refreshes. */
export function useCreateSchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: ScheduleBody }) => createSchedule(key, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey }),
  })
}
