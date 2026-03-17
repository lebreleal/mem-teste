import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import GlobalLoading from "@/components/GlobalLoading";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ExamNotificationProvider } from "@/hooks/useExamNotifications";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";

// Retry wrapper for lazy imports — auto-reloads on stale chunk errors
function lazyRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch((err) => {
      // Only reload once to avoid infinite loops
      const key = 'chunk_reload';
      const hasReloaded = sessionStorage.getItem(key);
      if (!hasReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves, page will reload
      }
      sessionStorage.removeItem(key);
      throw err;
    })
  );
}

// Lazy-loaded pages
const Index = lazyRetry(() => import("./pages/Index"));
const Auth = lazyRetry(() => import("./pages/Auth"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const DeckDetail = lazyRetry(() => import("./pages/DeckDetail"));
const Study = lazyRetry(() => import("./pages/Study"));
const ManageDeck = lazyRetry(() => import("./pages/ManageDeck"));
const DeckSettings = lazyRetry(() => import("./pages/DeckSettings"));
const Profile = lazyRetry(() => import("./pages/Profile"));
const Turmas = lazyRetry(() => import("./pages/Turmas"));
const TurmaDetail = lazyRetry(() => import("./pages/TurmaDetail"));
const LessonDetail = lazyRetry(() => import("./pages/LessonDetail"));
const TurmaExamTake = lazyRetry(() => import("./pages/TurmaExamTake"));
const TurmaExamResults = lazyRetry(() => import("./pages/TurmaExamResults"));
const MemoGrana = lazyRetry(() => import("./pages/MemoGrana"));
const ExamSetup = lazyRetry(() => import("./pages/ExamSetup"));
const ExamCreate = lazyRetry(() => import("./pages/ExamCreate"));
const ExamTake = lazyRetry(() => import("./pages/ExamTake"));
const ExamResults = lazyRetry(() => import("./pages/ExamResults"));
const ActivityView = lazyRetry(() => import("./pages/ActivityView"));
const Feedback = lazyRetry(() => import("./pages/Feedback"));
const Performance = lazyRetry(() => import("./pages/Performance"));
const StudyPlan = lazyRetry(() => import("./pages/StudyPlan"));
const Missions = lazyRetry(() => import("./pages/Missions"));
const AIAgent = lazyRetry(() => import("./pages/AIAgent"));
const StatsPage = lazyRetry(() => import("./pages/StatsPage"));
const AdminIA = lazyRetry(() => import("./pages/AdminIA"));
const AdminUsers = lazyRetry(() => import("./pages/AdminUsers"));
const AdminLogs = lazyRetry(() => import("./pages/AdminLogs"));
const AdminTags = lazyRetry(() => import("./pages/AdminTags"));
const AdminUsageReport = lazyRetry(() => import("./pages/AdminUsageReport"));
const ErrorNotebook = lazyRetry(() => import("./pages/ErrorNotebook"));

const QuestionBank = lazyRetry(() => import("./pages/QuestionBank"));

const Install = lazyRetry(() => import("./pages/Install"));
const PrivacyPolicy = lazyRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("./pages/TermsOfService"));
const PublicDeckPreview = lazyRetry(() => import("./pages/PublicDeckPreview"));
const PublicCommunity = lazyRetry(() => import("./pages/PublicCommunity"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

const TWENTY_FOUR_HOURS = 1000 * 60 * 60 * 24;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: TWENTY_FOUR_HOURS,
      refetchOnWindowFocus: false,
    },
  },
});

/** Custom serializer that converts Map instances to a tagged format for JSON persistence. */
function serializeCache(data: unknown): string {
  return JSON.stringify(data, (_key, value) => {
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    return value;
  });
}

function deserializeCache(str: string): unknown {
  return JSON.parse(str, (_key, value) => {
    if (value && typeof value === 'object' && value.__type === 'Map' && Array.isArray(value.entries)) {
      return new Map(value.entries);
    }
    return value;
  });
}

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'memo-query-cache',
  serialize: serializeCache,
  deserialize: deserializeCache as any,
});

const App = () => (
  <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: TWENTY_FOUR_HOURS }}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <GlobalLoading />
      <BrowserRouter>
        <AuthProvider>
          <ExamNotificationProvider>
            <ScrollToTop />
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/decks/:deckId" element={<ProtectedRoute><DeckDetail /></ProtectedRoute>} />
                
                <Route path="/study" element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/study/folder/:folderId" element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/study/:deckId" element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/decks/:deckId/manage" element={<ProtectedRoute><ManageDeck /></ProtectedRoute>} />
                <Route path="/decks/:deckId/settings" element={<ProtectedRoute><DeckSettings /></ProtectedRoute>} />
                <Route path="/decks/:deckId/preview" element={<PublicDeckPreview />} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/explorar" element={<ProtectedRoute><Turmas /></ProtectedRoute>} />
                <Route path="/turmas" element={<ProtectedRoute><Turmas /></ProtectedRoute>} />
                <Route path="/turmas/:turmaId" element={<ProtectedRoute><TurmaDetail /></ProtectedRoute>} />
                <Route path="/turmas/:turmaId/lessons/:lessonId" element={<ProtectedRoute><LessonDetail /></ProtectedRoute>} />
                
                <Route path="/turmas/:turmaId/exams/:examId" element={<ProtectedRoute><TurmaExamTake /></ProtectedRoute>} />
                <Route path="/turmas/:turmaId/exams/:examId/results/:attemptId" element={<ProtectedRoute><TurmaExamResults /></ProtectedRoute>} />
                <Route path="/activity" element={<ProtectedRoute><ActivityView /></ProtectedRoute>} />
                
                <Route path="/memograna" element={<ProtectedRoute><MemoGrana /></ProtectedRoute>} />
                <Route path="/exam/new" element={<ProtectedRoute><ExamSetup /></ProtectedRoute>} />
                <Route path="/exam/new/create" element={<ProtectedRoute><ExamCreate /></ProtectedRoute>} />
                <Route path="/exam/:examId/edit" element={<ProtectedRoute><ExamCreate /></ProtectedRoute>} />
                <Route path="/exam/:examId" element={<ProtectedRoute><ExamTake /></ProtectedRoute>} />
                <Route path="/exam/:examId/results" element={<ProtectedRoute><ExamResults /></ProtectedRoute>} />
                <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
                <Route path="/planejamento" element={<ProtectedRoute><Performance /></ProtectedRoute>} />
                <Route path="/plano" element={<ProtectedRoute><StudyPlan /></ProtectedRoute>} />
                <Route path="/missoes" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
                <Route path="/ia" element={<ProtectedRoute><AIAgent /></ProtectedRoute>} />
                <Route path="/desempenho" element={<ProtectedRoute><StatsPage /></ProtectedRoute>} />
                <Route path="/caderno-de-erros" element={<ProtectedRoute><ErrorNotebook /></ProtectedRoute>} />
                
                <Route path="/banco-questoes" element={<ProtectedRoute><QuestionBank /></ProtectedRoute>} />
                <Route path="/admin/ia" element={<ProtectedRoute><AdminIA /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
                <Route path="/admin/logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
                <Route path="/admin/tags" element={<ProtectedRoute><AdminTags /></ProtectedRoute>} />
                <Route path="/admin/usage" element={<ProtectedRoute><AdminUsageReport /></ProtectedRoute>} />
                
                <Route path="/install" element={<Install />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos-e-servicos" element={<TermsOfService />} />
                <Route path="/c/:slugOrId" element={<PublicCommunity />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ExamNotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
