/**
 * Turma Service — Barrel export (Façade Pattern).
 * Re-exports all turma sub-modules for backward compatibility.
 * Consumers can import from '@/services/turmaService' as before.
 */

// CRUD & Discover
export {
  fetchUserTurmas,
  fetchTurma,
  fetchTurmaBySlug,
  leaveTurma,
  updateTurma,
  fetchDiscoverTurmas,
  fetchCreatorStats,
  fetchCommunityContentStats,
} from './turmaCrud';

// Members & Ranking
export {
  fetchTurmaMembersWithStats,
  fetchTurmaRanking,
  fetchTurmaRole,
  fetchTurmaMembers,
  changeMemberRole,
  removeMember,
  toggleSubscriber,
} from './turmaMembers';

// Content (hierarchy, decks, ratings)
export {
  fetchTurmaSemesters,
  fetchTurmaSubjects,
  fetchTurmaLessons,
  fetchTurmaDecks,
  toggleDeckPublished,
  createSemester,
  deleteSemester,
  createSubject,
  updateSubject,
  deleteSubject,
  createLesson,
  deleteLesson,
  updateLesson,
  updateLessonContent,
  shareDeck,
  updateDeckPricing,
  unshareDeck,
  reorderSubjects,
  reorderTurmaDecks,
  reorderTurmaFiles,
  reorderTurmaExams,
  fetchMyTurmaRating,
  submitTurmaRating,
  fetchAllTurmaRatings,
} from './turmaContent';

// Exams
export {
  fetchTurmaExams,
  fetchTurmaExamQuestions,
  createTurmaExam,
  addQuestionToExam,
  addQuestionsFromBank,
  addQuestionsFromDeck,
  publishTurmaExam,
  toggleExamSubscribersOnly,
  deleteTurmaExam,
  startTurmaExamAttempt,
  submitTurmaExamAnswers,
  submitTurmaExamAnswer,
  completeTurmaExamAttempt,
  fetchTurmaExamAttempts,
  fetchMyAttempts,
  fetchAttemptAnswers,
  restartTurmaExam,
} from './turmaExams';
