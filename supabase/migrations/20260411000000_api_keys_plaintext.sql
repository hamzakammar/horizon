-- Store the plaintext API key so it can be shown again on new devices.
-- The key_hash column is still used for gateway validation (sha256 lookup).
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_value text;
