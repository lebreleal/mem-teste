/**
 * TurmaDetail page — thin orchestrator that wraps TurmaDetailProvider.
 */

import { TurmaDetailProvider, useTurmaDetail } from '@/components/turma-detail/TurmaDetailContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, FileText, Users } from 'lucide-react';
import CommunitySettingsDialog from '@/components/community/CommunitySettingsDialog';
import TurmaHeader from '@/components/turma-detail/TurmaHeader';
import TurmaSubHeader from '@/components/turma-detail/TurmaSubHeader';
import ContentTab from '@/components/turma-detail/ContentTab';
import ExamsTab from '@/components/turma-detail/ExamsTab';
import MembersTab from '@/components/turma-detail/MembersTab';
import {
  CreateSubjectDialog, CreateLessonDialog,
  EditSubjectDialog, EditLessonDialog,
} from '@/components/turma-detail/TurmaDialogs';

const TurmaDetailInner = () => {
  const ctx = useTurmaDetail();
  const {
    turmaId, turma, members, subjects, lessons, turmaDecks, lessonFiles,
    isAdmin, isMod, canEdit, user,
    hasSubscription, isSubscriber, activeSubscription, subscriptionPrice, subscribing, handleSubscribe,
    contentFolderId, setContentFolderId, examFolderId, setExamFolderId,
    contentBreadcrumb, examBreadcrumb, lessonDates, lessonDateMap,
    mutations, examMutations, updateTurma, turmaExams,
    showSettings, setShowSettings,
    showAddSubject, setShowAddSubject, showAddLesson, setShowAddLesson,
    newName, setNewName, newDesc, setNewDesc,
    newLessonDate, setNewLessonDate, newLessonPublished, setNewLessonPublished,
    editingSubject, setEditingSubject, editingLesson, setEditingLesson,
    editItemName, setEditItemName, editLessonDate, setEditLessonDate,
    handleCreateSubject, handleCreateLesson, handleImportExam,
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
        isSubscriber={isSubscriber}
        activeSubscription={activeSubscription}
        subscriptionPrice={subscriptionPrice}
        subscribing={subscribing}
        onSubscribe={handleSubscribe}
        onShowSettings={() => setShowSettings(true)}
        lessonDates={lessonDates}
        lessonDateMap={lessonDateMap}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl">
        <Tabs defaultValue="content" className="space-y-4">
          <TabsList className="w-full grid grid-cols-3 bg-transparent border-b border-border/50 rounded-none h-auto p-0">
            <TabsTrigger value="content" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
              <Layers className="h-3.5 w-3.5" /> Conteúdo
            </TabsTrigger>
            <TabsTrigger value="exams" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
              <FileText className="h-3.5 w-3.5" /> Provas
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2.5">
              <Users className="h-3.5 w-3.5" /> Membros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content">
            <ContentTab
              turmaId={turmaId}
              contentFolderId={contentFolderId}
              setContentFolderId={setContentFolderId}
              breadcrumb={contentBreadcrumb}
              subjects={subjects}
              lessons={lessons}
              turmaDecks={turmaDecks}
              lessonFiles={lessonFiles}
              canEdit={canEdit}
              canCreateSubject={isAdmin || isMod}
              canCreateLesson={isAdmin || isMod}
              isAdmin={isAdmin}
              mutations={mutations}
              onShowAddSubject={() => { setShowAddSubject(true); setNewName(''); setNewDesc(''); }}
              onShowAddLesson={() => { setShowAddLesson('current'); setNewName(''); setNewDesc(''); setNewLessonDate(''); setNewLessonPublished(true); }}
              onEditSubject={(s) => { setEditingSubject(s); setEditItemName(s.name); }}
              onEditLesson={(l) => { setEditingLesson(l); setEditItemName(l.name); setEditLessonDate(l.lesson_date || ''); }}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="exams">
            <ExamsTab
              turmaId={turmaId}
              examFolderId={examFolderId}
              setExamFolderId={setExamFolderId}
              breadcrumb={examBreadcrumb}
              subjects={subjects}
              turmaExams={turmaExams}
              isAdmin={isAdmin}
              isMod={isMod}
              isSubscriber={isSubscriber || !!activeSubscription}
              userId={user?.id}
              mutations={mutations}
              examMutations={examMutations}
              onImportExam={handleImportExam}
              toast={toast}
            />
          </TabsContent>

          <TabsContent value="members">
            <MembersTab
              members={members}
              userId={user?.id}
              isAdmin={isAdmin}
              mutations={mutations}
              toast={toast}
            />
          </TabsContent>
        </Tabs>
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
        date={newLessonDate} onDateChange={setNewLessonDate}
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
        date={editLessonDate} onDateChange={setEditLessonDate}
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
