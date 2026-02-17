
-- Add unique constraint for upsert in claimMissionReward
ALTER TABLE public.user_missions
  ADD CONSTRAINT user_missions_user_mission_period_key
  UNIQUE (user_id, mission_id, period_start);

-- Seed mission_definitions with default missions
INSERT INTO public.mission_definitions (key, title, description, icon, category, target_type, target_value, reward_credits, sort_order, is_active) VALUES
  -- Daily
  ('daily_study_5',   'Estudar 5 cards',    'Estude pelo menos 5 cards hoje',        'book-open', 'daily',       'cards_studied',      5,   3, 1, true),
  ('daily_study_20',  'Estudar 20 cards',   'Estude pelo menos 20 cards hoje',       'book-open', 'daily',       'cards_studied',      20,  5, 2, true),
  ('daily_study_50',  'Maratonista',        'Estude 50 cards em um dia',             'flame',     'daily',       'cards_studied',      50,  10, 3, true),
  ('daily_minutes_10','10 minutos de foco', 'Estude por pelo menos 10 minutos',      'clock',     'daily',       'minutes_studied',    10,  3, 4, true),
  ('daily_minutes_30','Sessão de 30 min',   'Estude por 30 minutos em um dia',       'clock',     'daily',       'minutes_studied',    30,  8, 5, true),
  -- Weekly
  ('weekly_100',      '100 cards na semana','Estude 100 cards durante a semana',      'zap',       'weekly',      'cards_studied_week', 100, 15, 10, true),
  ('weekly_300',      '300 cards na semana','Estude 300 cards durante a semana',      'zap',       'weekly',      'cards_studied_week', 300, 30, 11, true),
  -- Achievements
  ('ach_streak_3',    'Sequência de 3 dias','Mantenha uma sequência de 3 dias',       'flame',     'achievement', 'max_streak',         3,   10, 20, true),
  ('ach_streak_7',    'Semana perfeita',    'Mantenha uma sequência de 7 dias',       'trophy',    'achievement', 'max_streak',         7,   25, 21, true),
  ('ach_streak_30',   'Mestre da constância','30 dias seguidos estudando',            'crown',     'achievement', 'max_streak',         30,  50, 22, true),
  ('ach_cards_100',   'Centenário',         'Estude 100 cards no total',              'star',      'achievement', 'total_cards_studied', 100, 10, 23, true),
  ('ach_cards_500',   'Meio milhar',        'Estude 500 cards no total',              'award',     'achievement', 'total_cards_studied', 500, 25, 24, true),
  ('ach_cards_1000',  'Mestre dos cards',   'Estude 1000 cards no total',             'crown',     'achievement', 'total_cards_studied', 1000,50, 25, true),
  ('ach_decks_3',     'Colecionador',       'Crie pelo menos 3 decks',               'sparkles',  'achievement', 'decks_created',       3,  10, 26, true)
ON CONFLICT DO NOTHING;
