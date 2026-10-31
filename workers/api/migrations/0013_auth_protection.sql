-- Les empreintes permettent de révoquer une session sans stocker son jeton.
CREATE TABLE auth_revocations (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_revocations_expiration ON auth_revocations(expires_at);

-- Une ligne par fenêtre et adresse hachée ; aucune adresse IP n'est conservée.
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts_expiration ON login_attempts(expires_at);
