/**
 * Turma Service — Barrel export (Façade Pattern).
 * Re-exports all turma sub-modules for backward compatibility.
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
  fetchUserOwnTurma,
  fetchCommunityFolderInfo,
  createTurmaWithOwner,
  publishDecksToTurma,
  removeTurmaMember,
  ensureShareSlug,
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
