# Dynamic Ambulance Dispatch System — Complete Guide & Architecture

This document provides:
1. **Execution & Setup Guide**: How to run the project right now, and how anyone can set it up from scratch on a new machine.
2. **Architecture Transition**: How the project evolved from reading flat `.txt` files to a fully relational, ACID-compliant Microsoft SQL Server database using ODBC in C++.

---

## Part 1: How to Execute Now & Start-to-Finish Setup Guide

### 1. Quick Start (How to Run Right Now)
Since the SQL database is active on your machine and the binary is already compiled:

#### Option A: Run from Terminal (PowerShell / Command Prompt)
```powershell
# Navigate to the project directory
cd d:\DynamicAmbulenceDispatch\Project

# Execute the application
.\hospital_mssql.exe
```

#### Option B: Run Inside VS Code / Antigravity IDE
- Open the project folder in the IDE.
- Press **`F5`** (or go to **Run > Start Debugging**).
- A dedicated console window will open with the interactive menu.
- To recompile anytime, press **`Ctrl + Shift + B`** (uses [.vscode/tasks.json](.vscode/tasks.json)).

---

### 2. Setup From Scratch (For a New Machine or User)

If someone clones or downloads this repository on a completely fresh system, here are the step-by-step instructions:

#### Step 1: Install Prerequisites
1. **C++ Compiler**: GCC with C++17 support (e.g., [MSYS2 UCRT64](https://www.msys2.org/) or MinGW-w64). Ensure `g++` is added to Windows `PATH`.
2. **Database Engine**: Microsoft SQL Server (2019/2022 Developer or Express Edition).
3. **ODBC Driver**: [Microsoft ODBC Driver 18 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server).
4. **Command Line Utility**: `sqlcmd` (included with SQL Server command-line tools) or SQL Server Management Studio (SSMS).

#### Step 2: Create and Seed the Database
Run [database_schema.sql](database_schema.sql) to create the `DynamicAmbulanceDispatch` database, create all relational tables, and seed the default 15 hospitals, 225 route matrix entries, and 20 ambulances:

```powershell
# If using Windows Authentication (replace server instance if different):
sqlcmd -S "localhost\SQLEXPRESS" -E -C -i database_schema.sql
```
*(The `-C` flag trusts the server certificate for local encryption).*

#### Step 3: Configure Environment Variables
Create or verify the [.env](.env) file in the project root:
```env
DB_SERVER=localhost\SQLEXPRESS
DB_NAME=DynamicAmbulanceDispatch
DB_DRIVER=ODBC Driver 18 for SQL Server
DB_ENCRYPT=yes
DB_TRUST_SERVER_CERTIFICATE=yes
# Leave DB_USER and DB_PASSWORD blank/commented to use Windows Authentication:
# DB_USER=
# DB_PASSWORD=
```

#### Step 4: Import Legacy Historical Data (Run Once)
To import historical patient logs, ambulance statuses, feedback ratings, and timeline events from the text files in `legacy_text_files/`:

```powershell
# Compile the migration tool
g++ -std=c++17 -static -static-libgcc -static-libstdc++ migrate_existing_data.cpp database_repository.cpp -lodbc32 -o migrate_existing_data.exe

# Run the migration
.\migrate_existing_data.exe
```
> [!NOTE]
> Run this importer only once on a fresh database. Running it repeatedly would duplicate feedback entries and timeline history.

#### Step 5: Build the Main Application
Compile [hospital_final.cpp](hospital_final.cpp) together with [database_repository.cpp](database_repository.cpp) and the ODBC library:
```powershell
g++ -std=c++17 -static -static-libgcc -static-libstdc++ hospital_final.cpp database_repository.cpp -lodbc32 -o hospital_mssql.exe
```
*Why `-static -static-libgcc -static-libstdc++`?*  
It packages the C++ runtime libraries into the executable so it runs on any Windows machine without requiring MSYS2 DLLs.

#### Step 6: Launch the System
```powershell
.\hospital_mssql.exe
```

---

## Part 2: How the Code Transitioned from Text Files to SQL

### 1. Why Move Away from Flat Files?
The original implementation stored all records in flat files (`.txt`). While functional for simple demonstrations, text-based storage had serious architectural flaws:
- **No Concurrency / Race Conditions**: Reading and rewriting entire `.txt` files when an ambulance status changed or a patient registered risked file corruption.
- **Expensive I/O**: Searching or calculating statistics required reading and parsing every line into memory on each menu choice.
- **Parsing Fragility**: If a patient name or feedback contained a delimiter like `:` or `-`, the text parser broke.
- **No Data Integrity**: No foreign keys or constraints to prevent assigning non-existent hospitals or setting fuel beyond 0–100%.

---

### 2. The Legacy File-to-Database Mapping

All legacy `.txt` files were analyzed, normalized, and mapped to structured tables in [database_schema.sql](database_schema.sql):

| Legacy Text File | SQL Table | What Changed |
| :--- | :--- | :--- |
| `hospital_names.txt`, `hospital_locality.txt` | `dbo.Hospitals` | Primary key `HospitalID`, name, and location are stored in a single table with unique constraints. |
| `matrix.txt` (connectivity), `casualtiesMatrix.txt`, `weights.txt` (distance/cost) | `dbo.HospitalRoutes` | Instead of 3 separate 15x15 ASCII text grids, 225 rows store `(SourceHospitalID, DestinationHospitalID, IsConnected, Casualties, Weight)` with foreign key validation. |
| `ambulance_locations.txt` | `dbo.Ambulances` | Each ambulance has `AmbulanceID`, `CurrentHospitalID`, `Status`, and `Fuel` with `CHECK (Fuel BETWEEN 0 AND 100)`. |
| `patient_details.txt` | `dbo.Patients` | Replaced colon-delimited blocks (`Patient ID: ...`) with typed columns, indexed on `PatientID` and `HospitalAssignedID`. |
| `ambulance_timeline.txt` | `dbo.AmbulanceTimeline` | Sequential audit logs now use auto-incrementing `TimelineID BIGINT IDENTITY` with indexed `DATETIME2` timestamps. |
| `hospital_feedback.txt` | `dbo.HospitalFeedback` | Feedback strings and ratings (1–5) are stored relationally per hospital. |

---

### 3. Architectural Design: The Repository Pattern

To keep the application's dispatch algorithms (Floyd-Warshall, Dijkstra/BFS, OTP confirmation, Dijkstra route visualization) intact without breaking the user experience, the code adopted the **Repository Pattern**:

```
+-----------------------------------------------------------+
|                     hospital_final.cpp                    |
|  (User Interface, Floyd-Warshall, Routing, Dispatch Flow) |
+-----------------------------------------------------------+
                             |
                             | Calls clean C++ API
                             v
+-----------------------------------------------------------+
|              database_repository.h / .cpp                 |
|  (DatabaseRepository class: executes SQL queries via ODBC)|
+-----------------------------------------------------------+
                             |
                             | ODBC C API (sql.h, sqlext.h, odbc32)
                             v
+-----------------------------------------------------------+
|               Microsoft SQL Server Engine                 |
|  (DynamicAmbulanceDispatch database with tables & indexes)|
+-----------------------------------------------------------+
```

#### How the Code Updated Itself: Step-by-Step

#### A. Initializing the Connection Automatically
Instead of opening file handles with `fopen` or `std::ifstream`, the application now initializes an ODBC session at startup:
- `DatabaseRepository::connectFromEnvironment()` automatically loads connection parameters from `.env`.
- It allocates ODBC environment (`SQL_HANDLE_ENV`) and connection (`SQL_HANDLE_DBC`) handles.
- It builds a secure Windows connection string with `Driver={ODBC Driver 18 for SQL Server}`, `Encrypt=yes`, and `TrustServerCertificate=yes`.

#### B. Loading Graph Matrices on Startup
In [hospital_final.cpp](hospital_final.cpp):
```cpp
// OLD TEXT FILE APPROACH:
// readMatrixFromFile("matrix.txt", matrix);
// readMatrixFromFile("casualtiesMatrix.txt", casualtiesMatrix);
// readMatrixFromFile("weights.txt", weights);

// NEW SQL REPOSITORY APPROACH:
if (!database().loadHospitalData(matrix, casualtiesMatrix, weights, hospital_names)) {
    cout << "ERROR: Could not load hospital data from SQL Server." << endl;
    return 1;
}
```
Under the hood, `database().loadHospitalData(...)` runs:
```sql
SELECT HospitalID, HospitalName FROM Hospitals ORDER BY HospitalID;
SELECT SourceHospitalID, DestinationHospitalID, IsConnected, Casualties, Weight FROM HospitalRoutes;
```
It populates the 15×15 arrays in memory once. The routing algorithms continue to run at memory speeds.

#### C. Reading & Updating Ambulances
In the legacy code, reading ambulance states involved parsing lines of text and writing the entire file back out whenever fuel changed or status changed to `"busy"`.

Now:
- **Fetching**:
  ```cpp
  int readAmbulances(Ambulance ambulances[], int maxAmb) {
      return database().getAmbulances(ambulances, maxAmb);
  }
  ```
  Executes: `SELECT AmbulanceID, CurrentHospitalID, Status, Fuel FROM Ambulances ORDER BY AmbulanceID`.
- **Atomic Dispatch Update**:
  When an ambulance is dispatched, `database().dispatchAmbulance(...)` runs an **atomic SQL transaction**:
  1. Starts transaction: `SQLSetConnectAttr(connection_, SQL_ATTR_AUTOCOMMIT, SQL_AUTOCOMMIT_OFF)`.
  2. Updates `Ambulances` with new location, status (`"busy"`), and decremented fuel.
  3. Inserts an event record into `AmbulanceTimeline`.
  4. Commits the transaction. Both changes succeed or fail together.

#### D. Patient Management and Statistics
- **Checking Existence**:
  Replaced scanning `patient_details.txt` with:
  ```sql
  SELECT 1 FROM Patients WHERE PatientID = ?
  ```
- **Insert Patient**:
  Uses parameterized `SQLBindParameter` to prevent SQL injection and guarantee typed storage (`VARCHAR`, `INT`, `DECIMAL`).
- **Real-Time Statistics**:
  Instead of iterating over text files with counters, `database().getPatientStatistics(...)` executes:
  ```sql
  SELECT COUNT(*),
         SUM(CASE WHEN VaccinesDone = 'Y' THEN 1 ELSE 0 END),
         SUM(CASE WHEN Insurance = 'Yes' THEN 1 ELSE 0 END),
         AVG(CAST(OptimalCost AS FLOAT))
  FROM Patients;
  ```

#### E. Hospital Ratings and Feedback
- Storing reviews:
  ```sql
  INSERT INTO HospitalFeedback (HospitalID, Rating, FeedbackText, CreatedAt)
  VALUES (?, ?, ?, SYSUTCDATETIME());
  ```
- Calculating average star rating:
  ```sql
  SELECT AVG(CAST(Rating AS FLOAT)) FROM HospitalFeedback WHERE HospitalID = ?;
  ```

---

## Summary of Key Benefits

1. **Zero Text File Dependency for Daily Operations**: Text files are archived in `legacy_text_files/` and only used if you run the one-time migration script.
2. **ACID Transactions**: Ambulance updates and timeline events never become out of sync.
3. **Data Integrity**: Enforced by primary keys, foreign keys, and check constraints at the database level.
4. **Clean Code Separation**: All SQL syntax and ODBC handle management is contained within [database_repository.cpp](database_repository.cpp); [hospital_final.cpp](hospital_final.cpp) only invokes clean, idiomatic C++ functions.
