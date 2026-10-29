-- Kalem ölçü birimleri (Adet / Palet / Koli…). Var olan satırlara dokunulmaz.
INSERT INTO "units" ("id", "name", "isSystem", "createdAt")
SELECT 'u_' || left(md5(v.name), 22), v.name, true, CURRENT_TIMESTAMP
FROM (VALUES
  ('Adet'),
  ('Kutu'),
  ('Paket'),
  ('Koli'),
  ('Palet'),
  ('Set'),
  ('Takım'),
  ('Çift'),
  ('Metre'),
  ('Metrekare (m²)'),
  ('Metreküp (m³)'),
  ('Santimetre (cm)'),
  ('Milimetre (mm)'),
  ('Kilogram (kg)'),
  ('Gram (g)'),
  ('Ton'),
  ('Litre'),
  ('Mililitre (ml)'),
  ('Rulo'),
  ('Bidon'),
  ('Varil'),
  ('Torba'),
  ('Makara')
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM "units" u WHERE lower(u.name) = lower(v.name)
);
