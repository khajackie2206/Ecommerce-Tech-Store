-- =============================================================================
-- Promote a registered account to admin.
-- The API never lets anyone register as admin, so the first admin is made here.
--
-- 1. Register the account normally (POST /api/v1/auth/register)
-- 2. Change the email below to that account's email
-- 3. Run:  npm run db:promote-admin
--    (or open this file in VS Code and run it against TechStoreDb)
-- 4. Log in again: the old token still says "customer"
-- =============================================================================
SET NOCOUNT ON;

DECLARE @email NVARCHAR(255) = N'binh@mail.com';

UPDATE Users
SET role = 'admin', updatedAt = SYSUTCDATETIME()
WHERE email = LOWER(@email);

IF @@ROWCOUNT = 0
  PRINT N'No user with email ' + @email + N' - register it first.';
ELSE
  PRINT N'Done: ' + @email + N' is now an admin.';

-- Every admin account
SELECT email, fullName, role, updatedAt FROM Users WHERE role = 'admin';
