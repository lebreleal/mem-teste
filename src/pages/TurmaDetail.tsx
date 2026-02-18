/**
 * TurmaDetail page — thin orchestrator that wraps TurmaDetailProvider.
 */

import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import CommunitySettingsDialog from '@/components/community/CommunitySettingsDialog';
import TurmaHeader from '@/components/turma-detail/TurmaHeader';
import TurmaSubHeader from '@/components/turma-detail/TurmaSubHeader';
import ContentTab from '@/components/turma-detail/ContentTab';
import {
  CreateSubjectDialog, CreateLessonDialog,
  EditSubjectDialog, EditLessonDialog,
} from '@/components/turma-detail/TurmaDialogs';

const TurmaDetailInner = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, members, subjects, lessons, turmaDecks, turmaExams, lessonFiles,
    isAdmin, isMod, canEdit, user,
    hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing, handleSubscribe,
    contentFolderId, setContentFolderId,
    contentBreadcrumb, lessonDates, lessonDateMap,
    mutations, updateTurma,
    showSettings, setShowSettings,
    showAddSubject, setShowAddSubject, showAddLesson, setShowAddLesson,
    newName, setNewName, newDesc, setNewDesc,
    newLessonDate, setNewLessonDate, newLessonPublished, setNewLessonPublished,
    editingSubject, setEditingSubject, editingLesson, setEditingLesson,
    editItemName, setEditItemName, editLessonDate, setEditLessonDate,
    handleCreateSubject, handleCreateLesson,
    toast,
  } = ctx;

  if (!turma) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Turma não encontrada</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TurmaHeader />

      <TurmaSubHeader
        turmaId={turmaId}
        turmaName={turma.name}
        inviteCode={turma.invite_code}
        isAdmin={isAdmin}
        hasSubscription={hasSubscription}
        hasExclusiveContent={
          turmaDecks.some((d: any) => d.price_type && d.price_type !== 'free') ||
          turmaExams.some((e: any) => e.subscribers_only) ||
          (lessonFiles as any[]).some((f: any) => f.price_type && f.price_type !== 'free')
        }
        isSubscriber={isSubscriber}
        activeSubscription={activeSubscription}
        subscriptionPrice={subscriptionPrice}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onShowSettings={() => setShowSettings(true)}
        members={members}
        userId={user?.id}
        mutations={mutations}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <ContentTab />
      </main>

      <CommunitySettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        turma={turma}
        members={members.map(m => ({ user_id: m.user_id, user_name: m.user_name, role: m.role, is_subscriber: m.is_subscriber }))}
        onSave={({ name, description, isPrivate, coverImageUrl, subscriptionPrice }) => {
          updateTurma.mutate({ turmaId, name, description, isPrivate, coverImageUrl, subscriptionPrice }, {
            onSuccess: () => { setShowSettings(false); toast({ title: 'Comunidade atualizada!' }); },
            onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
          });
        }}
        isSaving={updateTurma.isPending}
      />

      <CreateSubjectDialog
        open={showAddSubject} onOpenChange={setShowAddSubject}
        name={newName} onNameChange={setNewName}
        desc={newDesc} onDescChange={setNewDesc}
        onSubmit={handleCreateSubject} isPending={mutations.createSubject.isPending}
      />
      <CreateLessonDialog
        open={!!showAddLesson} onOpenChange={open => !open && setShowAddLesson(null)}
        name={newName} onNameChange={setNewName}
        isPublished={newLessonPublished} onPublishedChange={setNewLessonPublished}
        onSubmit={handleCreateLesson} isPending={mutations.createLesson.isPending}
      />
      <EditSubjectDialog
        open={!!editingSubject} onOpenChange={open => !open && setEditingSubject(null)}
        name={editItemName} onNameChange={setEditItemName}
        onSubmit={() => {
          mutations.updateSubject.mutate({ id: editingSubject!.id, name: editItemName.trim() }, {
            onSuccess: () => { setEditingSubject(null); toast({ title: 'Nome atualizado!' }); },
            onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
          });
        }}
        isPending={mutations.updateSubject.isPending}
      />
      <EditLessonDialog
        open={!!editingLesson} onOpenChange={open => !open && setEditingLesson(null)}
        name={editItemName} onNameChange={setEditItemName}
        onSubmit={() => {
          mutations.updateLesson.mutate({ id: editingLesson!.id, name: editItemName.trim(), lessonDate: editLessonDate || null }, {
            onSuccess: () => { setEditingLesson(null); toast({ title: 'Atualizado!' }); },
            onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
          });
        }}
        isPending={mutations.updateLesson.isPending}
      />
    </div>
  );
};

const TurmaDetail = () => (
  <TurmaDetailProvider>
    <TurmaDetailInner />
  </TurmaDetailProvider>
);

export default TurmaDetail;
