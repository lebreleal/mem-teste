import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import GlobalLoading from "@/components/GlobalLoading";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ExamNotificationProvider } from "@/hooks/useExamNotifications";
import ProtectedRoute from "@/components/ProtectedRoute";
import ScrollToTop from "@/components/ScrollToTop";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DeckDetail = lazy(() => import("./pages/DeckDetail"));
const Study = lazy(() => import("./pages/Study"));
const ManageDeck = lazy(() => import("./pages/ManageDeck"));
const DeckSettings = lazy(() => import("./pages/DeckSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const Turmas = lazy(() => import("./pages/Turmas"));
const TurmaDetail = lazy(() => import("./pages/TurmaDetail"));
const LessonDetail = lazy(() => import("./pages/LessonDetail"));
const TurmaExamTake = lazy(() => import("./pages/TurmaExamTake"));
const TurmaExamResults = lazy(() => import("./pages/TurmaExamResults"));
const MemoGrana = lazy(() => import("./pages/MemoGrana"));
const ExamSetup = lazy(() => import("./pages/ExamSetup"));
const ExamCreate = lazy(() => import("./pages/ExamCreate"));
const ExamTake = lazy(() => import("./pages/ExamTake"));
const ExamResults = lazy(() => import("./pages/ExamResults"));
const ActivityView = lazy(() => import("./pages/ActivityView"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Performance = lazy(() => import("./pages/Performance"));
const Missions = lazy(() => import("./pages/Missions"));
const AIAgent = lazy(() => import("./pages/AIAgent"));
const AdminIA = lazy(() => import("./pages/AdminIA"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminLogs = lazy(() => import("./pages/AdminLogs"));
const Install = lazy(() => import("./pages/Install"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
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
                <Route path="/study/folder/:folderId" element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/study/:deckId" element={<ProtectedRoute><Study /></ProtectedRoute>} />
                <Route path="/decks/:deckId/manage" element={<ProtectedRoute><ManageDeck /></ProtectedRoute>} />
                <Route path="/decks/:deckId/settings" element={<ProtectedRoute><DeckSettings /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
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
                <Route path="/missoes" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
                <Route path="/ia" element={<ProtectedRoute><AIAgent /></ProtectedRoute>} />
                <Route path="/admin/ia" element={<ProtectedRoute><AdminIA /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
                <Route path="/admin/logs" element={<ProtectedRoute><AdminLogs /></ProtectedRoute>} />
                <Route path="/install" element={<Install />} />
                <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos-e-servicos" element={<TermsOfService />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ExamNotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
