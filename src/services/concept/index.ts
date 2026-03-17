/**
 * concept/ barrel — re-exports everything for backward compatibility.
 * import * as globalConceptService from '@/services/concept' works identically
 * to the old '@/services/globalConceptService'.
 */
export * from './conceptCrud';
export * from './conceptScheduling';
export * from './conceptQuestions';
export * from './conceptHierarchy';
