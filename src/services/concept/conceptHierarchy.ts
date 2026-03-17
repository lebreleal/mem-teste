/**
 * conceptHierarchy — Medical taxonomy, categories, subcategories, prerequisite mapping.
 * Extracted from globalConceptService.ts (copy-paste integral).
 */
import { supabase } from '@/integrations/supabase/client';
import { conceptSlug } from './conceptCrud';

// ── Row interfaces ──

interface ConceptRow {
  id: string;
  name: string;
  slug: string;
  parent_concept_id: string | null;
}

// ── Typed table helper for global_concepts (not in generated types) ──
const gcTable = () => supabase.from('global_concepts' as 'turmas');

// ─── Medical taxonomy (Estratégia MED / Medway / SanarFlix standard) ───
export const MEDICAL_CATEGORIES = [
  'Clínica Médica',
  'Cirurgia',
  'Ginecologia e Obstetrícia',
  'Pediatria',
  'Medicina Preventiva',
] as const;

export type MedicalCategory = typeof MEDICAL_CATEGORIES[number];

export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
  'Clínica Médica': [
    'Cardiologia', 'Pneumologia', 'Gastroenterologia', 'Endocrinologia',
    'Nefrologia', 'Reumatologia', 'Hematologia', 'Infectologia',
    'Neurologia', 'Dermatologia', 'Psiquiatria', 'Geriatria',
    'Medicina Intensiva', 'Emergência Clínica',
  ],
  'Cirurgia': [
    'Cirurgia Geral', 'Cirurgia do Trauma', 'Cirurgia Vascular',
    'Urologia', 'Ortopedia', 'Neurocirurgia', 'Cirurgia Torácica',
    'Cirurgia Plástica', 'Otorrinolaringologia', 'Oftalmologia',
    'Anestesiologia', 'Cirurgia do Aparelho Digestivo',
  ],
  'Ginecologia e Obstetrícia': [
    'Obstetrícia', 'Ginecologia', 'Pré-natal', 'Parto',
    'Puerpério', 'Oncologia Ginecológica', 'Reprodução Humana',
    'Mastologia', 'Planejamento Familiar',
  ],
  'Pediatria': [
    'Neonatologia', 'Puericultura', 'Infectologia Pediátrica',
    'Pneumologia Pediátrica', 'Gastroenterologia Pediátrica',
    'Cardiologia Pediátrica', 'Neurologia Pediátrica',
    'Imunizações', 'Emergência Pediátrica', 'Nutrologia Pediátrica',
  ],
  'Medicina Preventiva': [
    'Epidemiologia', 'Bioestatística', 'SUS', 'Políticas de Saúde',
    'Saúde do Trabalhador', 'Vigilância Epidemiológica',
    'Atenção Primária', 'Saúde da Família', 'Ética Médica',
    'Medicina Legal', 'Medicina Baseada em Evidências',
  ],
};

// ─── Map prerequisites via AI (batch) ───────────
export async function mapPrerequisitesViaAI(userId: string): Promise<number> {
  const { data: all } = await gcTable()
    .select('id, name, slug, parent_concept_id')
    .eq('user_id', userId);

  if (!all || all.length < 2) return 0;

  const concepts = all as unknown as ConceptRow[];
  const names = concepts.map(c => c.name);

  const { data, error } = await supabase.functions.invoke('map-prerequisites', {
    body: { conceptNames: names },
  });

  if (error || data?.error) {
    throw new Error(data?.error ?? error?.message ?? 'Failed to map prerequisites');
  }

  const pairs: { concept: string; prerequisite: string }[] = data?.pairs ?? [];
  const siblingGroups: { parent_name: string; parent_exists: boolean; children: string[] }[] = data?.sibling_groups ?? [];

  // Build name→id map (case-insensitive)
  const nameToId = new Map<string, string>();
  for (const c of concepts) {
    nameToId.set(c.name.toLowerCase(), c.id);
  }

  let updated = 0;

  // Handle sibling groups first — create parent concepts if needed
  for (const group of siblingGroups) {
    if (!group.children || group.children.length === 0) continue;

    let parentId = nameToId.get(group.parent_name.toLowerCase());

    // If parent doesn't exist, create it
    if (!parentId && !group.parent_exists) {
      const slug = conceptSlug(group.parent_name);
      const { data: inserted } = await gcTable()
        .upsert({
          user_id: userId,
          name: group.parent_name.trim(),
          slug,
        } as Record<string, unknown>, { onConflict: 'user_id,slug', ignoreDuplicates: true })
        .select('id')
        .maybeSingle();

      if (inserted) {
        parentId = (inserted as unknown as { id: string }).id;
        nameToId.set(group.parent_name.toLowerCase(), parentId!);
      } else {
        // Re-fetch in case of upsert conflict
        const { data: existing } = await gcTable()
          .select('id')
          .eq('user_id', userId)
          .eq('slug', slug)
          .maybeSingle();
        if (existing) {
          parentId = (existing as unknown as { id: string }).id;
          nameToId.set(group.parent_name.toLowerCase(), parentId!);
        }
      }
    }

    if (!parentId) continue;

    // Set parent_concept_id for each child
    for (const childName of group.children) {
      const childId = nameToId.get(childName.toLowerCase());
      if (!childId || childId === parentId) continue;

      // Only set if not already set
      const existing = concepts.find(c => c.id === childId);
      if (existing?.parent_concept_id) continue;

      await gcTable()
        .update({ parent_concept_id: parentId, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', childId);
      updated++;
    }
  }

  // Handle direct prerequisite pairs
  for (const pair of pairs) {
    const conceptId = nameToId.get(pair.concept.toLowerCase());
    const prereqId = nameToId.get(pair.prerequisite.toLowerCase());
    if (!conceptId || !prereqId || conceptId === prereqId) continue;

    // Only set if not already set
    const existing = concepts.find(c => c.id === conceptId);
    if (existing?.parent_concept_id) continue;

    await gcTable()
      .update({ parent_concept_id: prereqId, updated_at: new Date().toISOString() } as Record<string, unknown>)
      .eq('id', conceptId);
    updated++;
  }

  return updated;
}
