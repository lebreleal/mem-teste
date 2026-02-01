-- Seed gallery_images with initial images
-- These are the images that were previously hardcoded in the site

INSERT INTO public.gallery_images (name, url, category, is_active, order_position) VALUES
('Ledbras Outdoor', '/src/assets/ledbras_outdoor.png', 'products', true, 1),
('Ledbras Rental', '/src/assets/ledbras_rental.png', 'products', true, 2),
('Painel LED Porta Aberta', '/src/assets/painel led porta aberta.jpg', 'projects', true, 3),
('Case Painel LED', '/src/assets/case painel led.jpg', 'projects', true, 4),
('Projeto Painel LED 1', '/src/assets/projeto painel led 1.jpg', 'projects', true, 5),
('Projeto Painel LED 2', '/src/assets/projeto painel LED 2.jpg', 'projects', true, 6),
('Projeto Painel LED 1.2', '/src/assets/projeto painel led 1.2.jpg', 'projects', true, 7),
('Container', '/src/assets/conteiner.png', 'general', true, 8),
('Fábrica Painel LED', '/src/assets/imagem fabrica paine led.jpg', 'general', true, 9),
('Painel LED Outdoor', '/src/assets/painel led outdoor.jpg', 'general', true, 10),
('Painel LED Aluguel', '/src/assets/painel led aluguel.jpg', 'general', true, 11),
('Embalagem Painel LED', '/src/assets/embalagem 2 painel led case.jpg', 'general', true, 12)
ON CONFLICT DO NOTHING;