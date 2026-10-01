/* Run with sqlcmd or SSMS.  The normal program uses the database specified by DB_NAME. */
IF DB_ID(N'DynamicAmbulanceDispatch') IS NULL
    CREATE DATABASE DynamicAmbulanceDispatch;
GO
USE DynamicAmbulanceDispatch;
GO

IF OBJECT_ID(N'dbo.Hospitals', N'U') IS NULL
CREATE TABLE dbo.Hospitals (
    HospitalID INT NOT NULL CONSTRAINT PK_Hospitals PRIMARY KEY,
    HospitalName VARCHAR(50) NOT NULL CONSTRAINT UQ_Hospitals_Name UNIQUE,
    Location VARCHAR(100) NULL
);

IF OBJECT_ID(N'dbo.HospitalRoutes', N'U') IS NULL
CREATE TABLE dbo.HospitalRoutes (
    SourceHospitalID INT NOT NULL,
    DestinationHospitalID INT NOT NULL,
    IsConnected BIT NOT NULL,
    Casualties INT NOT NULL,
    Weight INT NOT NULL,
    CONSTRAINT PK_HospitalRoutes PRIMARY KEY (SourceHospitalID, DestinationHospitalID),
    CONSTRAINT FK_Routes_Source FOREIGN KEY (SourceHospitalID) REFERENCES dbo.Hospitals(HospitalID),
    CONSTRAINT FK_Routes_Destination FOREIGN KEY (DestinationHospitalID) REFERENCES dbo.Hospitals(HospitalID)
);

IF OBJECT_ID(N'dbo.Patients', N'U') IS NULL
CREATE TABLE dbo.Patients (
    PatientID INT NOT NULL CONSTRAINT PK_Patients PRIMARY KEY,
    Name VARCHAR(50) NOT NULL, Age INT NOT NULL, BloodGroup VARCHAR(5) NOT NULL,
    Gender CHAR(1) NULL, Address VARCHAR(100) NULL, Condition VARCHAR(100) NULL,
    VaccinesDone CHAR(1) NOT NULL, AreaOfTreatment VARCHAR(50) NOT NULL,
    Insurance VARCHAR(5) NOT NULL, PhoneNumber VARCHAR(15) NOT NULL,
    HospitalAssignedID INT NULL, OptimalCost DECIMAL(12,2) NOT NULL,
    Severity DECIMAL(5,2) NOT NULL, CurrentTreatmentCost DECIMAL(12,2) NOT NULL,
    TotalExpenditure DECIMAL(12,2) NOT NULL,
    CONSTRAINT FK_Patients_Hospitals FOREIGN KEY (HospitalAssignedID) REFERENCES dbo.Hospitals(HospitalID)
);

IF OBJECT_ID(N'dbo.Ambulances', N'U') IS NULL
CREATE TABLE dbo.Ambulances (
    AmbulanceID INT NOT NULL CONSTRAINT PK_Ambulances PRIMARY KEY,
    CurrentHospitalID INT NOT NULL, Status VARCHAR(16) NOT NULL, Fuel INT NOT NULL,
    CONSTRAINT CK_Ambulances_Fuel CHECK (Fuel BETWEEN 0 AND 100),
    CONSTRAINT FK_Ambulances_Hospitals FOREIGN KEY (CurrentHospitalID) REFERENCES dbo.Hospitals(HospitalID)
);

IF OBJECT_ID(N'dbo.AmbulanceTimeline', N'U') IS NULL
CREATE TABLE dbo.AmbulanceTimeline (
    TimelineID BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AmbulanceTimeline PRIMARY KEY,
    AmbulanceID INT NOT NULL, EventTime DATETIME2 NOT NULL, EventType VARCHAR(40) NOT NULL,
    Message VARCHAR(500) NOT NULL,
    CONSTRAINT FK_Timeline_Ambulances FOREIGN KEY (AmbulanceID) REFERENCES dbo.Ambulances(AmbulanceID)
);

IF OBJECT_ID(N'dbo.HospitalFeedback', N'U') IS NULL
CREATE TABLE dbo.HospitalFeedback (
    FeedbackID BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HospitalFeedback PRIMARY KEY,
    HospitalID INT NOT NULL, Rating INT NOT NULL, FeedbackText VARCHAR(500) NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    CONSTRAINT CK_HospitalFeedback_Rating CHECK (Rating BETWEEN 1 AND 5),
    CONSTRAINT FK_Feedback_Hospitals FOREIGN KEY (HospitalID) REFERENCES dbo.Hospitals(HospitalID)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Patients_HospitalAssignedID' AND object_id = OBJECT_ID(N'dbo.Patients'))
    CREATE INDEX IX_Patients_HospitalAssignedID ON dbo.Patients(HospitalAssignedID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_HospitalFeedback_HospitalID' AND object_id = OBJECT_ID(N'dbo.HospitalFeedback'))
    CREATE INDEX IX_HospitalFeedback_HospitalID ON dbo.HospitalFeedback(HospitalID);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AmbulanceTimeline_AmbulanceID_EventTime' AND object_id = OBJECT_ID(N'dbo.AmbulanceTimeline'))
    CREATE INDEX IX_AmbulanceTimeline_AmbulanceID_EventTime ON dbo.AmbulanceTimeline(AmbulanceID, EventTime);
GO

MERGE dbo.Hospitals AS target
USING (VALUES
 (1,'1.Suguna_Hospital(rajajinagar)','rajajinagar'), (2,'2.Aster_CMI_Hospital(sahakarnagar)','sahakarnagar'),
 (3,'3.MS_Ramaiah_Hospital(sanjaynagar)','sanjaynagar'), (4,'4.People''s_Tree_Hospital(yeshwanthpur)','yeshwanthpur'),
 (5,'5.Fortis_Hospital(nagarbhavi)','nagarbhavi'), (6,'6.Appolo_Hospital(bannerghatta)','bannerghatta'),
 (7,'7.HCG_Hospital(shantinagar)','shantinagar'), (8,'8.Cloudnine_Hospital(marathahalli)','marathahalli'),
 (9,'9.Columbia_Asia(sarjapur)','sarjapur'), (10,'10.Sagar_Hospital(jayanagar)','jayanagar'),
 (11,'11.Narayana_Hrudayalaya(bommasandra)','bommasandra'), (12,'12.Manipal_Hospital(whitefield)','whitefield'),
 (13,'13.Koshys_Hospital(krishnarajapuram)','krishnarajapuram'), (14,'14.Sparsh_Hospital(yelahanka)','yelahanka'),
 (15,'15.BGS_Gleneagles_Hospital(kengeri)','kengeri')
) AS source(HospitalID,HospitalName,Location)
ON target.HospitalID=source.HospitalID
WHEN MATCHED THEN UPDATE SET HospitalName=source.HospitalName, Location=source.Location
WHEN NOT MATCHED THEN INSERT (HospitalID,HospitalName,Location) VALUES (source.HospitalID,source.HospitalName,source.Location);
GO

MERGE dbo.HospitalRoutes AS target
USING (VALUES
    (1,1,1,38,3),(1,2,0,29,0),(1,3,1,38,8),(1,4,1,43,7),(1,5,1,37,7),(1,6,0,36,0),(1,7,1,27,7),(1,8,0,33,0),(1,9,0,28,0),(1,10,0,46,0),(1,11,0,38,0),(1,12,0,37,0),(1,13,0,33,0),(1,14,0,29,0),(1,15,0,26,0),
    (2,1,0,38,0),(2,2,1,29,3),(2,3,1,38,6),(2,4,1,43,6),(2,5,0,37,0),(2,6,0,36,0),(2,7,0,27,0),(2,8,0,33,0),(2,9,0,28,0),(2,10,0,46,0),(2,11,0,38,0),(2,12,0,37,0),(2,13,1,33,7),(2,14,1,29,5),(2,15,0,26,0),
    (3,1,1,38,8),(3,2,1,29,6),(3,3,1,38,3),(3,4,1,43,7),(3,5,0,37,0),(3,6,0,36,0),(3,7,0,27,0),(3,8,0,33,0),(3,9,0,28,0),(3,10,0,46,0),(3,11,0,38,0),(3,12,0,37,0),(3,13,0,33,0),(3,14,0,29,0),(3,15,0,26,0),
    (4,1,1,38,7),(4,2,1,29,6),(4,3,1,38,7),(4,4,1,43,3),(4,5,1,37,8),(4,6,0,36,0),(4,7,0,27,0),(4,8,0,33,0),(4,9,0,28,0),(4,10,0,46,0),(4,11,0,38,0),(4,12,0,37,0),(4,13,0,33,0),(4,14,0,29,0),(4,15,0,26,0),
    (5,1,1,38,7),(5,2,0,29,0),(5,3,0,38,0),(5,4,1,43,8),(5,5,1,37,3),(5,6,0,36,0),(5,7,0,27,0),(5,8,0,33,0),(5,9,0,28,0),(5,10,0,46,0),(5,11,0,38,0),(5,12,0,37,0),(5,13,0,33,0),(5,14,0,29,0),(5,15,1,26,5),
    (6,1,0,38,0),(6,2,0,29,0),(6,3,0,38,0),(6,4,0,43,0),(6,5,0,37,0),(6,6,1,36,3),(6,7,0,27,0),(6,8,0,33,0),(6,9,0,28,0),(6,10,1,46,5),(6,11,1,38,9),(6,12,0,37,0),(6,13,0,33,0),(6,14,0,29,0),(6,15,1,26,7),
    (7,1,1,38,7),(7,2,0,29,0),(7,3,0,38,0),(7,4,0,43,0),(7,5,0,37,0),(7,6,0,36,0),(7,7,1,27,3),(7,8,1,33,9),(7,9,0,28,0),(7,10,1,46,7),(7,11,0,38,0),(7,12,0,37,0),(7,13,0,33,0),(7,14,0,29,0),(7,15,0,26,0),
    (8,1,0,38,0),(8,2,0,29,0),(8,3,0,38,0),(8,4,0,43,0),(8,5,0,37,0),(8,6,0,36,0),(8,7,1,27,9),(8,8,1,33,3),(8,9,1,28,6),(8,10,0,46,0),(8,11,0,38,0),(8,12,1,37,6),(8,13,0,33,0),(8,14,0,29,0),(8,15,0,26,0),
    (9,1,0,38,0),(9,2,0,29,0),(9,3,0,38,0),(9,4,0,43,0),(9,5,0,37,0),(9,6,0,36,0),(9,7,0,27,0),(9,8,1,33,6),(9,9,1,28,3),(9,10,1,46,6),(9,11,0,38,0),(9,12,0,37,0),(9,13,0,33,0),(9,14,0,29,0),(9,15,0,26,0),
    (10,1,0,38,0),(10,2,0,29,0),(10,3,0,38,0),(10,4,0,43,0),(10,5,0,37,0),(10,6,1,36,5),(10,7,1,27,7),(10,8,0,33,0),(10,9,1,28,6),(10,10,1,46,3),(10,11,0,38,0),(10,12,0,37,0),(10,13,0,33,0),(10,14,0,29,0),(10,15,0,26,0),
    (11,1,0,38,0),(11,2,0,29,0),(11,3,0,38,0),(11,4,0,43,0),(11,5,0,37,0),(11,6,1,36,9),(11,7,0,27,0),(11,8,0,33,0),(11,9,0,28,0),(11,10,0,46,0),(11,11,1,38,3),(11,12,0,37,0),(11,13,0,33,0),(11,14,0,29,0),(11,15,0,26,0),
    (12,1,0,38,0),(12,2,0,29,0),(12,3,0,38,0),(12,4,0,43,0),(12,5,0,37,0),(12,6,0,36,0),(12,7,0,27,0),(12,8,1,33,6),(12,9,0,28,0),(12,10,0,46,0),(12,11,0,38,0),(12,12,1,37,3),(12,13,1,33,6),(12,14,0,29,0),(12,15,0,26,0),
    (13,1,0,38,0),(13,2,1,29,7),(13,3,0,38,0),(13,4,0,43,0),(13,5,0,37,0),(13,6,0,36,0),(13,7,0,27,0),(13,8,0,33,0),(13,9,0,28,0),(13,10,0,46,0),(13,11,0,38,0),(13,12,1,37,6),(13,13,1,33,3),(13,14,1,29,6),(13,15,0,26,0),
    (14,1,0,38,0),(14,2,1,29,5),(14,3,0,38,0),(14,4,0,43,0),(14,5,0,37,0),(14,6,0,36,0),(14,7,0,27,0),(14,8,0,33,0),(14,9,0,28,0),(14,10,0,46,0),(14,11,0,38,0),(14,12,0,37,0),(14,13,1,33,6),(14,14,1,29,3),(14,15,0,26,0),
    (15,1,0,38,0),(15,2,0,29,0),(15,3,0,38,0),(15,4,0,43,0),(15,5,1,37,5),(15,6,1,36,7),(15,7,0,27,0),(15,8,0,33,0),(15,9,0,28,0),(15,10,0,46,0),(15,11,0,38,0),(15,12,0,37,0),(15,13,0,33,0),(15,14,0,29,0),(15,15,1,26,3)
) AS source(SourceHospitalID,DestinationHospitalID,IsConnected,Casualties,Weight)
ON target.SourceHospitalID=source.SourceHospitalID AND target.DestinationHospitalID=source.DestinationHospitalID
WHEN MATCHED THEN UPDATE SET IsConnected=source.IsConnected,Casualties=source.Casualties,Weight=source.Weight
WHEN NOT MATCHED THEN INSERT (SourceHospitalID,DestinationHospitalID,IsConnected,Casualties,Weight) VALUES (source.SourceHospitalID,source.DestinationHospitalID,source.IsConnected,source.Casualties,source.Weight);
GO

MERGE dbo.Ambulances AS target
USING (VALUES (1,14,'available',97),(2,2,'available',19),(3,14,'available',25),(4,4,'available',97),(5,14,'available',18),(6,6,'available',13),(7,1,'available',13),(8,12,'available',17),(9,9,'available',88),(10,10,'available',23),(11,15,'available',21),(12,12,'available',24),(13,13,'available',26),(14,14,'available',20),(15,15,'available',10),(16,15,'available',18),(17,3,'available',96),(18,6,'available',96),(19,4,'available',100),(20,14,'available',97)) AS source(AmbulanceID,CurrentHospitalID,Status,Fuel)
ON target.AmbulanceID=source.AmbulanceID
WHEN NOT MATCHED THEN INSERT (AmbulanceID,CurrentHospitalID,Status,Fuel) VALUES (source.AmbulanceID,source.CurrentHospitalID,source.Status,source.Fuel);
GO
