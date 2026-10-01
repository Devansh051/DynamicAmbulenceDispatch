# Database Integration & Compatibility Report

## 1. SQL Server Schema Audit

The persistent data source is Microsoft SQL Server (SQLEXPRESS instance on local port 1433).
The database name is `DynamicAmbulanceDispatch`.

### Verified Table Schema

| Table Name | Primary Key | Foreign Keys | Row Count | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `dbo.Hospitals` | `HospitalID` (INT) | None | 15 | Hospital registry with facility name and locality |
| `dbo.HospitalRoutes` | `(SourceHospitalID, DestinationHospitalID)` | `Hospitals(HospitalID)` | 225 | Directed graph edges, connectivity, casualty level, and road weights |
| `dbo.Ambulances` | `AmbulanceID` (INT) | `Hospitals(HospitalID)` | 20 | Fleet state, current station, status (`available`/`busy`), fuel (0–100) |
| `dbo.AmbulanceTimeline`| `TimelineID` (BIGINT IDENTITY) | `Ambulances(AmbulanceID)`| 26 | Historical dispatch and status transition audit events |
| `dbo.HospitalFeedback` | `FeedbackID` (BIGINT IDENTITY) | `Hospitals(HospitalID)` | 7 | Patient and visitor ratings (1–5) and review text |
| `dbo.Patients` | `PatientID` (INT) | `Hospitals(HospitalID)` | 9 | Patient records, clinical condition, severity, insurance, billing |

---

## 2. Sequelize Model Mapping Strategy

All Sequelize models are mapped **strictly non-destructively**:
- `timestamps: false`: Disables Sequelize default `createdAt` / `updatedAt` injection.
- `freezeTableName: true`: Prevents Sequelize from auto-pluralizing or altering table names.
- Explicit `schema: 'dbo'`: Guarantees consistent schema targeting.
- No `sequelize.sync({ force: true })` or `sequelize.sync({ alter: true })`: The ORM treats the existing tables as canonical and immutable.

### Model-to-Schema Mapping Reference

| SQL Server Column | SQL Data Type | Sequelize Attribute | Nullable | Constraints / Defaults |
| :--- | :--- | :--- | :--- | :--- |
| **dbo.Hospitals** | | | | |
| `HospitalID` | `INT` | `DataTypes.INTEGER` | NO | Primary Key |
| `HospitalName` | `VARCHAR(50)` | `DataTypes.STRING(50)` | NO | Unique |
| `Location` | `VARCHAR(100)` | `DataTypes.STRING(100)` | YES | |
| **dbo.HospitalRoutes** | | | | |
| `SourceHospitalID` | `INT` | `DataTypes.INTEGER` | NO | Composite PK, FK to Hospitals |
| `DestinationHospitalID`| `INT` | `DataTypes.INTEGER` | NO | Composite PK, FK to Hospitals |
| `IsConnected` | `BIT` | `DataTypes.BOOLEAN` | NO | |
| `Casualties` | `INT` | `DataTypes.INTEGER` | NO | |
| `Weight` | `INT` | `DataTypes.INTEGER` | NO | |
| **dbo.Ambulances** | | | | |
| `AmbulanceID` | `INT` | `DataTypes.INTEGER` | NO | Primary Key |
| `CurrentHospitalID` | `INT` | `DataTypes.INTEGER` | NO | FK to Hospitals |
| `Status` | `VARCHAR(16)` | `DataTypes.STRING(16)` | NO | |
| `Fuel` | `INT` | `DataTypes.INTEGER` | NO | Check (0–100) |
| **dbo.AmbulanceTimeline** | | | | |
| `TimelineID` | `BIGINT IDENTITY` | `DataTypes.BIGINT` | NO | Primary Key, Auto-increment |
| `AmbulanceID` | `INT` | `DataTypes.INTEGER` | NO | FK to Ambulances |
| `EventTime` | `DATETIME2` | `DataTypes.DATE` | NO | Default: NOW |
| `EventType` | `VARCHAR(40)` | `DataTypes.STRING(40)` | NO | |
| `Message` | `VARCHAR(500)` | `DataTypes.STRING(500)` | NO | |
| **dbo.HospitalFeedback** | | | | |
| `FeedbackID` | `BIGINT IDENTITY` | `DataTypes.BIGINT` | NO | Primary Key, Auto-increment |
| `HospitalID` | `INT` | `DataTypes.INTEGER` | NO | FK to Hospitals |
| `Rating` | `INT` | `DataTypes.INTEGER` | NO | Check (1–5) |
| `FeedbackText` | `VARCHAR(500)` | `DataTypes.STRING(500)` | NO | |
| `CreatedAt` | `DATETIME2` | `DataTypes.DATE` | NO | Default: NOW |
| **dbo.Patients** | | | | |
| `PatientID` | `INT` | `DataTypes.INTEGER` | NO | Primary Key |
| `Name` | `VARCHAR(50)` | `DataTypes.STRING(50)` | NO | |
| `Age` | `INT` | `DataTypes.INTEGER` | NO | |
| `BloodGroup` | `VARCHAR(5)` | `DataTypes.STRING(5)` | NO | |
| `Gender` | `CHAR(1)` | `DataTypes.CHAR(1)` | YES | |
| `Address` | `VARCHAR(100)` | `DataTypes.STRING(100)` | YES | |
| `Condition` | `VARCHAR(100)` | `DataTypes.STRING(100)` | YES | |
| `VaccinesDone` | `CHAR(1)` | `DataTypes.CHAR(1)` | NO | |
| `AreaOfTreatment` | `VARCHAR(50)` | `DataTypes.STRING(50)` | NO | |
| `Insurance` | `VARCHAR(5)` | `DataTypes.STRING(5)` | NO | |
| `PhoneNumber` | `VARCHAR(15)` | `DataTypes.STRING(15)` | NO | |
| `HospitalAssignedID` | `INT` | `DataTypes.INTEGER` | YES | FK to Hospitals |
| `OptimalCost` | `DECIMAL(12,2)` | `DataTypes.DECIMAL(12,2)`| NO | |
| `Severity` | `DECIMAL(5,2)` | `DataTypes.DECIMAL(5,2)` | NO | |
| `CurrentTreatmentCost` | `DECIMAL(12,2)`| `DataTypes.DECIMAL(12,2)`| NO | |
| `TotalExpenditure` | `DECIMAL(12,2)` | `DataTypes.DECIMAL(12,2)`| NO | |

---

## 3. Dual-Access Architectural Coexistence

Both the legacy C++ binary and the modern Node.js application access the exact same SQL Server database concurrently:

```
                  +-----------------------------------+
                  |   Microsoft SQL Server Engine     |
                  |    (DynamicAmbulanceDispatch)     |
                  +-----------------+-----------------+
                                    |
                 +------------------+------------------+
                 |                                     |
                 v                                     v
     [ODBC Driver 18 - C++]              [Tedious / Sequelize - Node.js]
  Windows Integrated Security            SQL Server Authentication (ems_user)
  `Trusted_Connection=Yes`               Port 1433, Encrypt: Yes
  Used by: hospital_mssql.exe            Used by: Express Backend Server
```

### Verified Connectivity
1. **Legacy C++ Binary**: Connects via ODBC Driver 18 with Windows Integrated Authentication; verified by compiling and running `hospital_mssql.exe`.
2. **Node.js Backend**: Connects via `tedious` driver with SQL Server Authentication using dedicated login `ems_user`; verified via `npm test` and `http://localhost:5000/api/health`.
3. **No destructive migrations**: Zero tables were dropped, recreated, or altered.
