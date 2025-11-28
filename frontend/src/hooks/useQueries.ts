import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useActor } from './useActor';

// Hook for sending messages to the backend
export function useSendMessage() {
  const { actor, isFetching } = useActor();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      if (!actor) {
        throw new Error('Backend actor not initialized');
      }
      return actor.sendMessage(message);
    },
    onSuccess: () => {
      // Invalidate any relevant queries if needed
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}
