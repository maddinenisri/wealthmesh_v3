import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRefreshMoney } from './useActivity'
import {
  changeSchedule,
  createSchedule,
  deleteSchedule,
  dismissOccurrence,
  dismissSuggestion,
  getRecurring,
  listRecurringPayments,
  pauseSchedule,
  recordActual,
  rescheduleSchedule,
  reviewRecordActual,
  type RecordBody,
  resumeSchedule,
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

/** A change keeps the schedule's id and key, so the form carries its own key (D-024). */
export function useChangeSchedule(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: ScheduleBody }) =>
      changeSchedule(id, key, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey }),
  })
}

/** Pause, resume and delete refresh the list; none of them touches an entry or a Balance. */
function useScheduleAction<V>(act: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: act,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKey }),
  })
}

export const usePauseSchedule = (id: string) =>
  useScheduleAction((memberId: string) => pauseSchedule(id, memberId))

export const useResumeSchedule = (id: string) =>
  useScheduleAction(({ dueOn, memberId }: { dueOn: string; memberId: string }) =>
    resumeSchedule(id, dueOn, memberId),
  )

export const useDeleteSchedule = (id: string) =>
  useScheduleAction((memberId: string) => deleteSchedule(id, memberId))

/** A review writes nothing: it asks the server what recording the actual expense would do. */
export const useReviewRecord = (id: string) =>
  useMutation({ mutationFn: (body: RecordBody) => reviewRecordActual(id, body) })

/** Recording saves a real expense, so the account, wealth and the month figures refresh with the list. */
export function useRecordActual(id: string, accountId: string) {
  const queryClient = useQueryClient()
  const refreshMoney = useRefreshMoney(accountId)
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: RecordBody }) => recordActual(id, key, body),
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: recurringKey }), refreshMoney()]),
  })
}

export const useRescheduleSchedule = (id: string) =>
  useScheduleAction(({ dueOn, memberId }: { dueOn: string; memberId: string }) =>
    rescheduleSchedule(id, dueOn, memberId),
  )

export const useDismissOccurrence = (id: string) =>
  useScheduleAction(({ dueOn, memberId }: { dueOn: string; memberId: string }) =>
    dismissOccurrence(id, dueOn, memberId),
  )

/** Which entries of an account paid an occurrence of a recurring bill, by entry id. */
export function useRecurringPayments(accountId: string) {
  return useQuery({
    queryKey: [...recurringKey, 'payments', accountId],
    queryFn: () => listRecurringPayments(accountId),
  })
}
