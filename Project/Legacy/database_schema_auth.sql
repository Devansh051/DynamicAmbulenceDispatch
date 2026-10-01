/* =========================================================================
   Phase 2 Authentication and User Management Schema
   Database: DynamicAmbulanceDispatch
   Non-destructive: safe to re-run; will not alter existing legacy tables.
   ========================================================================= */

USE DynamicAmbulanceDispatch;
GO

-- 1. Users table
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        email VARCHAR(255) NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
        name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NULL,
        role VARCHAR(30) NOT NULL CONSTRAINT DF_Users_Role DEFAULT 'DISPATCHER',
        status VARCHAR(20) NOT NULL CONSTRAINT DF_Users_Status DEFAULT 'PENDING',
        email_verified BIT NOT NULL CONSTRAINT DF_Users_EmailVerified DEFAULT 0,
        must_change_password BIT NOT NULL CONSTRAINT DF_Users_MustChangePassword DEFAULT 0,
        approved_at DATETIME2 NULL,
        approved_by INT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT GETDATE(),
        CONSTRAINT CK_Users_Role CHECK (role IN ('ADMIN', 'DISPATCHER', 'AMBULANCE_CREW', 'HOSPITAL_OPERATOR')),
        CONSTRAINT CK_Users_Status CHECK (status IN ('ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED', 'REJECTED')),
        CONSTRAINT FK_Users_ApprovedBy FOREIGN KEY (approved_by) REFERENCES dbo.Users(id)
    );
    PRINT 'Created table dbo.Users';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_Role' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE INDEX IX_Users_Role ON dbo.Users(role);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_Status' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE INDEX IX_Users_Status ON dbo.Users(status);
GO

-- 2. UserAuthIdentities table
IF OBJECT_ID(N'dbo.UserAuthIdentities', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserAuthIdentities (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserAuthIdentities PRIMARY KEY,
        user_id INT NOT NULL,
        provider VARCHAR(50) NOT NULL,
        provider_subject VARCHAR(255) NOT NULL,
        provider_email VARCHAR(255) NOT NULL,
        provider_email_verified BIT NOT NULL CONSTRAINT DF_UserAuthIdentities_EmailVerified DEFAULT 0,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_UserAuthIdentities_CreatedAt DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_UserAuthIdentities_UpdatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_UserAuthIdentities_Users FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE CASCADE,
        CONSTRAINT UQ_UserAuthIdentities_Provider_Subject UNIQUE (provider, provider_subject)
    );
    PRINT 'Created table dbo.UserAuthIdentities';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_UserAuthIdentities_UserId' AND object_id = OBJECT_ID(N'dbo.UserAuthIdentities'))
    CREATE INDEX IX_UserAuthIdentities_UserId ON dbo.UserAuthIdentities(user_id);
GO

-- 3. AuthAuditLogs table
IF OBJECT_ID(N'dbo.AuthAuditLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuthAuditLogs (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuthAuditLogs PRIMARY KEY,
        user_id INT NULL,
        event_type VARCHAR(60) NOT NULL,
        details VARCHAR(1000) NULL,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_AuthAuditLogs_CreatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_AuthAuditLogs_Users FOREIGN KEY (user_id) REFERENCES dbo.Users(id) ON DELETE SET NULL
    );
    PRINT 'Created table dbo.AuthAuditLogs';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthAuditLogs_UserId_CreatedAt' AND object_id = OBJECT_ID(N'dbo.AuthAuditLogs'))
    CREATE INDEX IX_AuthAuditLogs_UserId_CreatedAt ON dbo.AuthAuditLogs(user_id, created_at);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuthAuditLogs_EventType' AND object_id = OBJECT_ID(N'dbo.AuthAuditLogs'))
    CREATE INDEX IX_AuthAuditLogs_EventType ON dbo.AuthAuditLogs(event_type);
GO
