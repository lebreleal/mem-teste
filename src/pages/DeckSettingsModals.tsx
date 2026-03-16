/**
 * DeckSettingsModals — All modal/dialog JSX extracted from DeckSettings.tsx.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronRight, Zap, Sparkles, Download, Copy,
  RotateCcw, Loader2, Plus, X, Shuffle, Mail, Package,
} from 'lucide-react';
// anki-logo removed

interface DeckSettingsModalsProps {
  deckId: string;
  name: string;
  setName: (v: string) => void;
  saving: boolean;
  algorithmMode: string;
  isDeckLockedByObjective: boolean;
  // Study settings
  dailyNewLimit: number;
  setDailyNewLimit: (v: number) => void;
  dailyReviewLimit: number;
  setDailyReviewLimit: (v: number) => void;
  shuffleCards: boolean;
  setShuffleCards: (v: boolean) => void;
  requestedRetention: number;
  setRequestedRetention: (v: number) => void;
  maxInterval: number;
  setMaxInterval: (v: number) => void;
  easyGraduatingInterval: number;
  setEasyGraduatingInterval: (v: number) => void;
  learningSteps: string[];
  addLearningStep: () => void;
  removeLearningStep: (i: number) => void;
  updateLearningStep: (i: number, v: string) => void;
  buryNewSiblings: boolean;
  setBuryNewSiblings: (v: boolean) => void;
  buryReviewSiblings: boolean;
  setBuryReviewSiblings: (v: boolean) => void;
  buryLearningSiblings: boolean;
  setBuryLearningSiblings: (v: boolean) => void;
  // Modal states
  algorithmModal: boolean;
  setAlgorithmModal: (v: boolean) => void;
  studySettingsModal: boolean;
  setStudySettingsModal: (v: boolean) => void;
  advancedModal: boolean;
  setAdvancedModal: (v: boolean) => void;
  renameModal: boolean;
  setRenameModal: (v: boolean) => void;
  shareModal: boolean;
  setShareModal: (v: boolean) => void;
  deleteConfirm: boolean;
  setDeleteConfirm: (v: boolean) => void;
  resetConfirm: boolean;
  setResetConfirm: (v: boolean) => void;
  exportModal: boolean;
  setExportModal: (v: boolean) => void;
  exportingCsv: boolean;
  exportingAnki: boolean;
  algorithmChangeTarget: 'fsrs' | 'quick_review' | null;
  setAlgorithmChangeTarget: (v: 'fsrs' | 'quick_review' | null) => void;
  // Handlers
  handleAlgorithmSwitch: (target: 'fsrs' | 'quick_review') => void;
  handleSwitchAndReset: () => Promise<void>;
  handleCopyWithAlgorithm: () => Promise<void>;
  handleSaveStudySettings: () => void;
  handleRename: () => void;
  handleResetProgress: () => Promise<void>;
  handleDelete: () => Promise<void>;
  handleExportCSV: () => Promise<void>;
  handleExportAnki: () => Promise<void>;
  toast: any;
}

const DeckSettingsModals = (props: DeckSettingsModalsProps) => {
  const {
    deckId, name, setName, saving, algorithmMode, isDeckLockedByObjective,
    dailyNewLimit, setDailyNewLimit, dailyReviewLimit, setDailyReviewLimit,
    shuffleCards, setShuffleCards, requestedRetention, setRequestedRetention,
    maxInterval, setMaxInterval, easyGraduatingInterval, setEasyGraduatingInterval,
    learningSteps, addLearningStep, removeLearningStep, updateLearningStep,
    buryNewSiblings, setBuryNewSiblings, buryReviewSiblings, setBuryReviewSiblings,
    buryLearningSiblings, setBuryLearningSiblings,
    algorithmModal, setAlgorithmModal, studySettingsModal, setStudySettingsModal,
    advancedModal, setAdvancedModal, renameModal, setRenameModal,
    shareModal, setShareModal, deleteConfirm, setDeleteConfirm,
    resetConfirm, setResetConfirm, exportModal, setExportModal,
    exportingCsv, exportingAnki,
    algorithmChangeTarget, setAlgorithmChangeTarget,
    handleAlgorithmSwitch, handleSwitchAndReset, handleCopyWithAlgorithm,
    handleSaveStudySettings, handleRename, handleResetProgress, handleDelete,
    handleExportCSV, handleExportAnki, toast,
  } = props;

  return (
    <>
      {/* Algorithm selection modal */}
      <Dialog open={algorithmModal} onOpenChange={setAlgorithmModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Modo de Estudo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all text-left ${
                algorithmMode === 'fsrs' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => handleAlgorithmSwitch('fsrs')}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                algorithmMode === 'fsrs' ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Sparkles className={`h-5 w-5 ${algorithmMode === 'fsrs' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">FSRS-6</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Padrão</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Algoritmo moderno com otimização automática.</p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                algorithmMode === 'fsrs' ? 'border-primary' : 'border-muted-foreground/30'
              }`}>
                {algorithmMode === 'fsrs' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
            </button>

            <button
              className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 transition-all text-left ${
                algorithmMode === 'quick_review' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
              onClick={() => handleAlgorithmSwitch('quick_review')}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                algorithmMode === 'quick_review' ? 'bg-primary/10' : 'bg-muted'
              }`}>
                <Zap className={`h-5 w-5 ${algorithmMode === 'quick_review' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground">Revisão rápida</p>
                <p className="text-xs text-muted-foreground">Revise sem programação, no seu próprio ritmo.</p>
              </div>
              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                algorithmMode === 'quick_review' ? 'border-primary' : 'border-muted-foreground/30'
              }`}>
                {algorithmMode === 'quick_review' && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Algorithm change confirmation */}
      <Dialog open={!!algorithmChangeTarget} onOpenChange={(open) => { if (!open) setAlgorithmChangeTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Trocar para {algorithmChangeTarget === 'fsrs' ? 'FSRS-6' : 'Revisão rápida'}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O progresso atual pode não ser compatível. Escolha como prosseguir:
          </p>
          <div className="space-y-3 pt-2">
            <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={handleSwitchAndReset}>
              <RotateCcw className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Trocar e redefinir progresso</p>
                <p className="text-xs text-muted-foreground">Todos os cards voltam ao estado "novo"</p>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-3 h-auto py-3" onClick={handleCopyWithAlgorithm}>
              <Copy className="h-4 w-4 shrink-0" />
              <div className="text-left">
                <p className="font-medium">Criar cópia com novo algoritmo</p>
                <p className="text-xs text-muted-foreground">Novo baralho criado, o atual permanece intacto</p>
              </div>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setAlgorithmChangeTarget(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Study settings modal */}
      <Dialog open={studySettingsModal} onOpenChange={setStudySettingsModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Configurações de Estudo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {isDeckLockedByObjective && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                Este deck está em objetivo ativo. Para editar os limites diários, remova-o primeiro em Meu Plano.
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Novos cartões por dia</Label>
              <Input
                type="number" min={0} max={999}
                value={dailyNewLimit}
                onChange={(e) => setDailyNewLimit(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 text-right font-semibold"
                disabled={isDeckLockedByObjective}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Máximo de revisões por dia</Label>
              <Input
                type="number" min={0} max={9999}
                value={dailyReviewLimit}
                onChange={(e) => setDailyReviewLimit(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 text-right font-semibold"
                disabled={isDeckLockedByObjective}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-muted-foreground" />
                <Label>Embaralhar cartões</Label>
              </div>
              <Switch checked={shuffleCards} onCheckedChange={setShuffleCards} disabled={isDeckLockedByObjective} />
            </div>

            {algorithmMode === 'fsrs' && (
              <>
                <Separator />
                <Button variant="outline" className="w-full" onClick={() => { setStudySettingsModal(false); setAdvancedModal(true); }} disabled={isDeckLockedByObjective}>
                  Configurações avançadas (FSRS)
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
              </>
            )}

            <Button className="w-full" onClick={handleSaveStudySettings} disabled={saving || isDeckLockedByObjective}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Advanced settings modal */}
      <Dialog open={advancedModal} onOpenChange={setAdvancedModal}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Configurações avançadas (FSRS)</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-foreground">Retenção desejada</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Probabilidade alvo de lembrar um cartão ao revisá-lo. Valores mais altos = intervalos menores.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range" min={70} max={99}
                  value={Math.round(requestedRetention * 100)}
                  onChange={(e) => setRequestedRetention(parseInt(e.target.value) / 100)}
                  className="flex-1 accent-primary"
                />
                <span className="text-lg font-bold text-foreground w-14 text-right">{Math.round(requestedRetention * 100)}%</span>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Intervalo máximo</Label>
              <div className="relative">
                <Input type="number" min={1} max={36500} value={maxInterval} onChange={(e) => setMaxInterval(Math.max(1, parseInt(e.target.value) || 36500))} className="pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">dias</span>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <div>
                <Label>Intervalo do Fácil (graduação)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Intervalo máximo ao apertar "Fácil" em um card novo ou em aprendizado.
                </p>
              </div>
              <div className="relative">
                <Input type="number" min={1} max={365} value={easyGraduatingInterval} onChange={(e) => setEasyGraduatingInterval(Math.max(1, parseInt(e.target.value) || 15))} className="pr-12" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">dias</span>
              </div>
            </div>
            <Separator />
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-foreground">Etapas de aprendizado</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Duração fixa de cada revisão durante a fase de aprendizado.
                </p>
              </div>
              {learningSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16">Etapa {i + 1}:</span>
                  <Input value={step} onChange={(e) => updateLearningStep(i, e.target.value)} className="flex-1" placeholder="Ex: 1m, 15m, 1h" />
                  {learningSteps.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLearningStep(i)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full gap-1" onClick={addLearningStep}>
                <Plus className="h-3.5 w-3.5" /> Adicionar etapa
              </Button>
            </div>
            <Separator />
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-foreground">Ocultar irmãos cloze</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Ao revisar um card cloze, seus irmãos são ocultados até o dia seguinte conforme o estado.
                </p>
              </div>
              <div className="space-y-2 pl-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Ocultar novos irmãos</span>
                  <Switch checked={buryNewSiblings} onCheckedChange={setBuryNewSiblings} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Ocultar irmãos de revisão</span>
                  <Switch checked={buryReviewSiblings} onCheckedChange={setBuryReviewSiblings} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">Ocultar irmãos em aprendizado</span>
                  <Switch checked={buryLearningSiblings} onCheckedChange={setBuryLearningSiblings} />
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={handleSaveStudySettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename modal */}
      <Dialog open={renameModal} onOpenChange={setRenameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Renomear baralho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameModal(false)}>Cancelar</Button>
              <Button onClick={handleRename} disabled={!name.trim() || saving}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share modal */}
      <Dialog open={shareModal} onOpenChange={setShareModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Compartilhar baralho</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Convide pessoas para estudar este baralho enviando um convite por e-mail.
            </p>
            <div className="space-y-2">
              <Label>E-mail do convidado</Label>
              <div className="flex gap-2">
                <Input placeholder="email@exemplo.com" type="email" />
                <Button className="gap-1.5 shrink-0">
                  <Mail className="h-4 w-4" />
                  Enviar
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Link de convite</Label>
              <div className="flex gap-2">
                <Input readOnly value={`${window.location.origin}/invite/${deckId}`} className="text-xs" />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${deckId}`);
                    toast({ title: 'Link copiado!' });
                  }}
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Qualquer pessoa com o link poderá acessar este baralho.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export modal */}
      <Dialog open={exportModal} onOpenChange={setExportModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Exportar cartões</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <button
              className="flex w-full items-center gap-4 rounded-xl border-2 border-border p-4 transition-all text-left hover:border-primary/50 hover:bg-primary/5"
              onClick={handleExportCSV}
              disabled={exportingCsv || exportingAnki}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                {exportingCsv ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Download className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">Exportar como CSV</p>
                <p className="text-xs text-muted-foreground">Baixar arquivo separado por vírgulas</p>
              </div>
            </button>
            <button
              className="flex w-full items-center gap-4 rounded-xl border-2 border-border p-4 transition-all text-left hover:border-primary/50 hover:bg-primary/5"
              onClick={handleExportAnki}
              disabled={exportingCsv || exportingAnki}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted p-1.5">
                {exportingAnki ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Package className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">Exportar como Anki</p>
                <p className="text-xs text-muted-foreground">Arquivo .apkg compatível com Anki</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset progress confirmation */}
      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Redefinir progresso?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os cards voltarão ao estado "novo". O histórico de revisões será mantido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetProgress}>Redefinir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Excluir "{name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os cards e registros de revisão serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DeckSettingsModals;
