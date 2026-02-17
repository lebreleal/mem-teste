import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ExamNotification {
  id: string;
  title: string;
  examId: string;
  status: 'generating' | 'ready' | 'error';
  message?: string;
}

interface ExamNotificationContextValue {
  notifications: ExamNotification[];
  hasUnread: boolean;
  addNotification: (n: ExamNotification) => void;
  updateNotification: (id: string, updates: Partial<ExamNotification>) => void;
  clearNotifications: () => void;
  markRead: () => void;
}

const ExamNotificationContext = createContext<ExamNotificationContextValue>({
  notifications: [],
  hasUnread: false,
  addNotification: () => {},
  updateNotification: () => {},
  clearNotifications: () => {},
  markRead: () => {},
});

export const useExamNotifications = () => useContext(ExamNotificationContext);

export const ExamNotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<ExamNotification[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  const addNotification = useCallback((n: ExamNotification) => {
    setNotifications(prev => [n, ...prev]);
    if (n.status === 'ready') setHasUnread(true);
  }, []);

  const updateNotification = useCallback((id: string, updates: Partial<ExamNotification>) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    if (updates.status === 'ready') setHasUnread(true);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setHasUnread(false);
  }, []);

  const markRead = useCallback(() => setHasUnread(false), []);

  return (
    <ExamNotificationContext.Provider value={{ notifications, hasUnread, addNotification, updateNotification, clearNotifications, markRead }}>
      {children}
    </ExamNotificationContext.Provider>
  );
};
