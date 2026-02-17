import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ExamNotificationProvider } from "@/hooks/useExamNotifications";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DeckDetail from "./pages/DeckDetail";
import Study from "./pages/Study";
import ManageDeck from "./pages/ManageDeck";
import DeckSettings from "./pages/DeckSettings";
import Profile from "./pages/Profile";
import Turmas from "./pages/Turmas";
import TurmaDetail from "./pages/TurmaDetail";
import LessonDetail from "./pages/LessonDetail";

import TurmaExamTake from "./pages/TurmaExamTake";
import TurmaExamResults from "./pages/TurmaExamResults";

import MemoGrana from "./pages/MemoGrana";
import ExamSetup from "./pages/ExamSetup";
import ExamCreate from "./pages/ExamCreate";
import ExamTake from "./pages/ExamTake";
import ExamResults from "./pages/ExamResults";
import ActivityView from "./pages/ActivityView";
import Feedback from "./pages/Feedback";
import Performance from "./pages/Performance";
import Missions from "./pages/Missions";
import AIAgent from "./pages/AIAgent";
import AdminIA from "./pages/AdminIA";
import AdminUsers from "./pages/AdminUsers";
import AdminLogs from "./pages/AdminLogs";
import ScrollToTop from "@/components/ScrollToTop";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ExamNotificationProvider>
            <ScrollToTop />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ExamNotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
