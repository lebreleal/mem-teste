-- 1) Empty front but a cloze statement in the back -> real cloze card
UPDATE public.cards
SET front_content = back_content,
    back_content = '{"clozeTarget":1,"extra":""}',
    card_type = 'cloze',
    updated_at = now()
WHERE trim(coalesce(front_content, '')) = ''
  AND back_content ~ '\{\{c[0-9]+::';

-- 2) Basic card whose ANSWER carries cloze markers -> promote to cloze
UPDATE public.cards
SET front_content = back_content,
    back_content = '{"clozeTarget":1,"extra":""}',
    card_type = 'cloze',
    updated_at = now()
WHERE card_type = 'basic'
  AND back_content ~ '\{\{c[0-9]+::'
  AND front_content !~ '\{\{c[0-9]+::';

-- 3) Unrecoverable empty cards -> delete (review logs first)
DELETE FROM public.review_logs
WHERE card_id IN (
  SELECT id FROM public.cards WHERE trim(coalesce(front_content, '')) = ''
);

DELETE FROM public.cards
WHERE trim(coalesce(front_content, '')) = '';