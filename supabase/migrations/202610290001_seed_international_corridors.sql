-- Corridors internationaux JotColis : créés désactivés jusqu'à validation juridique,
-- douanière, opérationnelle et support. Cette migration ne publie aucun trajet.
insert into public.corridors
  (origin_country_code, destination_country_code, origin_label, destination_label, is_active, validation_notes)
values
  ('FR','SN','France','Sénégal',false,'Corridor pilote proposé ; activation après validation opérationnelle et juridique.'),
  ('SN','FR','Sénégal','France',false,'Corridor pilote proposé ; activation après validation opérationnelle et juridique.'),
  ('ES','SN','Espagne','Sénégal',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('SN','ES','Sénégal','Espagne',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('IT','SN','Italie','Sénégal',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('SN','IT','Sénégal','Italie',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('US','SN','États-Unis','Sénégal',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('SN','US','Sénégal','États-Unis',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('AE','SN','Émirats arabes unis','Sénégal',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.'),
  ('SN','AE','Sénégal','Émirats arabes unis',false,'Nouveau corridor demandé ; validation douanière, juridique et opérationnelle requise.')
on conflict (origin_country_code, destination_country_code, origin_label, destination_label) do nothing;
