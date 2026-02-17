-- Fix default energy for new users to 100 (PDF says "Cria conta → Recebe 100 Energy")
ALTER TABLE public.profiles ALTER COLUMN energy SET DEFAULT 100;
