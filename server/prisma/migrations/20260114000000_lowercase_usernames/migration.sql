-- Convert all existing usernames to lowercase
UPDATE "User" SET username = LOWER(username);

-- Add a check constraint to ensure all usernames are lowercase
ALTER TABLE "User" ADD CONSTRAINT username_lowercase CHECK (username = LOWER(username));
