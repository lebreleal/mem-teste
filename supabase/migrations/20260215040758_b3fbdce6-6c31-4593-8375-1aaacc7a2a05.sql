
-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4. RLS for user_roles (only admins can manage, users can read own)
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Create ai_prompts table
CREATE TABLE public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT '',
  system_prompt text NOT NULL DEFAULT '',
  user_prompt_template text NOT NULL DEFAULT '',
  default_model text NOT NULL DEFAULT 'flash',
  temperature numeric NOT NULL DEFAULT 0.7,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read prompts (edge functions need this)
CREATE POLICY "Authenticated can read prompts"
ON public.ai_prompts FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can modify
CREATE POLICY "Admins can manage prompts"
ON public.ai_prompts FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Seed the 6 AI prompts
INSERT INTO public.ai_prompts (feature_key, label, system_prompt, user_prompt_template, default_model, temperature) VALUES
('generate_deck', 'Gerar Deck', 'Você é um gerador de flashcards educacionais de alta qualidade.', 'REGRAS:
- Crie exatamente {{cardCount}} cartões.
- {{detailInstruction}}
- TUDO em PORTUGUÊS (ou na língua do material).
- Cubra conceitos-chave, definições, fatos e relações.
- Evite perguntas triviais ou vagas.
{{customInstructions}}

FORMATOS PERMITIDOS:
{{formatInstructions}}

MATERIAL:
{{material}}

FORMATO DE SAÍDA (apenas JSON array, sem texto extra):
[{"front":"...","back":"...","type":"basic ou cloze"},...]
Para type "multiple_choice", use:
{"front":"pergunta","back":"","type":"multiple_choice","options":["A","B","C","D"],"correctIndex":0}', 'flash', 0.4),

('enhance_card', 'Melhorar Card', 'Você é um especialista em criação de flashcards eficazes para estudo com repetição espaçada.

Sua tarefa: melhorar o flashcard fornecido pelo usuário, tornando-o mais claro, preciso e eficaz para memorização.

Regras:
- Mantenha o MESMO tema e conteúdo original
- Melhore a clareza, precisão e objetividade
- Use linguagem concisa mas completa
- Para perguntas, torne-as específicas e sem ambiguidade
- Para respostas, inclua os pontos essenciais sem excesso
- Mantenha HTML simples se necessário (negrito, itálico)
- NÃO mude o tipo do card
- Se o card já está excelente, retorne o mesmo conteúdo sem alterações e marque "unchanged" como true', 'Tipo: {{cardType}}
Frente: {{front}}
Verso: {{back}}', 'flash', 0.7),

('enhance_import', 'Melhorar Importação', 'Você é um assistente que corrige e melhora flashcards importados de CSVs malformados.

Sua tarefa:
1. Corrigir cards que foram quebrados por parsing ruim
2. Mesclar cards que pertencem ao mesmo par pergunta/resposta
3. Limpar formatação: remover aspas extras, espaços desnecessários
4. Garantir que cada card tenha frente e verso corretos
5. Manter o conteúdo original - NÃO reescreva nem resuma
6. Se um card tem frente mas verso vazio, e o próximo parece continuação, mescle-os

IMPORTANTE: Mantenha TODOS os cards válidos. Não remova conteúdo.', 'Corrija estes {{cardCount}} flashcards importados:\n\n{{cardsText}}', 'flash', 0.7),

('grade_exam', 'Corrigir Prova', '', 'Você é um avaliador de provas educacionais. Avalie a resposta do aluno comparando com a resposta esperada.

PERGUNTA: {{questionText}}
RESPOSTA ESPERADA: {{correctAnswer}}
RESPOSTA DO ALUNO: {{userAnswer}}

Avalie de 0 a 100 o quanto a resposta do aluno está correta. Considere:
- Conceitos-chave mencionados
- Precisão das informações
- Completude da resposta

Responda APENAS com JSON válido:
{
  "score": <0-100>,
  "feedback": "Feedback educativo em 2-3 frases explicando o que acertou e errou"
}', 'flash', 0.2),

('ai_tutor', 'Tutor IA', '', 'You are a study tutor helping a student learn with flashcards. Give a brief, helpful hint for the following flashcard question WITHOUT revealing the full answer. Guide the student''s thinking.

Question: {{front}}
{{backHint}}

Reply in the same language as the question. Keep it under 3 sentences.', 'flash', 0.5),

('generate_onboarding', 'Sugerir Matérias', 'Responda apenas com o tool call solicitado.', 'Você é um especialista em grade curricular universitária brasileira.

O aluno digitou:
- Curso: "{{course}}"
- Semestre: "{{semester}}"

Suas tarefas:
1. Corrija erros de digitação no nome do curso e semestre. Retorne os nomes corrigidos.
2. Gere a lista de 4-8 matérias típicas desse semestre nesse curso em universidades brasileiras.
3. Para cada matéria, gere APENAS 1 aula com nome genérico "Aula 1".
Use nomes curtos e diretos para as matérias.', 'flash', 0.3);
