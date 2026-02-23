-- Community missions
INSERT INTO mission_definitions (key, title, description, icon, category, target_value, target_type, reward_credits, sort_order, is_active)
VALUES
  ('community_first_suggestion', 'Primeira Contribuição', 'Envie sua primeira sugestão de correção em um Deck Vivo', 'sparkles', 'achievement', 1, 'suggestions_made', 15, 30, true),
  ('community_5_accepted', 'Colaborador Ativo', 'Tenha 5 sugestões aceitas por criadores', 'award', 'achievement', 5, 'suggestions_accepted', 30, 31, true),
  ('community_10_accepted', 'Colaborador Expert', 'Tenha 10 sugestões aceitas por criadores', 'crown', 'achievement', 10, 'suggestions_accepted', 50, 32, true);