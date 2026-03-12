import { useState } from 'react';
import { apiClient } from '../config/api';

export const useSync = () => {
  const [syncing, setSyncing] = useState(false);

  const syncD2L = async () => {
    setSyncing(true);
    try {
      const { data } = await apiClient.post('/d2l/sync');
      if (__DEV__) console.log('D2L sync complete:', data);
    } catch (error) {
      console.error('Unexpected error during D2L sync:', error);
    } finally {
      setSyncing(false);
    }
  };

  return { syncD2L, syncing };
};