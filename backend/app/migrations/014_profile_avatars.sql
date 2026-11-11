-- 014_profile_avatars.sql
-- Store optional uploaded profile picture filename for user avatars.
ALTER TABLE profiles ADD COLUMN avatar_photo_filename TEXT NULL;
